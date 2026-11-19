// supabase/functions/register-teacher/index.ts
// 玉书阁多教师升级 · register-teacher Edge Function（新建）
// 老师自助入驻：填表 → 建号 → 待明玉审批后才能登录、用老师面板。
//
// 前端约定（hoc-tap.html，老师注册模式）：
//   POST ${SUPABASE_CONFIG.url}/functions/v1/register-teacher
//   Body: { displayName, email, slug, password }
//   成功：{ ok: true } —— 账号等管理员审批后才能用
//   标识已被占：HTTP 409 + { ok: false, error: "SLUG_TAKEN" }
//   邮箱已注册：HTTP 409 + { ok: false, error: "EMAIL_ALREADY_REGISTERED" }
//
// 注册链路（与迁移 10 配合）：
//   1. 本函数用 Admin API 建 Auth 用户：user_metadata 带 display_name，
//      app_metadata 带 role: "teacher"。
//   2. auth.users 上的 on_auth_user_created 触发器（05c）调
//      handle_new_user_profile（05b）自动建 profiles 行：
//      account_type "teacher"、approval_status "approved"（触发器对老师
//      默认批了——第 3 步再把它改回 pending，以 teachers 表为准）。
//   3. 本函数往 teachers 表插一行：is_active=false（待审批），并把
//      profiles.approval_status 改回 "pending"。
//   4. 明玉在老师面板里用 ntc_set_teacher_active 批了之后，老师才能
//      登录（hoc-tap.html 老师登录关只认 is_active 的 teachers 行），
//      批的同时 profiles 也会回到 "approved"。
//
// 注意：
//   - 本函数必须以 JWT 校验关闭部署（verify_jwt = false）：注册是公开
//     接口，前端调它时不带 Authorization 请求头（和 register-student
//     一致）；若校验开着，网关会直接以 401 "Missing authorization header"
//     拦掉，函数代码根本不会执行。2026-11-18 开发项目实测确认。
//   - email_confirm: true（建号即确认邮箱），不让邮件确认再卡一层。
//   - slug 是专属链接 /t/<slug> 的标识：只允许小写字母、数字、连字符，
//     3–32 字；大小写不敏感，去重按 lower(slug)。
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
    displayName?: unknown;
    email?: unknown;
    slug?: unknown;
    password?: unknown;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: "INVALID_JSON" }, 400);
  }

  const displayName = String(payload.displayName ?? "").trim();
  const email = String(payload.email ?? "").trim().toLowerCase();
  const slug = String(payload.slug ?? "").trim().toLowerCase();
  const password = String(payload.password ?? "");

  if (!displayName) {
    return json({ ok: false, error: "MISSING_DISPLAY_NAME" }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, error: "INVALID_EMAIL" }, 400);
  }
  if (!/^[a-z0-9][a-z0-9-]{2,31}$/.test(slug)) {
    return json({ ok: false, error: "INVALID_SLUG" }, 400);
  }
  if (password.length < 6) {
    return json({ ok: false, error: "PASSWORD_TOO_SHORT" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 专属链接标识不能重。
  const { data: slugRow, error: slugErr } = await admin
    .from("teachers")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (slugErr) {
    console.error("slug lookup failed", slugErr);
    return json({ ok: false, error: "SLUG_LOOKUP_FAILED" }, 500);
  }
  if (slugRow) {
    return json({ ok: false, error: "SLUG_TAKEN" }, 409);
  }

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
    app_metadata: { role: "teacher" },
  });

  if (error || !created.user) {
    // Supabase 对已存在邮箱的报错文案是 "User already registered"。
    if (
      error?.status === 422 ||
      /already (registered|exists)/i.test(error?.message ?? "")
    ) {
      return json({ ok: false, error: "EMAIL_ALREADY_REGISTERED" }, 409);
    }
    console.error("createUser failed", error);
    return json({ ok: false, error: "CREATE_USER_FAILED" }, 500);
  }

  // teachers 行：待审批。触发器已建好 profiles 行（老师默认 approved），
  // 这里改回 pending，以 teachers.is_active 为准。
  const { error: teacherErr } = await admin.from("teachers").insert({
    auth_user_id: created.user.id,
    email,
    display_name: displayName,
    slug,
    is_active: false,
  });
  if (teacherErr) {
    console.error("teachers insert failed", teacherErr);
    // 账号已建、老师行没写进去：删号，避免留一个没有老师身份的账号。
    await admin.auth.admin.deleteUser(created.user.id);
    if (/duplicate key/i.test(teacherErr.message)) {
      return json({ ok: false, error: "SLUG_TAKEN" }, 409);
    }
    return json({ ok: false, error: "TEACHER_CREATE_FAILED" }, 500);
  }

  const { error: profileErr } = await admin
    .from("profiles")
    .update({ approval_status: "pending" })
    .eq("user_id", created.user.id);
  if (profileErr) {
    console.error("profiles pending update failed", profileErr);
    // 不致命：登录关和 RPC 都以 teachers.is_active 为准，继续返回成功。
  }

  return json({ ok: true });
});
