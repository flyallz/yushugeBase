// supabase/functions/register-student/index.ts
// 玉书阁多教师升级 · register-student Edge Function（重写版）
// 原函数源码已丢失（明玉 0 基础、无源码），按前端调用约定重写。
//
// 前端约定（hoc-tap.html）：
//   POST ${SUPABASE_CONFIG.url}/functions/v1/register-student
//   Body: { fullName, email, classCode, password }
//   成功：{ ok: true } —— 账号等老师审批后才能用
//   邮箱已注册：HTTP 409 + { ok: false, error: "EMAIL_ALREADY_REGISTERED" }
//
// 注册链路（与数据库迁移配合）：
//   1. 本函数用 Admin API 建 Auth 用户：user_metadata 带 display_name +
//      class_code，app_metadata 带 role: "student"。
//   2. auth.users 上的 on_auth_user_created 触发器（05c）调
//      handle_new_user_profile（05b）自动建 profiles 行：
//      account_type "student"、approval_status "pending"。
//   3. profiles 上的 sync_profile_class_membership 触发器（09）自动在
//      class_members 里给学生登记班级。
//   所以“等老师审批”是唯一的开通关卡：审批前 profiles.approval_status
//   为 pending，各 RPC 会拒绝该账号。
//
// 注意：
//   - 本函数必须以 JWT 校验关闭部署（verify_jwt = false）：注册是公开
//     接口，前端调它时不带 Authorization 请求头（和线上原站一致）；
//     若校验开着，网关会直接以 401 "Missing authorization header"
//     拦掉，函数代码根本不会执行。2026-11-18 开发项目实测确认。
//   - email_confirm: true（建号即确认邮箱），不让邮件确认再卡一层；
//     若以后想改回邮件确认，把这里改 false 并让前端提示查收邮件。
//   - 班级码校验查 classes 表（07 回填 + ntc_create_class_v2 同步维护）。
//   - 本函数跑在 Supabase 服务端，用环境里的 SUPABASE_SERVICE_ROLE_KEY，
//     密钥只存在服务端，不进仓库、不进聊天。
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }

  let payload: {
    fullName?: unknown;
    email?: unknown;
    classCode?: unknown;
    password?: unknown;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: "INVALID_JSON" }, 400);
  }

  const fullName = String(payload.fullName ?? "").trim();
  const email = String(payload.email ?? "").trim().toLowerCase();
  const classCode = String(payload.classCode ?? "").trim().toUpperCase();
  const password = String(payload.password ?? "");

  if (!fullName) {
    return json({ ok: false, error: "MISSING_FULL_NAME" }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, error: "INVALID_EMAIL" }, 400);
  }
  if (!classCode) {
    return json({ ok: false, error: "MISSING_CLASS_CODE" }, 400);
  }
  if (password.length < 6) {
    return json({ ok: false, error: "PASSWORD_TOO_SHORT" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 班级必须存在（否则学生注册进来也没有班可归属）。
  const { data: cls, error: clsErr } = await admin
    .from("classes")
    .select("code")
    .eq("code", classCode)
    .maybeSingle();
  if (clsErr) {
    console.error("class lookup failed", clsErr);
    return json({ ok: false, error: "CLASS_LOOKUP_FAILED" }, 500);
  }
  if (!cls) {
    return json({ ok: false, error: "CLASS_NOT_FOUND" }, 400);
  }

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: fullName, class_code: classCode },
    app_metadata: { role: "student" },
  });

  if (error) {
    // Supabase 对已存在邮箱的报错文案是 "User already registered"。
    if (
      error.status === 422 ||
      /already (registered|exists)/i.test(error.message)
    ) {
      return json({ ok: false, error: "EMAIL_ALREADY_REGISTERED" }, 409);
    }
    console.error("createUser failed", error);
    return json({ ok: false, error: "CREATE_USER_FAILED" }, 500);
  }

  return json({ ok: true });
});
