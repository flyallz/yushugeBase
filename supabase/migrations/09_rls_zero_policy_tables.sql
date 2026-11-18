-- 09_rls_zero_policy_tables.sql
-- 玉书阁多教师升级 · 给 10 张零策略表和 07 的 3 张新表补 RLS 策略
-- 目标库：开发项目 NGOCTHUCAC-LMS-v2-dev；执行顺序在 08 之后、08b 之前。
--
-- 先核对了前端实际怎么用这几张表（2026-11-18 读代码）：
--  learning_sessions：学生查自己的（继续学习）、新建、更新心跳；老师在
--    Dashboard 查全校（limit 500）和单个学生详情（in user_id 列表）。
--  results：学生提交成绩、查自己最近的；老师在 Dashboard 查全校和单个学生详情。
--  activity_logs：学生写行为日志；老师在 Dashboard 查 progress_complete 和详情。
--  其余 7 张零策略表（ntc_game_*、ntc_class_moves、ntc_hidden_classes）前端
--    不直接查，全走 05b 的 SECURITY DEFINER RPC，函数内部自己做隔离，
--    所以不给它们建直接访问策略——RLS 全拒就是正确的，留给 RPC。
--
-- 隔离规则（每张数据表都一样）：
--  学生：只能读写 user_id = 自己的行。
--  老师：能读自己班学生的行（学生的班以 profiles.class_code 为准，
--    经 classes.code 找到老师）。写操作老师不直接做，走 RPC。
--  为避免策略互相递归（classes 策略查 class_members、class_members 策略又查
--  classes），老师可见判断抽成一个 SECURITY DEFINER 辅助函数
--  ntc_teacher_can_see_user()，策略里只调它，不直接 join。
--
-- 新表的策略：
--  teachers：只读自己的行（homework_is_teacher() 是非 SECURITY DEFINER，
--    它查 teachers 表时就靠这条策略看到自己的行）。
--  classes：老师看自己的班；学生看自己 profiles.class_code 对应的班。
--  class_members：本人看自己的；老师看自己班的成员。
--  三张新表都不开直接写（老师入职、建班、加学生走管理流程 / Edge Function，
--  它们是 SECURITY DEFINER，不受 RLS 限制）。
--
-- 另附一个同步触发器：profiles.class_code 一变，class_members 自动跟着变，
--  两边不漂移。注册（handle_new_user_profile 建 profiles 行）和转班
--  （ntc_move_students 改 profiles.class_code）都自动同步，不用每个调用方操心。
-- 执行顺序：在 08 之后（用到 teachers 表和 is_teacher()）。
-- 验证（执行后在 SQL Editor 跑）：
--   SELECT count(*) FROM pg_policies WHERE schemaname='public'
--     AND tablename IN ('learning_sessions','results','activity_logs',
--       'teachers','classes','class_members');  -- 预期 10

-- ============ 0. 辅助函数：这个老师能不能看到这个学生 ============
CREATE OR REPLACE FUNCTION public.ntc_teacher_can_see_user(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.profiles p
    join public.classes c on c.code = p.class_code
    join public.teachers t on t.id = c.teacher_id
    where p.user_id = p_user_id
      and t.auth_user_id = auth.uid()
      and t.is_active
  );
$function$;

-- ============ 1. learning_sessions ============
DROP POLICY IF EXISTS "student_own_sessions_select" ON public.learning_sessions;
CREATE POLICY "student_own_sessions_select" ON public.learning_sessions
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()) OR public.ntc_teacher_can_see_user(user_id));

DROP POLICY IF EXISTS "student_own_sessions_insert" ON public.learning_sessions;
CREATE POLICY "student_own_sessions_insert" ON public.learning_sessions
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "student_own_sessions_update" ON public.learning_sessions;
CREATE POLICY "student_own_sessions_update" ON public.learning_sessions
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============ 2. results ============
DROP POLICY IF EXISTS "student_own_results_select" ON public.results;
CREATE POLICY "student_own_results_select" ON public.results
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()) OR public.ntc_teacher_can_see_user(user_id));

DROP POLICY IF EXISTS "student_own_results_insert" ON public.results;
CREATE POLICY "student_own_results_insert" ON public.results
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ============ 3. activity_logs ============
DROP POLICY IF EXISTS "student_own_logs_select" ON public.activity_logs;
CREATE POLICY "student_own_logs_select" ON public.activity_logs
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()) OR public.ntc_teacher_can_see_user(user_id));

DROP POLICY IF EXISTS "student_own_logs_insert" ON public.activity_logs;
CREATE POLICY "student_own_logs_insert" ON public.activity_logs
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ============ 4. teachers：只读自己的行 ============
DROP POLICY IF EXISTS "teacher_own_row_select" ON public.teachers;
CREATE POLICY "teacher_own_row_select" ON public.teachers
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

-- ============ 5. classes：老师看自己的班，学生看自己所在的班 ============
DROP POLICY IF EXISTS "member_or_teacher_classes_select" ON public.classes;
CREATE POLICY "member_or_teacher_classes_select" ON public.classes
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.teachers t
            WHERE t.id = classes.teacher_id AND t.auth_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p
               WHERE p.user_id = auth.uid() AND p.class_code = classes.code)
  );

-- ============ 6. class_members：本人看自己的，老师看自己班的 ============
DROP POLICY IF EXISTS "self_or_teacher_members_select" ON public.class_members;
CREATE POLICY "self_or_teacher_members_select" ON public.class_members
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.classes c
               JOIN public.teachers t ON t.id = c.teacher_id
               WHERE c.id = class_members.class_id
                 AND t.auth_user_id = auth.uid())
  );

-- ============ 7. 同步触发器：profiles.class_code 变了，class_members 跟着变 ============
CREATE OR REPLACE FUNCTION public.sync_profile_class_membership()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- 新行或 class_code 变了：先清掉该学生旧的 student 成员身份，再按新班加上。
  -- 老师身份（role='teacher'）的成员行不由这里管（07 回填时建好）。
  if (TG_OP = 'DELETE') then
    delete from public.class_members
    where user_id = old.user_id and role = 'student';
    return old;
  end if;
  if (TG_OP = 'UPDATE' and old.class_code is not distinct from new.class_code) then
    return new;
  end if;
  if (TG_OP = 'UPDATE' and old.class_code <> '') then
    delete from public.class_members cm
    using public.classes cl
    where cm.class_id = cl.id
      and cm.user_id = new.user_id
      and cm.role = 'student'
      and cl.code = old.class_code;
  end if;
  if (new.class_code <> '' and new.account_type = 'student') then
    insert into public.class_members (class_id, user_id, role)
    select cl.id, new.user_id, 'student'
    from public.classes cl
    where cl.code = new.class_code
    on conflict (class_id, user_id) do nothing;
  end if;
  return new;
end;
$function$;

DROP TRIGGER IF EXISTS sync_profile_class_membership ON public.profiles;
CREATE TRIGGER sync_profile_class_membership
  AFTER INSERT OR UPDATE OF class_code OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_class_membership();
