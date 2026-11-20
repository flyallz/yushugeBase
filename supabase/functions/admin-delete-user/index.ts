// supabase/functions/admin-delete-user/index.ts
// 玉书阁多教师升级 · admin-delete-user Edge Function（新建，迁移 16）
// 超管删除账号的第二步：先以调用者身份调数据清理 RPC，成功后再用 Admin API 删 Auth 用户。
//
// 与 register-student / register-teacher 的关键区别：
//   - 本函数必须以 JWT 校验开启部署（verify_jwt = true，默认值）：删账号是超管操作，
//     前端调用时必须带 Authorization: Bearer <session access_token>；
//     注册函数是公开接口才关校验，本函数关了等于谁都能删号，绝对不能关。
//   - 调用者身份由网关校验的 JWT 决定；函数内再用该 JWT 调 RPC，RPC 里的
//     ntc_is_admin() 是第二道门（双重校验）。
//
// 调用方式（hoc-tap.html，超管控制台）：
//   POST ${SUPABASE_CONFIG.url}/functions/v1/admin-delete-user
//   Headers: Content-Type: application/json, apikey: <publishableKey>,
//            Authorization: Bearer <session.access_token>
//   Body: { user_id, kind }
//   kind = 'student'：user_id 是学生 Auth UUID → 调 ntc_admin_delete_student_data
//   kind = 'teacher'：user_id 是 teachers.id（老师行主键，不是 Auth UUID）
//                      → 调 ntc_admin_delete_teacher，RPC 返回 auth_user_id 供删号
//   成功：{ ok: true, kind, user_id, auth_user_id, auth_deleted, storage_deleted,
//           storage_error, rpc }
//   RPC 拒绝：HTTP 403 + { ok: false, error: "NOT_ADMIN", reason }
//             HTTP 400 + { ok: false, error: "RPC_REJECTED", reason, rpc }
//   Auth 删号失败：HTTP 500 + { ok: false, error: "AUTH_DELETE_FAILED",
//           data_deleted: true }（数据已清，登录账号还在，只能从后台 Auth 用户里再删）
//
// 顺序：① RPC 删数据行 → ② 删 student-homework 桶里该用户的文件
//       （前缀 <user_id>/ 与 teacher-feedback/<user_id>/）→ ③ 删 Auth 用户。
// ② 失败不阻断 ③：Storage 报错会记进 storage_error 返回，前端会提示复查；
//    ③ 失败则整个请求报 500，但数据已经删了（data_deleted: true），不可直接重试——
//    重试时 RPC 会因找不到老师/学生行而返回 NOT_FOUND。
// Storage 说明：cleanup-homework-files 的源码不在仓库里（live 函数源码丢失），
//   本函数不依赖它，直接用 service_role 的 Storage API 按前缀删；上传路径约定
//   见 hoc-tap.html / hsk5-lms.js / hsk346-lms.js：学生作业 <user_id>/<window_id>/…，
//   老师语音反馈 teacher-feedback/<user_id>/…。
//   list() 返回里文件夹的 id 为 null、文件有 id，以此区分递归；部署后须用一个
//   有作业文件的测试学生实测一次（见迁移 16 末尾的验证清单）。
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// 递归收集某前缀下的全部文件路径（list 只返回当前层，子目录 id 为 null）。
async function collectPaths(
  admin: any,
  bucket: string,
  prefix: string,
  out: string[],
): Promise<string | null> {
  let offset = 0;
  for (;;) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit: 100,
      offset,
    });
    if (error) return error.message || String(error);
    for (const entry of data || []) {
      const path = prefix ? prefix + "/" + entry.name : entry.name;
      if (entry.id === null || entry.id === undefined) {
        const err = await collectPaths(admin, bucket, path, out);
        if (err) return err;
      } else {
        out.push(path);
      }
    }
    if ((data || []).length < 100) break;
    offset += (data || []).length;
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }

  let payload: { user_id?: unknown; kind?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: "INVALID_JSON" }, 400);
  }
  const userId = String(payload.user_id ?? "").trim();
  const kind = String(payload.kind ?? "").trim();
  if (!userId) {
    return json({ ok: false, error: "INVALID_INPUT" }, 400);
  }
  if (kind !== "student" && kind !== "teacher") {
    return json({ ok: false, error: "INVALID_KIND" }, 400);
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json({ ok: false, error: "MISSING_AUTHORIZATION" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // 以调用者身份调 RPC（JWT 从请求头透传），ntc_is_admin() 在库里再验一遍。
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const rpcName = kind === "student"
    ? "ntc_admin_delete_student_data"
    : "ntc_admin_delete_teacher";
  const rpcParams = kind === "student"
    ? { p_user_id: userId }
    : { p_teacher_id: userId };
  const { data: rpcData, error: rpcError } = await caller.rpc(
    rpcName,
    rpcParams,
  );
  if (rpcError) {
    console.error("delete rpc failed", rpcName, rpcError);
    return json(
      { ok: false, error: "RPC_FAILED", detail: rpcError.message },
      500,
    );
  }
  if (!rpcData || rpcData.ok !== true) {
    const reason = String(rpcData?.reason || "RPC_REJECTED");
    if (reason === "NOT_ADMIN") {
      return json({ ok: false, error: "NOT_ADMIN", reason }, 403);
    }
    return json(
      { ok: false, error: "RPC_REJECTED", reason, rpc: rpcData },
      400,
    );
  }

  const authUserId = kind === "student"
    ? userId
    : String(rpcData.auth_user_id || "");
  if (!authUserId) {
    return json(
      { ok: false, error: "AUTH_USER_UNKNOWN", data_deleted: true },
      500,
    );
  }

  // Storage：只有学生需要清（老师本人不交作业）；kind=teacher 时跳过。
  let storageDeleted = 0;
  let storageError: string | null = null;
  if (kind === "student") {
    const paths: string[] = [];
    for (const prefix of [authUserId, "teacher-feedback/" + authUserId]) {
      const err = await collectPaths(
        admin,
        "student-homework",
        prefix,
        paths,
      );
      if (err) {
        storageError = err;
        break;
      }
    }
    if (!storageError && paths.length) {
      for (let i = 0; i < paths.length; i += 100) {
        const chunk = paths.slice(i, i + 100);
        const { error } = await admin.storage
          .from("student-homework")
          .remove(chunk);
        if (error) {
          storageError = error.message || String(error);
          break;
        }
        storageDeleted += chunk.length;
      }
    }
  }

  const { error: deleteErr } = await admin.auth.admin.deleteUser(authUserId);
  if (deleteErr) {
    const msg = deleteErr.message || "";
    // 账号已不在（例如之前删过一半）：数据已清，算成功。
    if (deleteErr.status === 404 || /not found/i.test(msg)) {
      return json({
        ok: true,
        kind,
        user_id: userId,
        auth_user_id: authUserId,
        auth_deleted: false,
        storage_deleted: storageDeleted,
        storage_error: storageError,
        rpc: rpcData,
      });
    }
    console.error("deleteUser failed", deleteErr);
    return json({
      ok: false,
      error: "AUTH_DELETE_FAILED",
      data_deleted: true,
      storage_deleted: storageDeleted,
      storage_error: storageError,
    }, 500);
  }

  return json({
    ok: true,
    kind,
    user_id: userId,
    auth_user_id: authUserId,
    auth_deleted: true,
    storage_deleted: storageDeleted,
    storage_error: storageError,
    rpc: rpcData,
  });
});
