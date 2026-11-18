-- 08_unify_teacher_check.sql
-- 玉书阁多教师升级 · 统一 teacher 判断，删掉硬编码邮箱
-- 目标库：开发项目 NGOCTHUCAC-LMS-v2-dev；执行顺序在 07 之后、09 之前。
--
-- 改了什么：
--  1. 三个 teacher 判断函数全部改成查 teachers 表（07 新建），不再看 JWT role、
--     不再看硬编码邮箱。改完之后，“是不是老师”只有一个事实来源。
--     - is_teacher()：SECURITY DEFINER（保持），供策略和存储策略调用。
--     - ntc_teacher()：保持非 SECURITY DEFINER；50 个 RPC 函数都调它，
--       改它一个，全部 RPC 自动继承新判断。
--     - homework_is_teacher()：保持非 SECURITY DEFINER；注意它查 teachers 表
--       时受 RLS 约束，所以 09 的 teachers 策略必须允许用户读到自己的行。
--  2. 05 里 11 条含硬编码邮箱的策略 + 含 JWT role 直判的策略，全部改写：
--     邮箱分支和 role 直判分支都换成 public.is_teacher()。
--     只改这 11+ 条策略，其余策略原样不动；每条改写都先 DROP 再 CREATE。
--  3. 05 文件本身不动（它是线上→开发的逐字复刻，留作回滚对照）。
--
-- 明确没做的事（见 08b，不是遗漏）：
--  老师“能看哪些班的数据”的按班过滤不在此文件。08 之后，任何老师仍能通过
--  RPC 和“teacher 可读全部”类策略看到全校数据——和单教师时代行为一致，
--  只是判断依据换成了 teachers 表。按班过滤是 08b 的工作，跨租户测试会验它。
--
-- 验证（执行后在 SQL Editor 跑）：
--   SELECT public.is_teacher();  -- 用老师账号调应为 true，学生账号调应为 false
--   SELECT count(*) FROM pg_policies WHERE schemaname='public'
--     AND policyname LIKE '%tailieutiengtrung%';  -- 预期 0（策略名不含邮箱）
--   SELECT count(*) FROM pg_policies WHERE schemaname='public'
--     AND pg_get_expr(polqual, polrelid) LIKE '%tailieutiengtrung%';  -- 预期 0

-- ============ 1. 三个函数：改成查 teachers 表 ============
CREATE OR REPLACE FUNCTION public.is_teacher()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.teachers
    where auth_user_id = auth.uid() and is_active
  );
$function$;

CREATE OR REPLACE FUNCTION public.ntc_teacher()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select auth.uid() is not null
    and exists (
      select 1 from public.teachers
      where auth_user_id = auth.uid() and is_active
    );
$function$;

CREATE OR REPLACE FUNCTION public.homework_is_teacher()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.teachers
    where auth_user_id = auth.uid() and is_active
  );
$function$;

-- ============ 2. 策略改写：邮箱分支 / role 直判 → public.is_teacher() ============
-- （以下语句由脚本从 05_functions_and_rls.sql 逐条转换生成；
-- 每条与原文的唯一差别就是这两个分支的替换，已逐条核对。）


-- ---- teacher can insert app settings ON public.app_settings (email x0, role x1) ----
DROP POLICY IF EXISTS "teacher can insert app settings" ON public.app_settings;
CREATE POLICY "teacher can insert app settings" ON public.app_settings
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (public.is_teacher());

-- ---- teacher can update app settings ON public.app_settings (email x0, role x2) ----
DROP POLICY IF EXISTS "teacher can update app settings" ON public.app_settings;
CREATE POLICY "teacher can update app settings" ON public.app_settings
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (public.is_teacher())
  WITH CHECK (public.is_teacher());

-- ---- teacher_can_read_all_writings ON public.daily_activity_writings (email x1, role x1) ----
DROP POLICY IF EXISTS "teacher_can_read_all_writings" ON public.daily_activity_writings;
CREATE POLICY "teacher_can_read_all_writings" ON public.daily_activity_writings
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR public.is_teacher()));

-- ---- teacher_can_update_writings ON public.daily_activity_writings (email x2, role x2) ----
DROP POLICY IF EXISTS "teacher_can_update_writings" ON public.daily_activity_writings;
CREATE POLICY "teacher_can_update_writings" ON public.daily_activity_writings
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((public.is_teacher()))
  WITH CHECK ((public.is_teacher()));

-- ---- teacher_read_all_daily_writings ON public.daily_activity_writings (email x1, role x1) ----
DROP POLICY IF EXISTS "teacher_read_all_daily_writings" ON public.daily_activity_writings;
CREATE POLICY "teacher_read_all_daily_writings" ON public.daily_activity_writings
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR public.is_teacher()));

-- ---- teacher_update_daily_writings ON public.daily_activity_writings (email x2, role x2) ----
DROP POLICY IF EXISTS "teacher_update_daily_writings" ON public.daily_activity_writings;
CREATE POLICY "teacher_update_daily_writings" ON public.daily_activity_writings
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((public.is_teacher()))
  WITH CHECK ((public.is_teacher()));

-- ---- teacher_read_hsk3_reviews ON public.hsk3_attempt_reviews (email x1, role x0) ----
DROP POLICY IF EXISTS "teacher_read_hsk3_reviews" ON public.hsk3_attempt_reviews;
CREATE POLICY "teacher_read_hsk3_reviews" ON public.hsk3_attempt_reviews
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR public.is_teacher()));

-- ---- ngoc_hsk4_review_select ON public.hsk4_attempt_reviews (email x1, role x0) ----
DROP POLICY IF EXISTS "ngoc_hsk4_review_select" ON public.hsk4_attempt_reviews;
CREATE POLICY "ngoc_hsk4_review_select" ON public.hsk4_attempt_reviews
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR public.is_teacher()));

-- ---- student reads own learning time ON public.learning_activity_totals (email x0, role x1) ----
DROP POLICY IF EXISTS "student reads own learning time" ON public.learning_activity_totals;
CREATE POLICY "student reads own learning time" ON public.learning_activity_totals
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR public.is_teacher()));

-- ---- teacher_can_read_all_profiles ON public.profiles (email x1, role x1) ----
DROP POLICY IF EXISTS "teacher_can_read_all_profiles" ON public.profiles;
CREATE POLICY "teacher_can_read_all_profiles" ON public.profiles
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR public.is_teacher()));

-- ---- teacher_can_update_profiles ON public.profiles (email x2, role x2) ----
DROP POLICY IF EXISTS "teacher_can_update_profiles" ON public.profiles;
CREATE POLICY "teacher_can_update_profiles" ON public.profiles
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((public.is_teacher()))
  WITH CHECK ((public.is_teacher()));

-- ---- teacher_read_all_profiles ON public.profiles (email x1, role x1) ----
DROP POLICY IF EXISTS "teacher_read_all_profiles" ON public.profiles;
CREATE POLICY "teacher_read_all_profiles" ON public.profiles
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR public.is_teacher()));

-- ---- teacher_update_profiles ON public.profiles (email x2, role x2) ----
DROP POLICY IF EXISTS "teacher_update_profiles" ON public.profiles;
CREATE POLICY "teacher_update_profiles" ON public.profiles
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((public.is_teacher()))
  WITH CHECK ((public.is_teacher()));
