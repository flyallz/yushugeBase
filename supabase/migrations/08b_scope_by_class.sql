-- 08b_scope_by_class.sql
-- 玉书阁多教师升级 · 老师只能看 / 改自己班的数据（按班过滤）
-- 目标库：开发项目 NGOCTHUCAC-LMS-v2-dev；执行顺序在 09 之后（用到 09 的
-- ntc_teacher_can_see_user），在执行验证之前。
-- 生成方式：本文件由脚本 gen_08b.py 从 05b / 05 的逐字复刻生成，每处改动都锚定
-- 在原文唯一字符串上并逐条核对——除下面列出的改动外，与线上原文一字不差。
--
-- 改了什么：
--  1. 新增辅助函数 ntc_teacher_owns_class(code)：这个班是不是当前老师的班。
--  2. 13 个 RPC 函数加按班检查：
--     - 列表类（ntc_roster、ntc_roster_v2、ntc_list_game_assignments、
--       ntc_list_topic_reviews）：老师分支只返回自己班的学生 / 班级 / 布置。
--     - 写操作（建班、删班、转班、布置游戏、改游戏布置、布置复习、改复习、
--       开作业、改作业窗口、改学生豁免）：目标班级 / 目标行的班级必须是自己的；
--       转班时学生的原班也必须是自己的（无班学生可转入，视为认领）。
--     - ntc_create_class_v2 建班时同步在 classes 表里登记（归属当前老师）；
--       ntc_remove_empty_class 删班时同步删 classes 行（有历史记录时只隐藏，
--       classes 行保留）。ntc_configure_homework_ui 走 configure_homework_for_classes，
--       检查只加在里层那一处，两处入口都覆盖。
--     - ntc_reopen_homework_for_student 走 set_homework_student_override，
--       检查只加在里层那一处。
--  3. 27 条旧策略的老师分支收窄（学生分支原样不动）：
--     - 按学生过滤的（作业日志、学生档案、HSK3/4 批阅、学习时长、单次批阅、
--       终身统计、HSK5/6 复习进度、复习学生）：老师分支改成
--       ntc_teacher_can_see_user(user_id)。
--     - 按班级过滤的（作业窗口、学生豁免、作业提交、复习布置）：老师分支改成
--       查行所属窗口 / 布置的 class_code 是不是自己的班。
--     - 另外补上 08 漏掉的两处 role 直判（learning_attempt_reviews、
--       learning_lifetime_stats，原文没有 COALESCE，和 08 的匹配式不一样），
--       在这里一并改成按学生过滤。
--
-- 明确没改的：
--  - 三个排行榜（get_learning_leaderboard、get_game_leaderboard、
--    ntc_vocabulary_leaderboard）：全校排名是产品原有设计，只显示名次、姓名
--    和汇总数字，不含作业内容；以后要按老师拆排名再另开函数。
--  - 学生自己的操作（开始/完成游戏、保存复习进度、查自己词汇进度等）：
--    本来就只认 auth.uid()，不用改。
--  - 触发器守卫（ntc_guard_*）：只校验提交内容格式，能改哪行由策略决定。
--  - app_settings 的老师策略：全站配置，不按班分。
--
-- 验证（执行后在 SQL Editor 跑，见跨租户测试）：
--   两个假老师 A / B 各有一班；A 调 ntc_roster_v2 只能看到 A 班学生，
--   调 ntc_list_game_assignments 只能看到 A 班布置；直接查 profiles /
--   homework_submissions 时 B 班的行对 A 不可见。

-- ============ 0. 辅助函数：这个班是不是当前老师的班 ============
CREATE OR REPLACE FUNCTION public.ntc_teacher_owns_class(p_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.classes c
    join public.teachers t on t.id = c.teacher_id
    where upper(trim(c.code)) = upper(trim(p_code))
      and t.auth_user_id = auth.uid()
      and t.is_active
  );
$function$;

-- ============ 1. RPC 函数：按班过滤（与 05b 原文逐字对照，见 gen_08b.py） ============

-- ---- ntc_roster ----
CREATE OR REPLACE FUNCTION public.ntc_roster()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 if not public.ntc_teacher() then
  raise exception 'Chỉ giáo viên được quản lý lớp';
 end if;

 return jsonb_build_object(
  'classes',(
   select coalesce(jsonb_agg(code order by code),'[]')
   from public.ntc_game_classes g
   where public.ntc_teacher_owns_class(g.code)
  ),
  'students',(
   select coalesce(
    jsonb_agg(
     jsonb_build_object(
      'user_id',user_id,
      'full_name',full_name,
      'class_code',class_code,
      'approval_status',approval_status
     ) order by full_name
    ),
    '[]'
   )
   from public.profiles
   where account_type='student'
    and public.ntc_teacher_can_see_user(profiles.user_id)
  )
 );
end
$function$;

-- ---- ntc_roster_v2 ----
CREATE OR REPLACE FUNCTION public.ntc_roster_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 result jsonb;
begin
 if not public.ntc_teacher() then
  raise exception 'Chỉ giáo viên được quản lý lớp';
 end if;

 result:=public.ntc_roster();

 return jsonb_set(
  result,
  '{classes}',
  (
   select coalesce(jsonb_agg(c.code order by c.code),'[]'::jsonb)
   from (
    select code from public.ntc_game_classes
    union
    select upper(trim(class_code))
    from public.profiles
    where account_type='student'
     and nullif(trim(class_code),'') is not null
   ) c
   where public.ntc_teacher_owns_class(c.code)
    and (not exists(
    select 1 from public.ntc_hidden_classes h
    where h.code=c.code
   )
   or exists(
    select 1 from public.profiles p
    where p.account_type='student'
     and upper(trim(p.class_code))=c.code
   ))
  )
 );
end
$function$;

-- ---- ntc_list_game_assignments ----
CREATE OR REPLACE FUNCTION public.ntc_list_game_assignments()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 if auth.uid() is null then
  raise exception 'Cần đăng nhập';
 end if;

 if not public.ntc_teacher() and not exists(
  select 1 from public.profiles
  where user_id=auth.uid() and approval_status='approved'
 ) then
  raise exception 'Tài khoản chưa được duyệt';
 end if;

 return (
  select coalesce(jsonb_agg(t order by t.created_at desc),'[]')
  from (
   select
    a.*,
    c.label,
    c.word_count,
    (
     select count(*)
     from public.ntc_game_runs r
     where r.assignment_id=a.id
      and r.user_id=auth.uid()
      and r.finished_at is not null
    ) as completed_runs,
    (
     select coalesce(
      jsonb_agg(
       jsonb_build_object(
        'user_id',p.user_id,
        'full_name',p.full_name,
        'class_at_assignment',p.class_at_assignment,
        'runs',(
         select count(*)
         from public.ntc_game_runs r
         where r.assignment_id=a.id
          and r.user_id=p.user_id
          and r.finished_at is not null
        ),
        'last_at',(
         select max(finished_at)
         from public.ntc_game_runs r
         where r.assignment_id=a.id and r.user_id=p.user_id
        ),
        'correct',(
         select correct
         from public.ntc_game_runs r
         where r.assignment_id=a.id
          and r.user_id=p.user_id
          and r.finished_at is not null
         order by finished_at desc
         limit 1
        ),
        'total',c.word_count
       )
      ),
      '[]'
     )
     from public.ntc_game_recipients p
     where p.assignment_id=a.id
      and ((public.ntc_teacher() and public.ntc_teacher_owns_class(a.class_code)) or p.user_id=auth.uid())
    ) as students
   from public.ntc_game_assignments a
   join public.ntc_game_catalog c
    on c.level=a.level and c.unit_key=a.unit_key
   where (public.ntc_teacher() and public.ntc_teacher_owns_class(a.class_code))
    or exists(
     select 1
     from public.ntc_game_recipients p
     where p.assignment_id=a.id and p.user_id=auth.uid()
    )
  ) t
 );
end
$function$;

-- ---- ntc_list_topic_reviews ----
CREATE OR REPLACE FUNCTION public.ntc_list_topic_reviews()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 teacher boolean;
 result jsonb;
begin
 if auth.uid() is null then
  raise exception 'Cần đăng nhập';
 end if;

 teacher:=public.homework_is_teacher();

 if not teacher and not exists (
  select 1 from public.profiles p
  where p.user_id=auth.uid()
   and p.account_type='student'
   and p.approval_status='approved'
 ) then
  raise exception 'Tài khoản chưa được duyệt';
 end if;

 select coalesce(
  jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id),
  '[]'
 )
 into result
 from (
  select a.*,
   coalesce((
    select jsonb_agg(
     jsonb_build_object(
      'user_id',s.user_id,
      'full_name',p.full_name,
      'completed_steps',s.completed_steps,
      'started_at',s.started_at,
      'completed_at',s.completed_at
     )
     order by p.full_name,s.user_id
    )
    from public.ntc_topic_review_students s
    left join public.profiles p on p.user_id=s.user_id
    where s.assignment_id=a.id
     and ((teacher and public.ntc_teacher_owns_class(a.class_code)) or s.user_id=auth.uid())
   ),'[]') as students
  from public.ntc_topic_review_assignments a
  where (teacher and public.ntc_teacher_owns_class(a.class_code)) or exists (
   select 1 from public.ntc_topic_review_students s
   where s.assignment_id=a.id and s.user_id=auth.uid()
  )
 ) x;

 return jsonb_build_object(
  'server_time',now(),
  'assignments',result
 );
end $function$;

-- ---- ntc_create_class_v2 ----
CREATE OR REPLACE FUNCTION public.ntc_create_class_v2(p_code text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_code text;
begin
 if not public.ntc_teacher() then
  raise exception 'Chỉ giáo viên được tạo lớp';
 end if;

 if not exists (select 1 from public.teachers t where t.auth_user_id = auth.uid() and t.is_active) then
  raise exception 'Không tìm thấy hồ sơ giáo viên';
 end if;

 v_code:=public.ntc_create_class(p_code);

 insert into public.classes (teacher_id, code, name)
 select t.id, v_code, v_code
 from public.teachers t
 where t.auth_user_id = auth.uid() and t.is_active
 on conflict (code) do nothing;

 delete from public.ntc_hidden_classes h
 where h.code=v_code;

 return v_code;
end
$function$;

-- ---- ntc_remove_empty_class ----
CREATE OR REPLACE FUNCTION public.ntc_remove_empty_class(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_code text:=upper(trim(p_code));
 has_history boolean;
begin
 if not public.ntc_teacher() then
  raise exception 'Chỉ giáo viên được xóa lớp';
 end if;

 if v_code is null or v_code='' then
  raise exception 'Mã lớp không hợp lệ';
 end if;

 if not public.ntc_teacher_owns_class(v_code) then
  raise exception 'Lớp không thuộc về bạn';
 end if;

 lock table public.profiles in share row exclusive mode;
 lock table public.ntc_game_classes in share row exclusive mode;

 if exists(
  select 1 from public.profiles p
  where p.account_type='student'
   and upper(trim(p.class_code))=v_code
 ) then
  raise exception
   'Lớp vẫn còn học sinh (kể cả tài khoản chờ duyệt hoặc bị khóa). Hãy tải lại danh sách.';
 end if;

 has_history:=
  exists(
   select 1 from public.homework_windows w
   where upper(trim(w.class_code))=v_code
  )
  or exists(
   select 1 from public.ntc_game_assignments a
   where upper(trim(a.class_code))=v_code
  )
  or exists(
   select 1 from public.ntc_class_moves m
   where upper(trim(m.from_class))=v_code
    or upper(trim(m.to_class))=v_code
  );

 if has_history then
  insert into public.ntc_hidden_classes(code,teacher_id)
  values(v_code,auth.uid())
  on conflict(code)
  do update set
   hidden_at=now(),
   teacher_id=excluded.teacher_id;
 else
  delete from public.ntc_game_classes c where c.code=v_code;
  delete from public.classes cl where cl.code=v_code;
  delete from public.ntc_hidden_classes h where h.code=v_code;
 end if;

 return jsonb_build_object(
  'class_code',v_code,
  'archived',has_history
 );
end
$function$;

-- ---- ntc_move_students ----
CREATE OR REPLACE FUNCTION public.ntc_move_students(p_students jsonb, p_to text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 target text:=coalesce(upper(trim(p_to)),'');
 batch uuid:=gen_random_uuid();
 item jsonb;
 v_old text;
begin
 if not public.ntc_teacher() then
  raise exception 'Chỉ giáo viên được chuyển lớp';
 end if;

 if jsonb_typeof(p_students)<>'array'
  or jsonb_array_length(p_students) not between 1 and 200 then
  raise exception 'Chọn 1–200 học sinh';
 end if;

 if target<>'' and not exists(
  select 1 from public.ntc_game_classes where code=target
 ) then
  raise exception 'Lớp đích không tồn tại';
 end if;

 if target<>'' and not public.ntc_teacher_owns_class(target) then
  raise exception 'Lớp đích không thuộc về bạn';
 end if;

 for item in
  select value
  from jsonb_array_elements(p_students)
  order by value->>'user_id'
 loop
  select class_code into v_old
  from public.profiles
  where user_id=(item->>'user_id')::uuid
   and account_type='student'
  for update;

  if not found then
   raise exception 'Không tìm thấy học sinh';
  end if;

  if coalesce(v_old,'')<>'' and not public.ntc_teacher_owns_class(v_old) then
   raise exception 'Học sinh không thuộc lớp của bạn';
  end if;

  if coalesce(v_old,'')<>coalesce(item->>'from_class','') then
   raise exception 'Lớp đã thay đổi, hãy tải lại danh sách';
  end if;

  if coalesce(v_old,'')=coalesce(target,'') then
   continue;
  end if;

  update public.profiles
  set class_code=target
  where user_id=(item->>'user_id')::uuid;

  insert into public.ntc_class_moves(
   batch_id,user_id,from_class,to_class,teacher_id
  )
  values(
   batch,
   (item->>'user_id')::uuid,
   v_old,
   target,
   auth.uid()
  );

  insert into public.ntc_game_recipients(
   assignment_id,user_id,full_name,class_at_assignment
  )
  select
   a.id,p.user_id,coalesce(p.full_name,''),target
  from public.ntc_game_assignments a
  join public.profiles p
   on p.user_id=(item->>'user_id')::uuid
  where a.class_code=target
   and not a.archived
   and a.closes_at>now()
   and p.approval_status='approved'
  on conflict do nothing;
 end loop;

 return batch;
end
$function$;

-- ---- ntc_create_game_assignment ----
CREATE OR REPLACE FUNCTION public.ntc_create_game_assignment(p_class text, p_mode text, p_level integer, p_unit text, p_difficulty text, p_runs integer, p_opens timestamp with time zone, p_closes timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v uuid;
begin
 if not public.ntc_teacher() then
  raise exception 'Chỉ giáo viên được giao bài';
 end if;

 if not exists(
  select 1 from public.ntc_game_classes
  where code=upper(trim(p_class))
 ) then
  raise exception 'Lớp không tồn tại';
 end if;

 if not public.ntc_teacher_owns_class(p_class) then
  raise exception 'Lớp không thuộc về bạn';
 end if;

 if not exists(
  select 1
  from public.profiles
  where account_type='student'
   and approval_status='approved'
   and upper(trim(class_code))=upper(trim(p_class))
 ) then
  raise exception 'Lớp chưa có học sinh đã duyệt để nhận game';
 end if;

 insert into public.ntc_game_assignments(
  teacher_id,class_code,mode,level,unit_key,
  difficulty,required_runs,opens_at,closes_at
 )
 values(
  auth.uid(),upper(trim(p_class)),p_mode,p_level,p_unit,
  p_difficulty,p_runs,p_opens,p_closes
 )
 returning id into v;

 insert into public.ntc_game_recipients(
  assignment_id,user_id,full_name,class_at_assignment
 )
 select
  v,user_id,coalesce(full_name,''),coalesce(class_code,'')
 from public.profiles
 where account_type='student'
  and approval_status='approved'
  and upper(trim(class_code))=upper(trim(p_class));

 if not exists(
  select 1 from public.ntc_game_recipients
  where assignment_id=v
 ) then
  raise exception
   'Danh sách lớp vừa thay đổi. Chưa giao game, hãy tải lại.';
 end if;

 return v;
end
$function$;

-- ---- ntc_update_game_assignment ----
CREATE OR REPLACE FUNCTION public.ntc_update_game_assignment(p_id uuid, p_runs integer, p_closes timestamp with time zone, p_archived boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 if not public.ntc_teacher() then
  raise exception 'Chỉ giáo viên được chỉnh giao bài';
 end if;

 if not exists (
  select 1 from public.ntc_game_assignments a
  where a.id=p_id and public.ntc_teacher_owns_class(a.class_code)
 ) then
  raise exception 'Không tìm thấy bài giao';
 end if;

 update public.ntc_game_assignments
 set required_runs=p_runs,
  closes_at=p_closes,
  archived=p_archived
 where id=p_id;

 if not found then
  raise exception 'Không tìm thấy bài giao';
 end if;
end
$function$;

-- ---- ntc_assign_topic_review ----
CREATE OR REPLACE FUNCTION public.ntc_assign_topic_review(p_request uuid, p_topic text, p_classes text[], p_opens timestamp with time zone, p_closes timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 code text;
 aid uuid;
 old public.ntc_topic_review_assignments;
 spec jsonb;
 ids jsonb := '[]';
 fresh boolean;
begin
 if auth.uid() is null or not public.homework_is_teacher() then
  raise exception 'Chỉ giáo viên được giao ôn tập';
 end if;

 spec := public.ntc_topic_review_spec(p_topic);

 if spec is null or p_request is null
 or p_opens is null or p_closes is null
 or p_closes<=p_opens
 or coalesce(cardinality(p_classes),0) not between 1 and 100 then
  raise exception 'Chọn chủ đề, lớp và thời gian hợp lệ';
 end if;

 for code in
  select distinct upper(btrim(x))
  from unnest(p_classes) x
  where nullif(btrim(x),'') is not null
 loop
  if not public.ntc_teacher_owns_class(code) then
   raise exception 'Lớp % không thuộc về bạn',code;
  end if;

  if not exists (
   select 1 from public.profiles p
   where upper(btrim(p.class_code))=code
    and p.account_type='student'
    and p.approval_status='approved'
  ) then
   raise exception 'Lớp % chưa có học sinh được duyệt',code;
  end if;

  aid:=null;

  insert into public.ntc_topic_review_assignments (
   request_id,topic_id,title,class_code,
   steps,opens_at,closes_at,created_by
  )
  values (
   p_request,p_topic,spec->>'title',code,
   spec->'steps',p_opens,p_closes,auth.uid()
  )
  on conflict(request_id,class_code) do nothing
  returning id into aid;

  fresh:=aid is not null;

  if not fresh then
   select * into old
   from public.ntc_topic_review_assignments
   where request_id=p_request and class_code=code;

   if old.topic_id<>p_topic
    or old.opens_at<>p_opens
    or old.closes_at<>p_closes
    or old.created_by<>auth.uid() then
    raise exception 'Mã yêu cầu đã dùng cho lần giao khác';
   end if;

   aid:=old.id;
  end if;

  if fresh then
   insert into public.ntc_topic_review_students (
    assignment_id,user_id
   )
   select aid,p.user_id
   from public.profiles p
   where upper(btrim(p.class_code))=code
    and p.account_type='student'
    and p.approval_status='approved';
  end if;

  ids:=ids||jsonb_build_array(aid);
 end loop;

 if jsonb_array_length(ids)=0 then
  raise exception 'Chưa chọn lớp';
 end if;

 return jsonb_build_object('assignment_ids',ids);
end $function$;

-- ---- ntc_update_topic_review ----
CREATE OR REPLACE FUNCTION public.ntc_update_topic_review(p_assignment uuid, p_closes timestamp with time zone, p_enabled boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null or not public.homework_is_teacher() then
  raise exception 'Chỉ giáo viên được sửa hạn';
 end if;

 if not exists (
  select 1 from public.ntc_topic_review_assignments a
  where a.id=p_assignment and public.ntc_teacher_owns_class(a.class_code)
 ) then
  raise exception 'Không tìm thấy bài hoặc hạn không hợp lệ';
 end if;

 if p_enabled is null or p_closes is null then
  raise exception 'Thiếu thời gian hoặc trạng thái';
 end if;

 update public.ntc_topic_review_assignments
 set closes_at=p_closes,is_enabled=p_enabled
 where id=p_assignment and p_closes>opens_at;

 if not found then
  raise exception 'Không tìm thấy bài hoặc hạn không hợp lệ';
 end if;
end $function$;

-- ---- set_homework_window_enabled ----
CREATE OR REPLACE FUNCTION public.set_homework_window_enabled(p_window_id uuid, p_is_enabled boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.homework_is_teacher() then
    raise exception 'Chỉ giáo viên mới được thay đổi trạng thái.';
  end if;

  if not exists (
    select 1 from public.homework_windows w
    where w.id = p_window_id and public.ntc_teacher_owns_class(w.class_code)
  ) then
    raise exception 'Không tìm thấy lịch nộp bài.';
  end if;

  update public.homework_windows
  set
    is_enabled = p_is_enabled,
    updated_at = now()
  where id = p_window_id;

  if not found then
    raise exception 'Không tìm thấy lịch nộp bài.';
  end if;

  return true;
end;
$function$;

-- ---- set_homework_student_override ----
CREATE OR REPLACE FUNCTION public.set_homework_student_override(p_window_id uuid, p_user_id uuid, p_is_allowed boolean, p_opens_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_closes_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_override_id uuid;
  v_window_class text;
  v_student_class text;
begin
  if not public.homework_is_teacher() then
    raise exception 'Chỉ giáo viên mới được mở riêng cho học sinh.';
  end if;

  select upper(trim(class_code))
  into v_window_class
  from public.homework_windows
  where id = p_window_id;

  if v_window_class is null then
    raise exception 'Không tìm thấy lịch nộp bài.';
  end if;

  if not public.ntc_teacher_owns_class(v_window_class) then
    raise exception 'Lịch nộp bài không thuộc lớp của bạn.';
  end if;

  select upper(trim(class_code))
  into v_student_class
  from public.profiles
  where user_id = p_user_id
    and account_type = 'student';

  if v_student_class is null then
    raise exception 'Không tìm thấy hồ sơ học sinh.';
  end if;

  if v_student_class <> v_window_class then
    raise exception 'Học sinh không thuộc lớp được chọn.';
  end if;

  if p_opens_at is not null
     and p_closes_at is not null
     and p_closes_at <= p_opens_at then
    raise exception 'Hạn nộp riêng phải sau thời gian mở.';
  end if;

  insert into public.homework_student_overrides (
    window_id,
    user_id,
    is_allowed,
    opens_at,
    closes_at,
    reason,
    created_by,
    updated_at
  )
  values (
    p_window_id,
    p_user_id,
    p_is_allowed,
    p_opens_at,
    p_closes_at,
    nullif(trim(p_reason), ''),
    auth.uid(),
    now()
  )
  on conflict (window_id, user_id)
  do update set
    is_allowed = excluded.is_allowed,
    opens_at = excluded.opens_at,
    closes_at = excluded.closes_at,
    reason = excluded.reason,
    created_by = auth.uid(),
    updated_at = now()
  returning id into v_override_id;

  return v_override_id;
end;
$function$;

-- ---- configure_homework_for_classes ----
CREATE OR REPLACE FUNCTION public.configure_homework_for_classes(p_course_code text, p_lesson_code text, p_lesson_name text, p_class_codes text[], p_opens_at timestamp with time zone, p_closes_at timestamp with time zone, p_allow_writing boolean DEFAULT true, p_allow_vocabulary_audio boolean DEFAULT true, p_allow_text_audio boolean DEFAULT true, p_writing_parts smallint DEFAULT 2, p_vocabulary_parts smallint DEFAULT 2, p_text_parts smallint DEFAULT 1, p_allow_resubmit boolean DEFAULT true)
 RETURNS TABLE(window_id uuid, opened_class_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_class_code text;
  v_window_id uuid;
begin
  if not public.homework_is_teacher() then
    raise exception 'Chỉ giáo viên mới được mở bài tập.';
  end if;

  if nullif(trim(p_course_code), '') is null then
    raise exception 'Thiếu mã khóa học.';
  end if;

  if nullif(trim(p_lesson_code), '') is null then
    raise exception 'Thiếu mã bài học.';
  end if;

  if nullif(trim(p_lesson_name), '') is null then
    raise exception 'Thiếu tên bài học.';
  end if;

  if p_class_codes is null
     or coalesce(array_length(p_class_codes, 1), 0) = 0 then
    raise exception 'Phải chọn ít nhất một lớp.';
  end if;

  if p_closes_at <= p_opens_at then
    raise exception 'Hạn nộp phải sau thời gian mở bài.';
  end if;

  if p_writing_parts not between 1 and 10 then
    raise exception 'Số phần bài viết không hợp lệ.';
  end if;

  if p_vocabulary_parts not between 1 and 10 then
    raise exception 'Số phần đọc từ vựng không hợp lệ.';
  end if;

  if p_text_parts not between 1 and 20 then
    raise exception 'Số bài khóa không hợp lệ.';
  end if;

  foreach v_class_code in array p_class_codes
  loop
    v_class_code := upper(trim(v_class_code));

    if v_class_code <> '' and not public.ntc_teacher_owns_class(v_class_code) then
      raise exception 'Lớp % không thuộc về bạn', v_class_code;
    end if;

    if v_class_code <> '' then
      insert into public.homework_windows (
        course_code,
        lesson_code,
        lesson_name,
        class_code,
        opens_at,
        closes_at,
        is_enabled,
        allow_writing,
        allow_vocabulary_audio,
        allow_text_audio,
        writing_parts,
        vocabulary_parts,
        text_parts,
        allow_resubmit,
        created_by,
        updated_at
      )
      values (
        upper(trim(p_course_code)),
        trim(p_lesson_code),
        trim(p_lesson_name),
        v_class_code,
        p_opens_at,
        p_closes_at,
        true,
        p_allow_writing,
        p_allow_vocabulary_audio,
        p_allow_text_audio,
        p_writing_parts,
        p_vocabulary_parts,
        p_text_parts,
        p_allow_resubmit,
        auth.uid(),
        now()
      )
      on conflict (
        course_code,
        lesson_code,
        class_code
      )
      do update set
        lesson_name = excluded.lesson_name,
        opens_at = excluded.opens_at,
        closes_at = excluded.closes_at,
        is_enabled = true,
        allow_writing = excluded.allow_writing,
        allow_vocabulary_audio =
          excluded.allow_vocabulary_audio,
        allow_text_audio = excluded.allow_text_audio,
        writing_parts = excluded.writing_parts,
        vocabulary_parts = excluded.vocabulary_parts,
        text_parts = excluded.text_parts,
        allow_resubmit = excluded.allow_resubmit,
        updated_at = now()
      returning id into v_window_id;

      window_id := v_window_id;
      opened_class_code := v_class_code;
      return next;
    end if;
  end loop;
end;
$function$;


-- ============ 2. 旧策略：老师分支收窄 ============
-- （每条先 DROP 再 CREATE；与 08 执行后的版本对照，只改老师分支。）
-- ---- teacher_can_read_all_writings ON public.daily_activity_writings ----
DROP POLICY IF EXISTS "teacher_can_read_all_writings" ON public.daily_activity_writings;
CREATE POLICY "teacher_can_read_all_writings" ON public.daily_activity_writings
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR public.ntc_teacher_can_see_user(user_id)));

-- ---- teacher_read_all_daily_writings ON public.daily_activity_writings ----
DROP POLICY IF EXISTS "teacher_read_all_daily_writings" ON public.daily_activity_writings;
CREATE POLICY "teacher_read_all_daily_writings" ON public.daily_activity_writings
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR public.ntc_teacher_can_see_user(user_id)));

-- ---- teacher_can_update_writings ON public.daily_activity_writings ----
DROP POLICY IF EXISTS "teacher_can_update_writings" ON public.daily_activity_writings;
CREATE POLICY "teacher_can_update_writings" ON public.daily_activity_writings
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((public.ntc_teacher_can_see_user(user_id)))
  WITH CHECK ((public.ntc_teacher_can_see_user(user_id)));

-- ---- teacher_update_daily_writings ON public.daily_activity_writings ----
DROP POLICY IF EXISTS "teacher_update_daily_writings" ON public.daily_activity_writings;
CREATE POLICY "teacher_update_daily_writings" ON public.daily_activity_writings
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((public.ntc_teacher_can_see_user(user_id)))
  WITH CHECK ((public.ntc_teacher_can_see_user(user_id)));

-- ---- teacher_can_read_all_profiles ON public.profiles ----
DROP POLICY IF EXISTS "teacher_can_read_all_profiles" ON public.profiles;
CREATE POLICY "teacher_can_read_all_profiles" ON public.profiles
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR public.ntc_teacher_can_see_user(user_id)));

-- ---- teacher_read_all_profiles ON public.profiles ----
DROP POLICY IF EXISTS "teacher_read_all_profiles" ON public.profiles;
CREATE POLICY "teacher_read_all_profiles" ON public.profiles
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR public.ntc_teacher_can_see_user(user_id)));

-- ---- teacher_can_update_profiles ON public.profiles ----
DROP POLICY IF EXISTS "teacher_can_update_profiles" ON public.profiles;
CREATE POLICY "teacher_can_update_profiles" ON public.profiles
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((public.ntc_teacher_can_see_user(user_id)))
  WITH CHECK ((public.ntc_teacher_can_see_user(user_id)));

-- ---- teacher_update_profiles ON public.profiles ----
DROP POLICY IF EXISTS "teacher_update_profiles" ON public.profiles;
CREATE POLICY "teacher_update_profiles" ON public.profiles
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((public.ntc_teacher_can_see_user(user_id)))
  WITH CHECK ((public.ntc_teacher_can_see_user(user_id)));

-- ---- teacher_read_hsk3_reviews ON public.hsk3_attempt_reviews ----
DROP POLICY IF EXISTS "teacher_read_hsk3_reviews" ON public.hsk3_attempt_reviews;
CREATE POLICY "teacher_read_hsk3_reviews" ON public.hsk3_attempt_reviews
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR public.ntc_teacher_can_see_user(user_id)));

-- ---- ngoc_hsk4_review_select ON public.hsk4_attempt_reviews ----
DROP POLICY IF EXISTS "ngoc_hsk4_review_select" ON public.hsk4_attempt_reviews;
CREATE POLICY "ngoc_hsk4_review_select" ON public.hsk4_attempt_reviews
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR public.ntc_teacher_can_see_user(user_id)));

-- ---- student reads own learning time ON public.learning_activity_totals ----
DROP POLICY IF EXISTS "student reads own learning time" ON public.learning_activity_totals;
CREATE POLICY "student reads own learning time" ON public.learning_activity_totals
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR public.ntc_teacher_can_see_user(user_id)));

-- ---- student read own attempt review ON public.learning_attempt_reviews ----
DROP POLICY IF EXISTS "student read own attempt review" ON public.learning_attempt_reviews;
CREATE POLICY "student read own attempt review" ON public.learning_attempt_reviews
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR (public.ntc_teacher_can_see_user(user_id))));

-- ---- teacher read lifetime stats ON public.learning_lifetime_stats ----
DROP POLICY IF EXISTS "teacher read lifetime stats" ON public.learning_lifetime_stats;
CREATE POLICY "teacher read lifetime stats" ON public.learning_lifetime_stats
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((public.ntc_teacher_can_see_user(user_id)) OR (user_id = auth.uid())));

-- ---- homework_overrides_read ON public.homework_student_overrides ----
DROP POLICY IF EXISTS "homework_overrides_read" ON public.homework_student_overrides;
CREATE POLICY "homework_overrides_read" ON public.homework_student_overrides
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.homework_windows w WHERE w.id = homework_student_overrides.window_id AND public.ntc_teacher_owns_class(w.class_code))));

-- ---- homework_overrides_teacher_delete ON public.homework_student_overrides ----
DROP POLICY IF EXISTS "homework_overrides_teacher_delete" ON public.homework_student_overrides;
CREATE POLICY "homework_overrides_teacher_delete" ON public.homework_student_overrides
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.homework_windows w WHERE w.id = homework_student_overrides.window_id AND public.ntc_teacher_owns_class(w.class_code)));

-- ---- homework_overrides_teacher_insert ON public.homework_student_overrides ----
DROP POLICY IF EXISTS "homework_overrides_teacher_insert" ON public.homework_student_overrides;
CREATE POLICY "homework_overrides_teacher_insert" ON public.homework_student_overrides
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.homework_windows w WHERE w.id = homework_student_overrides.window_id AND public.ntc_teacher_owns_class(w.class_code)));

-- ---- homework_overrides_teacher_update ON public.homework_student_overrides ----
DROP POLICY IF EXISTS "homework_overrides_teacher_update" ON public.homework_student_overrides;
CREATE POLICY "homework_overrides_teacher_update" ON public.homework_student_overrides
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.homework_windows w WHERE w.id = homework_student_overrides.window_id AND public.ntc_teacher_owns_class(w.class_code)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.homework_windows w WHERE w.id = homework_student_overrides.window_id AND public.ntc_teacher_owns_class(w.class_code)));

-- ---- homework_submissions_read ON public.homework_submissions ----
DROP POLICY IF EXISTS "homework_submissions_read" ON public.homework_submissions;
CREATE POLICY "homework_submissions_read" ON public.homework_submissions
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.homework_windows w WHERE w.id = homework_submissions.window_id AND public.ntc_teacher_owns_class(w.class_code))));

-- ---- homework_submissions_teacher_update ON public.homework_submissions ----
DROP POLICY IF EXISTS "homework_submissions_teacher_update" ON public.homework_submissions;
CREATE POLICY "homework_submissions_teacher_update" ON public.homework_submissions
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.homework_windows w WHERE w.id = homework_submissions.window_id AND public.ntc_teacher_owns_class(w.class_code)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.homework_windows w WHERE w.id = homework_submissions.window_id AND public.ntc_teacher_owns_class(w.class_code)));

-- ---- homework_windows_student_read ON public.homework_windows ----
DROP POLICY IF EXISTS "homework_windows_student_read" ON public.homework_windows;
CREATE POLICY "homework_windows_student_read" ON public.homework_windows
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((public.ntc_teacher_owns_class(homework_windows.class_code) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = auth.uid()) AND (p.approval_status = 'approved'::text) AND (upper(TRIM(BOTH FROM p.class_code)) = upper(TRIM(BOTH FROM homework_windows.class_code))))))));

-- ---- homework_windows_teacher_delete ON public.homework_windows ----
DROP POLICY IF EXISTS "homework_windows_teacher_delete" ON public.homework_windows;
CREATE POLICY "homework_windows_teacher_delete" ON public.homework_windows
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (public.ntc_teacher_owns_class(homework_windows.class_code));

-- ---- homework_windows_teacher_insert ON public.homework_windows ----
DROP POLICY IF EXISTS "homework_windows_teacher_insert" ON public.homework_windows;
CREATE POLICY "homework_windows_teacher_insert" ON public.homework_windows
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (public.ntc_teacher_owns_class(homework_windows.class_code));

-- ---- homework_windows_teacher_update ON public.homework_windows ----
DROP POLICY IF EXISTS "homework_windows_teacher_update" ON public.homework_windows;
CREATE POLICY "homework_windows_teacher_update" ON public.homework_windows
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (public.ntc_teacher_owns_class(homework_windows.class_code))
  WITH CHECK (public.ntc_teacher_owns_class(homework_windows.class_code));

-- ---- ntc_hsk5_progress_read ON public.ntc_hsk5_review_progress ----
DROP POLICY IF EXISTS "ntc_hsk5_progress_read" ON public.ntc_hsk5_review_progress;
CREATE POLICY "ntc_hsk5_progress_read" ON public.ntc_hsk5_review_progress
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((((auth.uid() IS NOT NULL) AND public.ntc_teacher_can_see_user(user_id)) OR ((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = auth.uid()) AND (p.account_type = 'student'::text) AND (p.approval_status = 'approved'::text)))))));

-- ---- ntc_hsk6_progress_read ON public.ntc_hsk6_review_progress ----
DROP POLICY IF EXISTS "ntc_hsk6_progress_read" ON public.ntc_hsk6_review_progress;
CREATE POLICY "ntc_hsk6_progress_read" ON public.ntc_hsk6_review_progress
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((((auth.uid() IS NOT NULL) AND public.ntc_teacher_can_see_user(user_id)) OR ((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = auth.uid()) AND (p.account_type = 'student'::text) AND (p.approval_status = 'approved'::text)))))));

-- ---- ntc_topic_review_assignment_read ON public.ntc_topic_review_assignments ----
DROP POLICY IF EXISTS "ntc_topic_review_assignment_read" ON public.ntc_topic_review_assignments;
CREATE POLICY "ntc_topic_review_assignment_read" ON public.ntc_topic_review_assignments
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((public.ntc_teacher_owns_class(ntc_topic_review_assignments.class_code) OR (EXISTS ( SELECT 1
   FROM ntc_topic_review_students s
  WHERE ((s.assignment_id = ntc_topic_review_assignments.id) AND (s.user_id = auth.uid()))))));

-- ---- ntc_topic_review_student_read ON public.ntc_topic_review_students ----
DROP POLICY IF EXISTS "ntc_topic_review_student_read" ON public.ntc_topic_review_students;
CREATE POLICY "ntc_topic_review_student_read" ON public.ntc_topic_review_students
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((public.ntc_teacher_can_see_user(user_id) OR ((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = auth.uid()) AND (p.approval_status = 'approved'::text) AND (p.account_type = 'student'::text)))))));
