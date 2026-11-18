-- 05b_rpc_functions.sql
-- 玉书阁开发项目 NGOCTHUCAC-LMS-v2-dev：补齐线上缺失的 RPC/触发器函数
-- 来源：2026-11-18 从线上项目 NGOCTHUCAC-LMS 用 pg_get_functiondef 全量导出
-- （CSV：browser-download-20261118T034910.404407445Z-0-Supabase_Snippet_Untitled_query.csv，
-- 54 个函数，定义逐字照录，未改一字）
-- 开发库此前只有 4 个函数（在 05_functions_and_rls.sql 里：can_submit_homework、
-- homework_is_teacher、is_teacher、ntc_teacher），本文件补其余 50 个。
-- 注意：
--  1. 本文件只建函数本体。触发器挂接（例如 handle_new_user_profile 挂在 auth.users 上、
--     各 ntc_guard_* 挂在哪张表上）不在此文件，见 05c_triggers.sql（待触发器清单导出后补）。
--  2. 事件触发器函数 rls_auto_enable 的本体在此，但 CREATE EVENT TRIGGER 语句不在此文件，
--     同样见 05c。
--  3. 带日期后缀的旧版本（can_submit_homework_before_reopen_20261106、
--     ntc_guard_hsk46_payload_before_reopen_20261106、
--     ntc_topic_review_spec_before_19_20261103）原样保留，不删除——删了可能断掉线上
--     仍在用的引用；是否清理是以后多教师升级时的决定。
--  4. 硬编码老师邮箱只出现在 homework_is_teacher 里（已在 05 中），本文件 50 个函数
--     均不含该邮箱；去硬编码的工作在 08。
-- 执行方式：与 05 相同，分段粘贴进开发项目 SQL Editor 执行；每段执行后核对函数数。
-- 目标：执行完开发库 public schema 函数总数 = 54。


-- ---- can_submit_homework_before_reopen_20261106 ----
CREATE OR REPLACE FUNCTION public.can_submit_homework_before_reopen_20261106(p_window_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    p_user_id = auth.uid()
    and exists (
      select 1
      from public.homework_windows w
      join public.profiles p
        on p.user_id = p_user_id
       and upper(trim(p.class_code))
           = upper(trim(w.class_code))
      where w.id = p_window_id
        and p.approval_status = 'approved'
        and p.account_type = 'student'
        and w.is_enabled = true
        and (
          case
            when exists (
              select 1
              from public.homework_student_overrides ox
              where ox.window_id = w.id
                and ox.user_id = p_user_id
            )
            then exists (
              select 1
              from public.homework_student_overrides o
              where o.window_id = w.id
                and o.user_id = p_user_id
                and o.is_allowed = true
                and now() >= coalesce(o.opens_at, w.opens_at)
                and now() <= coalesce(o.closes_at, w.closes_at)
            )
            else
              now() >= w.opens_at
              and now() <= w.closes_at
          end
        )
    );
$function$;

-- ---- cleanup_learning_details_7_days ----
CREATE OR REPLACE FUNCTION public.cleanup_learning_details_7_days()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  delete from public.learning_attempt_reviews
  where submitted_at < now() - interval '7 days';

  if to_regclass('public.hsk3_attempt_reviews') is not null then
    delete from public.hsk3_attempt_reviews
    where submitted_at < now() - interval '7 days';
  end if;

  if to_regclass('public.hsk4_attempt_reviews') is not null then
    delete from public.hsk4_attempt_reviews
    where submitted_at < now() - interval '7 days';
  end if;

  delete from public.results
  where submitted_at < now() - interval '7 days';

  delete from public.learning_sessions
  where coalesce(ended_at, last_active_at, started_at)
        < now() - interval '7 days';
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

-- ---- get_game_leaderboard ----
CREATE OR REPLACE FUNCTION public.get_game_leaderboard(p_game_id text, p_mode text, p_scope text DEFAULT 'overall'::text, p_class_code text DEFAULT NULL::text, p_limit integer DEFAULT 100)
 RETURNS TABLE(rank_no bigint, user_id uuid, full_name text, class_code text, highest_level integer, highest_stage integer, total_best_score bigint, best_accuracy numeric, best_combo integer, is_me boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with game_data as (
    select
      p.user_id,
      coalesce(p.full_name, 'Học sinh')::text as full_name,
      coalesce(p.class_code, '')::text as class_code,
      max(g.level)::integer as highest_level,
      max(g.completed_stage)::integer as highest_stage,
      sum(g.score)::bigint as total_best_score,
      max(g.accuracy)::numeric as best_accuracy,
      max(g.combo)::integer as best_combo

    from public.game_best_records g
    join public.profiles p
      on p.user_id = g.user_id

    where g.game_id = p_game_id
      and g.mode = p_mode
      and (
        coalesce(p_scope, 'overall') <> 'class'
        or p.class_code = p_class_code
      )

    group by
      p.user_id,
      p.full_name,
      p.class_code
  ),
  ranked as (
    select
      row_number() over (
        order by
          highest_level desc,
          highest_stage desc,
          total_best_score desc,
          best_accuracy desc,
          best_combo desc,
          full_name asc
      ) as rank_no,
      *
    from game_data
  )
  select
    r.rank_no,
    r.user_id,
    r.full_name,
    r.class_code,
    r.highest_level,
    r.highest_stage,
    r.total_best_score,
    r.best_accuracy,
    r.best_combo,
    r.user_id = auth.uid() as is_me
  from ranked r
  order by r.rank_no
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$function$;

-- ---- get_learning_leaderboard ----
CREATE OR REPLACE FUNCTION public.get_learning_leaderboard(p_scope text DEFAULT 'overall'::text, p_metric text DEFAULT 'time'::text, p_class_code text DEFAULT NULL::text, p_limit integer DEFAULT 100)
 RETURNS TABLE(rank_no bigint, user_id uuid, full_name text, class_code text, active_seconds bigint, distinct_lessons bigint, total_submissions bigint, is_me boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$

 with evidence as (
  -- Kết quả đã lưu.
  select
   r.user_id,
   'COURSE:' || upper(trim(r.course_name)) as scope_key,
   lower(
    regexp_replace(trim(r.lesson_name), '\s+', ' ', 'g')
   ) as unit_key
  from public.results r
  where nullif(trim(r.course_name), '') is not null
   and nullif(trim(r.lesson_name), '') is not null

  union

  -- Bài thực sự đã gửi giáo viên.
  -- Giữ cả bài thuộc lịch đã đóng hoặc lưu trữ.
  select
   s.user_id,
   'COURSE:' || upper(trim(w.course_code)),
   lower(
    regexp_replace(
     trim(
      coalesce(
       nullif(trim(w.lesson_name), ''),
       w.lesson_code
      )
     ),
     '\s+', ' ', 'g'
    )
   )
  from public.homework_submissions s
  join public.homework_windows w
   on w.id = s.window_id
  where s.status in (
   'pending',
   'graded',
   'revision_required'
  )
   and nullif(trim(w.course_code), '') is not null
   and nullif(
    trim(
     coalesce(
      nullif(trim(w.lesson_name), ''),
      w.lesson_code
     )
    ),
    ''
   ) is not null

  union

  -- Nhật ký bài học: dùng cùng tên khóa/bài
  -- để không đếm trùng với hai nguồn phía trên.
  select
   a.user_id,
   'COURSE:' || upper(
    trim(
     coalesce(
      nullif(trim(a.details ->> 'scope_label'), ''),
      substring(a.details ->> 'scope_id' from 8)
     )
    )
   ),
   lower(
    regexp_replace(
     trim(
      coalesce(
       nullif(trim(a.details ->> 'unit_label'), ''),
       a.details ->> 'unit_id'
      )
     ),
     '\s+', ' ', 'g'
    )
   )
  from public.activity_logs a
  where a.action = 'progress_complete'
   and a.details ->> 'scope_id' like 'course:%'
   and nullif(
    trim(
     coalesce(
      nullif(trim(a.details ->> 'unit_label'), ''),
      a.details ->> 'unit_id'
     )
    ),
    ''
   ) is not null

  union

  -- Giữ tiến độ game/hoạt động đã có nhật ký.
  select
   a.user_id,
   'ACTIVITY:' || trim(a.details ->> 'scope_id'),
   trim(a.details ->> 'unit_id')
  from public.activity_logs a
  where a.action = 'progress_complete'
   and nullif(trim(a.details ->> 'scope_id'), '') is not null
   and a.details ->> 'scope_id' not like 'course:%'
   and nullif(trim(a.details ->> 'unit_id'), '') is not null
 ),

 unique_units as (
  -- Nhiều tệp, nhiều lần nộp hoặc nhiều nguồn:
  -- cùng học sinh + khóa + bài chỉ tính một lần.
  select distinct
   e.user_id,
   e.scope_key,
   e.unit_key
  from evidence e
  where e.scope_key is not null
   and e.unit_key is not null
 ),

 completed as (
  select
   u.user_id,
   count(*)::bigint as distinct_lessons
  from unique_units u
  group by u.user_id
 ),

 student_data as (
  select
   p.user_id,
   coalesce(p.full_name, 'Học sinh')::text as full_name,
   coalesce(p.class_code, '')::text as class_code,
   coalesce(ls.active_seconds, 0)::bigint as active_seconds,
   coalesce(c.distinct_lessons, 0)::bigint as distinct_lessons,
   coalesce(ls.total_submissions, 0)::bigint as total_submissions
  from public.profiles p

  left join public.learning_lifetime_stats ls
   on ls.user_id = p.user_id

  left join completed c
   on c.user_id = p.user_id

  where coalesce(p.class_code, '') <> 'GV'
   and (
    coalesce(p_scope, 'overall') <> 'class'
    or p.class_code = p_class_code
   )
 ),

 ranked as (
  select
   row_number() over (
    order by
     case
      when coalesce(p_metric, 'time') = 'submissions'
      then distinct_lessons
     end desc nulls last,

     case
      when coalesce(p_metric, 'time') = 'submissions'
      then total_submissions
     end desc nulls last,

     case
      when coalesce(p_metric, 'time') <> 'submissions'
      then active_seconds
     end desc nulls last,

     full_name asc,
     user_id asc
   ) as rank_no,
   *
  from student_data
  where active_seconds > 0
   or total_submissions > 0
   or distinct_lessons > 0
 )

 select
  r.rank_no,
  r.user_id,
  r.full_name,
  r.class_code,
  r.active_seconds,
  r.distinct_lessons,
  r.total_submissions,
  r.user_id = auth.uid() as is_me
 from ranked r
 order by r.rank_no
 limit greatest(
  1,
  least(coalesce(p_limit, 100), 500)
 );

$function$;

-- ---- handle_new_user_profile ----
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin

  insert into public.profiles (
    user_id,
    full_name,
    email,
    class_code,
    account_type,
    approval_status,
    created_at,
    updated_at
  )
  values (
    new.id,

    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      ''
    ),

    lower(coalesce(new.email, '')),

    coalesce(
      new.raw_user_meta_data ->> 'class_code',
      ''
    ),

    case
      when coalesce(new.raw_app_meta_data ->> 'role','') = 'teacher'
        then 'teacher'
      else 'student'
    end,

    case
      when coalesce(new.raw_app_meta_data ->> 'role','') = 'teacher'
        then 'approved'
      else 'pending'
    end,

    now(),
    now()
  )

  on conflict (user_id)
  do update set
    email = excluded.email,
    updated_at = now();

  return new;
end;
$function$;

-- ---- homework_set_updated_at ----
CREATE OR REPLACE FUNCTION public.homework_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

-- ---- mark_homework_submission_viewed ----
CREATE OR REPLACE FUNCTION public.mark_homework_submission_viewed(p_submission_id uuid)
 RETURNS homework_submissions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.homework_submissions;
begin
  update public.homework_submissions
  set
    student_viewed_at = coalesce(student_viewed_at, now()),
    purge_after = coalesce(purge_after, now() + interval '24 hours')
  where id = p_submission_id
    and user_id = auth.uid()
    and status in ('graded', 'revision_required')
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Không tìm thấy bài đã chấm hoặc bạn không có quyền xác nhận.';
  end if;

  return v_row;
end;
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

-- ---- ntc_begin_game_run ----
CREATE OR REPLACE FUNCTION public.ntc_begin_game_run(p_assignment uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 a record;
 v uuid;
 done integer;
begin
 select x.*,c.word_count,c.label into a
 from public.ntc_game_assignments x
 join public.ntc_game_catalog c
  on c.level=x.level and c.unit_key=x.unit_key
 where x.id=p_assignment
 for update of x;

 if not found
  or a.archived
  or now()<a.opens_at
  or now()>a.closes_at then
  raise exception 'Bài chưa mở hoặc đã hết hạn';
 end if;

 if not exists(
  select 1
  from public.ntc_game_recipients
  where assignment_id=p_assignment and user_id=auth.uid()
 ) or not exists(
  select 1
  from public.profiles
  where user_id=auth.uid() and approval_status='approved'
 ) then
  raise exception 'Bạn chưa được giao bài này';
 end if;

 select count(*) into done
 from public.ntc_game_runs
 where assignment_id=p_assignment
  and user_id=auth.uid()
  and finished_at is not null;

 if done>=a.required_runs then
  raise exception 'Bạn đã đủ số lượt được giao';
 end if;

 insert into public.ntc_game_runs(assignment_id,user_id)
 values(p_assignment,auth.uid())
 on conflict(assignment_id,user_id)
 where finished_at is null
 do update set assignment_id=excluded.assignment_id
 returning id into v;

 return jsonb_build_object(
  'run_id',v,
  'assignment_id',a.id,
  'mode',a.mode,
  'level',a.level,
  'unit_key',a.unit_key,
  'difficulty',a.difficulty,
  'required_runs',a.required_runs,
  'completed_runs',done,
  'word_count',a.word_count,
  'label',a.label
 );
end
$function$;

-- ---- ntc_close_assigned_checkpoint ----
CREATE OR REPLACE FUNCTION public.ntc_close_assigned_checkpoint()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 update public.ntc_vocabulary_progress
 set snapshot=null,
     completed=true,
     revision=revision+1,
     updated_at=now()
 where user_id=new.user_id and run_id=new.id;

 return new;
end;
$function$;

-- ---- ntc_configure_homework_ui ----
CREATE OR REPLACE FUNCTION public.ntc_configure_homework_ui(p_course_code text, p_lesson_code text, p_lesson_name text, p_class_codes text[], p_opens_at timestamp with time zone, p_closes_at timestamp with time zone, p_allow_writing boolean, p_allow_vocabulary_audio boolean, p_allow_text_audio boolean, p_writing_parts integer, p_vocabulary_parts integer, p_text_parts integer, p_allow_resubmit boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 classes text[];
 v_code text;
 result jsonb;
begin
 if not public.ntc_teacher() then
  raise exception 'Chỉ giáo viên được giao bài';
 end if;

 select array_agg(distinct upper(trim(c))) into classes
 from unnest(p_class_codes) c
 where nullif(trim(c),'') is not null;

 if coalesce(cardinality(classes),0)=0
  or p_opens_at is null
  or p_closes_at is null
  or p_closes_at<=p_opens_at then
  raise exception 'Chọn lớp và thời gian nhận bài hợp lệ';
 end if;

 perform public.configure_homework_for_classes(
  p_course_code=>p_course_code,
  p_lesson_code=>p_lesson_code,
  p_lesson_name=>p_lesson_name,
  p_class_codes=>classes,
  p_opens_at=>p_opens_at,
  p_closes_at=>p_closes_at,
  p_allow_writing=>p_allow_writing,
  p_allow_vocabulary_audio=>p_allow_vocabulary_audio,
  p_allow_text_audio=>p_allow_text_audio,
  p_writing_parts=>p_writing_parts::smallint,
  p_vocabulary_parts=>p_vocabulary_parts::smallint,
  p_text_parts=>p_text_parts::smallint,
  p_allow_resubmit=>p_allow_resubmit
 );

 update public.homework_windows w
 set archived_at=null
 where w.lesson_code=p_lesson_code
  and upper(trim(w.course_code))=upper(trim(p_course_code))
  and upper(trim(w.class_code))=any(classes)
  and w.is_enabled
  and w.opens_at=p_opens_at
  and w.closes_at=p_closes_at;

 foreach v_code in array classes loop
  if not exists(
   select 1
   from public.homework_windows w
   where w.lesson_code=p_lesson_code
    and upper(trim(w.course_code))=upper(trim(p_course_code))
    and upper(trim(w.class_code))=v_code
    and w.archived_at is null
    and w.is_enabled
    and w.opens_at=p_opens_at
    and w.closes_at=p_closes_at
  ) then
   raise exception
    'Chưa xác nhận mở bài cho lớp %. Thao tác đã được hoàn tác.',
    v_code;
  end if;
 end loop;

 select jsonb_agg(to_jsonb(w)) into result
 from public.homework_windows w
 where w.lesson_code=p_lesson_code
  and upper(trim(w.course_code))=upper(trim(p_course_code))
  and upper(trim(w.class_code))=any(classes)
  and w.archived_at is null
  and w.is_enabled
  and w.opens_at=p_opens_at
  and w.closes_at=p_closes_at;

 return result;
end
$function$;

-- ---- ntc_create_class ----
CREATE OR REPLACE FUNCTION public.ntc_create_class(p_code text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v text:=upper(trim(p_code));
begin
 if not public.ntc_teacher() then
  raise exception 'Chỉ giáo viên được tạo lớp';
 end if;

 if v is null or length(v)<1 or length(v)>40 then
  raise exception 'Mã lớp cần 1–40 ký tự';
 end if;

 insert into public.ntc_game_classes(code)
 values(v)
 on conflict do nothing;

 return v;
end
$function$;

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

 v_code:=public.ntc_create_class(p_code);

 delete from public.ntc_hidden_classes h
 where h.code=v_code;

 return v_code;
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

-- ---- ntc_finish_game_run ----
CREATE OR REPLACE FUNCTION public.ntc_finish_game_run(p_run uuid, p_correct integer, p_total integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 r record;
 a record;
 n integer;
begin
 select * into r
 from public.ntc_game_runs
 where id=p_run and user_id=auth.uid()
 for update;

 if not found then
  raise exception 'Không tìm thấy lượt chơi của bạn';
 end if;

 select x.*,c.word_count into a
 from public.ntc_game_assignments x
 join public.ntc_game_catalog c
  on c.level=x.level and c.unit_key=x.unit_key
 where x.id=r.assignment_id;

 if not found then
  raise exception 'Không tìm thấy bài được giao';
 end if;

 if r.finished_at is null then
  if not exists (
   select 1 from public.profiles
   where user_id=auth.uid()
    and approval_status='approved'
  ) then
   raise exception 'Tài khoản đã bị khóa';
  end if;

  if a.archived or now()>a.closes_at then
   raise exception 'Bài đã hết hạn hoặc bị đóng';
  end if;

  if p_total is distinct from a.word_count
   or p_correct is null
   or p_correct not between 0 and p_total then
   raise exception 'Kết quả không hợp lệ';
  end if;

  update public.ntc_game_runs
  set finished_at=now(),
      correct=p_correct,
      total=p_total,
      score=p_correct*10
  where id=p_run;

  r.correct:=p_correct;
  r.total:=p_total;
 end if;

 perform public.ntc_record_vocabulary_game(
  a.mode,a.level,a.unit_key,a.difficulty,
  r.correct,r.total
 );

 select count(*) into n
 from public.ntc_game_runs
 where assignment_id=r.assignment_id
  and user_id=auth.uid()
  and finished_at is not null;

 return jsonb_build_object(
  'completed_runs',n,
  'required_runs',a.required_runs,
  'record_saved',true,
  'score',r.correct*10
 );
end;
$function$;

-- ---- ntc_finish_vocabulary_progress ----
CREATE OR REPLACE FUNCTION public.ntc_finish_vocabulary_progress(p_mode text, p_level integer, p_unit text, p_difficulty text, p_correct integer, p_total integer, p_expected_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 k text;
 r public.ntc_vocabulary_progress;
 result jsonb;
begin
 k:=public.ntc_vocabulary_progress_key(
  p_mode,p_level,p_unit,p_difficulty,null
 );

 perform pg_advisory_xact_lock(
  hashtextextended(auth.uid()::text||':'||k,0)
 );

 select * into r
 from public.ntc_vocabulary_progress
 where user_id=auth.uid() and progress_key=k
 for update;

 if not found then
  raise exception 'Chưa có dữ liệu hoàn thành lượt chơi';
 end if;

 if r.snapshot is null and r.completed then
  return jsonb_build_object(
   'saved',true,
   'already_saved',true,
   'revision',r.revision
  );
 end if;

 if p_expected_revision is distinct from r.revision then
  raise exception 'Tiến độ đã thay đổi trên thiết bị khác';
 end if;

 if r.snapshot->>'phase' is distinct from 'ready_to_save'
  or (r.snapshot->>'first_correct')::integer
     is distinct from p_correct
  or (r.snapshot->>'total')::integer
     is distinct from p_total then
  raise exception 'Lượt chơi chưa hoàn tất hoặc kết quả không khớp';
 end if;

 result:=public.ntc_record_vocabulary_game(
  p_mode,p_level,p_unit,p_difficulty,p_correct,p_total
 );

 update public.ntc_vocabulary_progress
 set snapshot=null,
     completed=true,
     revision=revision+1,
     updated_at=now()
 where user_id=auth.uid() and progress_key=k;

 return result||jsonb_build_object('revision',r.revision+1);
end;
$function$;

-- ---- ntc_guard_hsk3_writing ----
CREATE OR REPLACE FUNCTION public.ntc_guard_hsk3_writing()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 q jsonb;
 number integer:=27;
begin
 if new.hsk46_payload->>'level' is distinct from '3' then
  return new;
 end if;

 if jsonb_typeof(new.hsk46_payload->'questions')
    is distinct from 'array' then
  raise exception 'Bài HSK3 thiếu danh sách câu trả lời';
 end if;

 if jsonb_array_length(new.hsk46_payload->'questions')<>30 then
  raise exception 'HSK3 phải gửi toàn bài gồm 30 câu';
 end if;

 if tg_op='INSERT' and (
  new.teacher_rating is not null
  or new.teacher_feedback is not null
  or new.graded_at is not null
  or new.graded_by is not null
  or new.teacher_audio_path is not null
  or new.student_viewed_at is not null
  or new.purge_after is not null
 ) then
  raise exception 'Bài mới nộp chưa được có dữ liệu chấm';
 end if;

 if tg_op='UPDATE' and new.status='graded' and (
  old.status is distinct from new.status
  or old.hsk46_return is distinct from new.hsk46_return
 ) then
  if not public.ntc_teacher() then
   raise exception 'Chỉ giáo viên được chấm';
  end if;

  if jsonb_typeof(new.hsk46_return->'questions')
     is distinct from 'array' then
   raise exception 'Cần chấm cả ba câu 28–30';
  end if;

  if jsonb_array_length(new.hsk46_return->'questions')<>3 then
   raise exception 'Cần chấm cả ba câu 28–30';
  end if;

  for q in
   select value
   from jsonb_array_elements(new.hsk46_return->'questions')
  loop
   number:=number+1;

   if q->>'n' is distinct from number::text
    or jsonb_typeof(q->'correction') is distinct from 'string'
    or nullif(btrim(q->>'correction'),'') is null then
    raise exception
     'Cần bản sửa theo thứ tự câu 28, 29, 30';
   end if;
  end loop;
 end if;

 return new;
end;
$function$;

-- ---- ntc_guard_hsk46_payload ----
CREATE OR REPLACE FUNCTION public.ntc_guard_hsk46_payload()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  w public.homework_windows;
  previous public.homework_submissions;
  q jsonb;
  lesson integer;
  level_code text;
  n integer := 0;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.hsk46_payload IS DISTINCT FROM OLD.hsk46_payload THEN
      RAISE EXCEPTION 'Không được thay đổi nội dung bài đã nộp';
    END IF;

    IF NEW.hsk46_return IS DISTINCT FROM OLD.hsk46_return
       AND NOT public.ntc_teacher() THEN
      RAISE EXCEPTION 'Chỉ giáo viên được sửa phiếu trả bài';
    END IF;
  END IF;

  IF NEW.hsk46_payload IS NULL THEN
    IF NEW.hsk46_return IS NOT NULL THEN
      RAISE EXCEPTION 'Phiếu trả bài thiếu nội dung HSK4/HSK6';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.workbook_payload IS NOT NULL THEN
    RAISE EXCEPTION 'Không được trộn nội dung HSK5 với HSK4/HSK6';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.window_id IS DISTINCT FROM OLD.window_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.attempt_number IS DISTINCT FROM OLD.attempt_number
       OR NEW.submission_kind IS DISTINCT FROM OLD.submission_kind
       OR NEW.part_key IS DISTINCT FROM OLD.part_key THEN
      RAISE EXCEPTION
        'Không được chuyển bài nộp sang học sinh hoặc bài khác';
    END IF;

    IF NOT public.ntc_teacher() AND (
      NEW.user_id IS DISTINCT FROM auth.uid()
      OR (to_jsonb(NEW) - ARRAY['student_viewed_at','purge_after'])
         IS DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['student_viewed_at','purge_after'])
    ) THEN
      RAISE EXCEPTION 'Học sinh không được tự sửa hoặc mở lại bài';
    END IF;
  END IF;

  IF NEW.hsk46_return IS NOT NULL THEN
    IF jsonb_typeof(NEW.hsk46_return) IS DISTINCT FROM 'object'
       OR octet_length(NEW.hsk46_return::text) > 250000 THEN
      RAISE EXCEPTION 'Phiếu trả bài không hợp lệ hoặc quá lớn';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NULL
       OR NEW.user_id IS DISTINCT FROM auth.uid()
       OR public.ntc_teacher() THEN
      RAISE EXCEPTION 'Sai người nộp bài';
    END IF;

    IF NEW.status <> 'pending'
       OR NEW.submission_kind <> 'writing'
       OR NEW.part_key <> 'full'
       OR NEW.hsk46_return IS NOT NULL THEN
      RAISE EXCEPTION 'Phải nộp toàn bài và chờ giáo viên chấm';
    END IF;

    SELECT * INTO w
    FROM public.homework_windows
    WHERE id = NEW.window_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Không tìm thấy bài được giao';
    END IF;

    IF w.lesson_code ~ '^hsk3-sbt([1-9]|1[0-8])$' THEN
      level_code := '3';
      lesson := substring(w.lesson_code FROM 9)::integer;
    ELSIF w.lesson_code ~ '^hsk4-bt([1-9]|1[0-9]|20)$' THEN
      level_code := '4';
      lesson := substring(w.lesson_code FROM 8)::integer;
    ELSIF w.lesson_code ~ '^hsk6-sbt([1-9]|[12][0-9]|3[0-9]|40)$' THEN
      level_code := '6';
      lesson := substring(w.lesson_code FROM 9)::integer;
    ELSE
      RAISE EXCEPTION 'Sai mã bài HSK4/HSK6';
    END IF;

    IF NOT w.allow_writing
       OR NOT COALESCE(
         public.can_submit_homework(NEW.window_id, NEW.user_id),
         false
       ) THEN
      RAISE EXCEPTION
        'Bài chưa mở, đã hết hạn hoặc chưa được phép nộp';
    END IF;

    IF jsonb_typeof(NEW.hsk46_payload) IS DISTINCT FROM 'object'
       OR octet_length(NEW.hsk46_payload::text) > 500000
       OR (NEW.hsk46_payload->>'version') IS DISTINCT FROM '1'
       OR (NEW.hsk46_payload->>'level') IS DISTINCT FROM level_code
       OR (NEW.hsk46_payload->>'lesson')
          IS DISTINCT FROM lesson::text
       OR jsonb_typeof(NEW.hsk46_payload->'draft')
          IS DISTINCT FROM 'object'
       OR jsonb_typeof(NEW.hsk46_payload->'questions')
          IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Nội dung bài nộp không hợp lệ';
    END IF;

    IF jsonb_array_length(NEW.hsk46_payload->'questions')
       NOT BETWEEN 1 AND 200 THEN
      RAISE EXCEPTION 'Danh sách câu trả lời không hợp lệ';
    END IF;

    FOR q IN
      SELECT value
      FROM jsonb_array_elements(NEW.hsk46_payload->'questions')
    LOOP
      n := n + 1;

      IF (q->>'n') IS DISTINCT FROM n::text
         OR jsonb_typeof(q->'answer') IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION 'Sai thứ tự hoặc kiểu câu trả lời';
      END IF;
    END LOOP;

    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        NEW.window_id::text || ':' || NEW.user_id::text,
        0
      )
    );

    SELECT * INTO previous
    FROM public.homework_submissions s
    WHERE s.window_id = NEW.window_id
      AND s.user_id = NEW.user_id
      AND s.submission_kind = 'writing'
      AND s.part_key = 'full'
    ORDER BY s.attempt_number DESC
    LIMIT 1;

    IF FOUND AND previous.status <> 'revision_required' THEN
      RAISE EXCEPTION
        'Bài đã nộp; chỉ nộp lại khi giáo viên yêu cầu';
    END IF;

    IF NEW.attempt_number <>
       COALESCE(previous.attempt_number, 0) + 1 THEN
      RAISE EXCEPTION 'Sai số lần nộp; hãy tải lại trạng thái';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.status = 'graded'
     AND (
       OLD.status IS DISTINCT FROM NEW.status
       OR NEW.hsk46_return IS DISTINCT FROM OLD.hsk46_return
     ) THEN
    IF NOT public.ntc_teacher()
       OR NULLIF(
         btrim(NEW.hsk46_return->>'correction'), ''
       ) IS NULL THEN
      RAISE EXCEPTION
        'Giáo viên cần nhập nhận xét hoặc bản sửa trước khi trả bài';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ---- ntc_guard_hsk46_payload_before_reopen_20261106 ----
CREATE OR REPLACE FUNCTION public.ntc_guard_hsk46_payload_before_reopen_20261106()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  w public.homework_windows;
  previous public.homework_submissions;
  q jsonb;
  lesson integer;
  level_code text;
  n integer := 0;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.hsk46_payload IS DISTINCT FROM OLD.hsk46_payload THEN
      RAISE EXCEPTION 'Không được thay đổi nội dung bài đã nộp';
    END IF;

    IF NEW.hsk46_return IS DISTINCT FROM OLD.hsk46_return
       AND NOT public.ntc_teacher() THEN
      RAISE EXCEPTION 'Chỉ giáo viên được sửa phiếu trả bài';
    END IF;
  END IF;

  IF NEW.hsk46_payload IS NULL THEN
    IF NEW.hsk46_return IS NOT NULL THEN
      RAISE EXCEPTION 'Phiếu trả bài thiếu nội dung HSK4/HSK6';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.workbook_payload IS NOT NULL THEN
    RAISE EXCEPTION 'Không được trộn nội dung HSK5 với HSK4/HSK6';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.window_id IS DISTINCT FROM OLD.window_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.attempt_number IS DISTINCT FROM OLD.attempt_number
       OR NEW.submission_kind IS DISTINCT FROM OLD.submission_kind
       OR NEW.part_key IS DISTINCT FROM OLD.part_key THEN
      RAISE EXCEPTION
        'Không được chuyển bài nộp sang học sinh hoặc bài khác';
    END IF;

    IF NOT public.ntc_teacher() AND (
      NEW.user_id IS DISTINCT FROM auth.uid()
      OR (to_jsonb(NEW) - ARRAY['student_viewed_at','purge_after'])
         IS DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['student_viewed_at','purge_after'])
    ) THEN
      RAISE EXCEPTION 'Học sinh không được tự sửa hoặc mở lại bài';
    END IF;
  END IF;

  IF NEW.hsk46_return IS NOT NULL THEN
    IF jsonb_typeof(NEW.hsk46_return) IS DISTINCT FROM 'object'
       OR octet_length(NEW.hsk46_return::text) > 250000 THEN
      RAISE EXCEPTION 'Phiếu trả bài không hợp lệ hoặc quá lớn';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NULL
       OR NEW.user_id IS DISTINCT FROM auth.uid()
       OR public.ntc_teacher() THEN
      RAISE EXCEPTION 'Sai người nộp bài';
    END IF;

    IF NEW.status <> 'pending'
       OR NEW.submission_kind <> 'writing'
       OR NEW.part_key <> 'full'
       OR NEW.hsk46_return IS NOT NULL THEN
      RAISE EXCEPTION 'Phải nộp toàn bài và chờ giáo viên chấm';
    END IF;

    SELECT * INTO w
    FROM public.homework_windows
    WHERE id = NEW.window_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Không tìm thấy bài được giao';
    END IF;

    IF w.lesson_code ~ '^hsk3-sbt([1-9]|1[0-8])$' THEN
      level_code := '3';
      lesson := substring(w.lesson_code FROM 9)::integer;
    ELSIF w.lesson_code ~ '^hsk4-bt([1-9]|1[0-9]|20)$' THEN
      level_code := '4';
      lesson := substring(w.lesson_code FROM 8)::integer;
    ELSIF w.lesson_code ~ '^hsk6-sbt([1-9]|[12][0-9]|3[0-9]|40)$' THEN
      level_code := '6';
      lesson := substring(w.lesson_code FROM 9)::integer;
    ELSE
      RAISE EXCEPTION 'Sai mã bài HSK4/HSK6';
    END IF;

    IF w.archived_at IS NOT NULL
       OR NOT w.allow_writing
       OR NOT COALESCE(
         public.can_submit_homework(NEW.window_id, NEW.user_id),
         false
       ) THEN
      RAISE EXCEPTION
        'Bài chưa mở, đã hết hạn hoặc chưa được phép nộp';
    END IF;

    IF jsonb_typeof(NEW.hsk46_payload) IS DISTINCT FROM 'object'
       OR octet_length(NEW.hsk46_payload::text) > 500000
       OR (NEW.hsk46_payload->>'version') IS DISTINCT FROM '1'
       OR (NEW.hsk46_payload->>'level') IS DISTINCT FROM level_code
       OR (NEW.hsk46_payload->>'lesson')
          IS DISTINCT FROM lesson::text
       OR jsonb_typeof(NEW.hsk46_payload->'draft')
          IS DISTINCT FROM 'object'
       OR jsonb_typeof(NEW.hsk46_payload->'questions')
          IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Nội dung bài nộp không hợp lệ';
    END IF;

    IF jsonb_array_length(NEW.hsk46_payload->'questions')
       NOT BETWEEN 1 AND 200 THEN
      RAISE EXCEPTION 'Danh sách câu trả lời không hợp lệ';
    END IF;

    FOR q IN
      SELECT value
      FROM jsonb_array_elements(NEW.hsk46_payload->'questions')
    LOOP
      n := n + 1;

      IF (q->>'n') IS DISTINCT FROM n::text
         OR jsonb_typeof(q->'answer') IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION 'Sai thứ tự hoặc kiểu câu trả lời';
      END IF;
    END LOOP;

    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        NEW.window_id::text || ':' || NEW.user_id::text,
        0
      )
    );

    SELECT * INTO previous
    FROM public.homework_submissions s
    WHERE s.window_id = NEW.window_id
      AND s.user_id = NEW.user_id
      AND s.submission_kind = 'writing'
      AND s.part_key = 'full'
    ORDER BY s.attempt_number DESC
    LIMIT 1;

    IF FOUND AND previous.status <> 'revision_required' THEN
      RAISE EXCEPTION
        'Bài đã nộp; chỉ nộp lại khi giáo viên yêu cầu';
    END IF;

    IF NEW.attempt_number <>
       COALESCE(previous.attempt_number, 0) + 1 THEN
      RAISE EXCEPTION 'Sai số lần nộp; hãy tải lại trạng thái';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.status = 'graded'
     AND (
       OLD.status IS DISTINCT FROM NEW.status
       OR NEW.hsk46_return IS DISTINCT FROM OLD.hsk46_return
     ) THEN
    IF NOT public.ntc_teacher()
       OR NULLIF(
         btrim(NEW.hsk46_return->>'correction'), ''
       ) IS NULL THEN
      RAISE EXCEPTION
        'Giáo viên cần nhập nhận xét hoặc bản sửa trước khi trả bài';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ---- ntc_guard_hsk5_payload ----
CREATE OR REPLACE FUNCTION public.ntc_guard_hsk5_payload()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 w public.homework_windows;
 previous public.homework_submissions;
 q jsonb;
 n integer:=0;
begin
 if tg_op='UPDATE' then
  if new.workbook_payload is distinct from old.workbook_payload then
   raise exception 'Không được thay đổi nội dung bài đã nộp';
  end if;

  if new.teacher_return is distinct from old.teacher_return
   and not public.ntc_teacher() then
   raise exception 'Chỉ giáo viên được sửa phiếu trả bài';
  end if;
 end if;

 if tg_op='INSERT' and new.teacher_return is not null then
  raise exception 'Bài mới nộp chưa được có phiếu chấm';
 end if;

 select * into w
 from public.homework_windows
 where id=new.window_id;

 if w.lesson_code !~ '^hsk5-sbt([1-9]|[12][0-9]|3[0-6])$' then
  if tg_op='INSERT' and new.workbook_payload is not null then
   raise exception 'Sai mã bài HSK5';
  end if;

  return new;
 end if;

 if tg_op='UPDATE' and not public.ntc_teacher() then
  if new.user_id<>auth.uid()
   or (
    to_jsonb(new)
     -array['student_viewed_at','purge_after','updated_at']
   ) is distinct from (
    to_jsonb(old)
     -array['student_viewed_at','purge_after','updated_at']
   ) then
   raise exception
    'Học sinh chỉ được đánh dấu đã xem; không được tự mở lại hay sửa bài';
  end if;
 end if;

 if tg_op='INSERT' then
  if auth.uid() is null
   or new.user_id<>auth.uid()
   or public.ntc_teacher() then
   raise exception 'Sai người nộp bài';
  end if;

  if new.status<>'pending'
   or new.submission_kind<>'writing'
   or new.part_key<>'full' then
   raise exception 'Bài HSK5 phải gửi toàn bài và chờ chấm';
  end if;

  if jsonb_typeof(new.workbook_payload) is distinct from 'object'
   or octet_length(new.workbook_payload::text)>250000
   or (new.workbook_payload->>'lesson')
    is distinct from substring(w.lesson_code from 9)
   or jsonb_typeof(new.workbook_payload->'questions')
    is distinct from 'array'
   or jsonb_array_length(new.workbook_payload->'questions')<>32
   or jsonb_typeof(new.workbook_payload->'essay')
    is distinct from 'string'
   or length(new.workbook_payload->>'essay')>20000
   or jsonb_typeof(new.workbook_payload->'draft')
    is distinct from 'object' then
   raise exception 'Thiếu nội dung 32 câu hoặc sai bài HSK5';
  end if;

  for q in
   select value
   from jsonb_array_elements(new.workbook_payload->'questions')
  loop
   n:=n+1;

   if (q->>'n') is distinct from n::text
    or jsonb_typeof(q->'answer') is distinct from 'string' then
    raise exception 'Danh sách câu trả lời không hợp lệ';
   end if;
  end loop;

  perform pg_advisory_xact_lock(
   hashtextextended(
    new.window_id::text||':'||new.user_id::text,
    0
   )
  );

  select * into previous
  from public.homework_submissions s
  where s.window_id=new.window_id
   and s.user_id=new.user_id
   and s.part_key='full'
  order by s.attempt_number desc
  limit 1;

  if found and previous.status<>'revision_required' then
   raise exception
    'Bài đã gửi; chỉ nộp lại khi giáo viên yêu cầu';
  end if;

  if new.attempt_number<>coalesce(previous.attempt_number,0)+1 then
   raise exception 'Sai số lần nộp. Hãy tải lại trạng thái';
  end if;
 end if;

 if tg_op='UPDATE'
  and new.status='graded'
  and (
   old.status is distinct from new.status
   or new.teacher_return is distinct from old.teacher_return
  ) then
  if not public.ntc_teacher() then
   raise exception 'Chỉ giáo viên được chấm';
  end if;

  if jsonb_typeof(new.teacher_return) is distinct from 'object'
   or nullif(trim(new.teacher_return->>'correction'),'') is null
   or jsonb_typeof(new.teacher_return->'essay_score')
    is distinct from 'number'
   or (new.teacher_return->>'essay_score')::numeric
    not between 0 and 10 then
   raise exception 'Cần điểm câu 32 từ 0 đến 10 và bản sửa';
  end if;
 end if;

 return new;
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
      and (public.ntc_teacher() or p.user_id=auth.uid())
    ) as students
   from public.ntc_game_assignments a
   join public.ntc_game_catalog c
    on c.level=a.level and c.unit_key=a.unit_key
   where public.ntc_teacher()
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
     and (teacher or s.user_id=auth.uid())
   ),'[]') as students
  from public.ntc_topic_review_assignments a
  where teacher or exists (
   select 1 from public.ntc_topic_review_students s
   where s.assignment_id=a.id and s.user_id=auth.uid()
  )
 ) x;

 return jsonb_build_object(
  'server_time',now(),
  'assignments',result
 );
end $function$;

-- ---- ntc_list_vocabulary_progress ----
CREATE OR REPLACE FUNCTION public.ntc_list_vocabulary_progress()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 if auth.uid() is null or not exists(
  select 1 from public.profiles
  where user_id=auth.uid()
   and account_type='student'
   and approval_status='approved'
 ) then
  raise exception 'Cần tài khoản học sinh đã duyệt';
 end if;

 return (
  select coalesce(
   jsonb_agg(
    jsonb_build_object(
     'mode',p.mode,
     'level',p.level,
     'unit_key',p.unit_key,
     'difficulty',p.difficulty,
     'run_id',p.run_id,
     'revision',p.revision,
     'completed',p.completed,
     'has_checkpoint',p.snapshot is not null,
     'updated_at',p.updated_at
    ) order by p.updated_at desc
   ),
   '[]'::jsonb
  )
  from public.ntc_vocabulary_progress p
  left join public.ntc_game_runs r on r.id=p.run_id
  left join public.ntc_game_assignments a
   on a.id=r.assignment_id
  where p.user_id=auth.uid()
   and (
    p.run_id is null
    or (
     r.finished_at is null
     and not a.archived
     and now() between a.opens_at and a.closes_at
    )
   )
 );
end;
$function$;

-- ---- ntc_load_vocabulary_progress ----
CREATE OR REPLACE FUNCTION public.ntc_load_vocabulary_progress(p_mode text, p_level integer, p_unit text, p_difficulty text, p_run uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 k text;
 result jsonb;
begin
 k:=public.ntc_vocabulary_progress_key(
  p_mode,p_level,p_unit,p_difficulty,p_run
 );

 select jsonb_build_object(
  'revision',p.revision,
  'snapshot',p.snapshot,
  'completed',p.completed,
  'updated_at',p.updated_at
 )
 into result
 from public.ntc_vocabulary_progress p
 where p.user_id=auth.uid() and p.progress_key=k;

 return coalesce(
  result,
  jsonb_build_object(
   'revision',0,'snapshot',null,'completed',false
  )
 );
end;
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

-- ---- ntc_record_vocabulary_game ----
CREATE OR REPLACE FUNCTION public.ntc_record_vocabulary_game(p_mode text, p_level integer, p_unit text, p_difficulty text, p_correct integer, p_total integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_user uuid := auth.uid();
 v_count integer;
 v_game text;
 v_mode text;
begin
 if v_user is null or not exists (
  select 1 from public.profiles
  where user_id=v_user and account_type='student'
   and approval_status='approved'
 ) then
  raise exception 'Cần đăng nhập bằng tài khoản học sinh đã duyệt';
 end if;

 if p_mode is null or p_mode not in ('race','head')
  or p_difficulty is null
  or p_difficulty not in ('easy','medium','hard')
  or p_level is null or p_level not between 1 and 6
  or (p_level>=3 and p_difficulty='easy') then
  raise exception 'Game, cấp hoặc độ khó không hợp lệ';
 end if;

 select word_count into v_count
 from public.ntc_game_catalog
 where level=p_level and unit_key=p_unit;

 if not found or p_total is distinct from v_count
  or p_correct is null or p_correct not between 0 and v_count then
  raise exception 'Bài hoặc số câu không hợp lệ';
 end if;

 v_game := case p_mode
  when 'race' then 'dua-xe' else 'nghieng-dau'
 end;
 v_mode := 'unit='||p_unit||';difficulty='||p_difficulty;

 insert into public.game_best_records as old (
  user_id,game_id,mode,level,completed_stage,
  score,accuracy,combo,updated_at
 ) values (
  v_user,v_game,v_mode,p_level,0,p_correct*10,
  round(p_correct*100.0/v_count,2),0,now()
 )
 on conflict (user_id,game_id,mode,level) do update
 set score=excluded.score,
     accuracy=excluded.accuracy,
     updated_at=excluded.updated_at
 where excluded.score>old.score;

 return jsonb_build_object(
  'saved',true,
  'score',p_correct*10,
  'accuracy',round(p_correct*100.0/v_count,2)
 );
end;
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
  delete from public.ntc_hidden_classes h where h.code=v_code;
 end if;

 return jsonb_build_object(
  'class_code',v_code,
  'archived',has_history
 );
end
$function$;

-- ---- ntc_reopen_homework_for_student ----
CREATE OR REPLACE FUNCTION public.ntc_reopen_homework_for_student(p_window_id uuid, p_user_id uuid, p_is_allowed boolean, p_opens_at timestamp with time zone, p_closes_at timestamp with time zone, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
begin
  if auth.uid() is null
     or public.homework_is_teacher() is not true then
    raise exception 'Chỉ giáo viên được mở riêng bài cũ.';
  end if;

  if p_is_allowed is null
     or p_opens_at is null
     or p_closes_at is null
     or not isfinite(p_opens_at)
     or not isfinite(p_closes_at)
     or p_closes_at <= p_opens_at
     or (p_is_allowed and p_closes_at <= now()) then
    raise exception
      'Hãy chọn thời gian mở và hạn riêng hợp lệ.';
  end if;

  if not exists (
    select 1
    from public.profiles
    where user_id = p_user_id
      and account_type = 'student'
      and approval_status = 'approved'
  ) then
    raise exception
      'Học sinh chưa được duyệt hoặc không còn quyền học.';
  end if;

  -- Dùng kiểm tra đúng giáo viên, đúng học sinh và lớp hiện có.
  v_id := public.set_homework_student_override(
    p_window_id,
    p_user_id,
    p_is_allowed,
    p_opens_at,
    p_closes_at,
    p_reason
  );

  update public.homework_student_overrides
  set allow_closed_window = p_is_allowed
  where id = v_id;

  return v_id;
end;
$function$;

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
   from public.ntc_game_classes
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
   where not exists(
    select 1 from public.ntc_hidden_classes h
    where h.code=c.code
   )
   or exists(
    select 1 from public.profiles p
    where p.account_type='student'
     and upper(trim(p.class_code))=c.code
   )
  )
 );
end
$function$;

-- ---- ntc_save_hsk5_review_progress ----
CREATE OR REPLACE FUNCTION public.ntc_save_hsk5_review_progress(p_lesson integer, p_state jsonb, p_expected_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  uid uuid:=auth.uid();
  total integer;
  s jsonb;
  detail jsonb;
  saved_revision bigint;
  saved_at timestamptz;
  existing public.ntc_hsk5_review_progress%rowtype;
begin
  if uid is null or not exists (
    select 1 from public.profiles p
    where p.user_id=uid
      and p.account_type='student'
      and p.approval_status='approved'
  ) then
    raise exception 'Tai khoan hoc sinh chua duoc phe duyet.';
  end if;

  select word_count into total
  from public.ntc_hsk5_review_catalog
  where lesson=p_lesson;

  if total is null
    or p_expected_revision is null
    or p_expected_revision<0 then
    raise exception 'Bai hoc hoac phien ban khong hop le.';
  end if;

  s:=p_state->'student';

  if jsonb_typeof(p_state) is distinct from 'object'
    or p_state->>'version' is distinct from '1'
    or p_state->>'lesson' is distinct from p_lesson::text
    or jsonb_typeof(s) is distinct from 'object'
    or jsonb_typeof(s->'studied') is distinct from 'array'
    or jsonb_typeof(s->'memory') is distinct from 'object'
    or jsonb_typeof(s->'ui') is distinct from 'object'
    or jsonb_typeof(s->'bookmark') is distinct from 'object'
    or jsonb_typeof(s->'quizHistory') is distinct from 'array'
    or jsonb_typeof(s->'orderHistory') is distinct from 'array'
    or jsonb_typeof(s->'timeMs') is distinct from 'number'
    or octet_length(p_state::text)>1000000 then
    raise exception 'Du lieu tien do khong hop le hoac qua lon.';
  end if;

  if (s->>'timeMs')::numeric<0
    or (s->>'timeMs')::numeric>315576000000 then
    raise exception 'Thoi gian hoc khong hop le.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(s->'studied') v
    where v !~ '^[0-9]{1,3}$'
  ) then
    raise exception 'Ma tu vung khong hop le.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(s->'studied') v
    where v::integer>=total
  ) or (
    select count(*)<>count(distinct v)
    from jsonb_array_elements_text(s->'studied') v
  ) then
    raise exception 'Danh sach tu vung bi trung hoac vuot bai hoc.';
  end if;

  if s ? 'quiz'
    and s->'quiz'<>'null'::jsonb
    and jsonb_typeof(s->'quiz'->'questions')
      is distinct from 'array' then
    raise exception 'Ban luu luyen tap khong hop le.';
  end if;

  if s ? 'order'
    and s->'order'<>'null'::jsonb
    and jsonb_typeof(s->'order'->'answers')
      is distinct from 'array' then
    raise exception 'Ban luu sap xep cau khong hop le.';
  end if;

  detail:=jsonb_build_object(
    'learned',jsonb_array_length(s->'studied'),
    'total',total,
    'weak',(
      select count(*)
      from jsonb_each(s->'memory') e
      where e.value='"review"'::jsonb
    ),
    'time_ms',s->'timeMs',
    'page',s->'ui'->'page',
    'bookmark',s->'bookmark',
    'quiz_rounds',jsonb_array_length(s->'quizHistory'),
    'order_rounds',jsonb_array_length(s->'orderHistory'),
    'quiz_answered',(
      select count(*)
      from jsonb_array_elements(
        coalesce(
          nullif(s->'quiz'->'questions','null'::jsonb),
          '[]'::jsonb
        )
      ) q
      where q->'picked' is not null
        and q->'picked'<>'null'::jsonb
    ),
    'quiz_correct',(
      select count(*)
      from jsonb_array_elements(
        coalesce(
          nullif(s->'quiz'->'questions','null'::jsonb),
          '[]'::jsonb
        )
      ) q
      where q->'picked' is not null
        and q->'picked'<>'null'::jsonb
        and q->'picked'=q->'correct'
    ),
    'order_answered',jsonb_array_length(
      coalesce(
        nullif(s->'order'->'answers','null'::jsonb),
        '[]'::jsonb
      )
    ),
    'order_correct',(
      select count(*)
      from jsonb_array_elements(
        coalesce(
          nullif(s->'order'->'answers','null'::jsonb),
          '[]'::jsonb
        )
      ) a
      where a->>'ok'='true'
    )
  );

  if p_expected_revision<>0 and not exists (
    select 1 from public.ntc_hsk5_review_progress
    where user_id=uid and lesson=p_lesson
  ) then
    return jsonb_build_object(
      'conflict',true,
      'revision',0,
      'state',null
    );
  end if;

  insert into public.ntc_hsk5_review_progress as target
    (user_id,lesson,state,summary,revision,updated_at)
  values
    (uid,p_lesson,p_state,detail,1,clock_timestamp())
  on conflict (user_id,lesson) do update set
    state=excluded.state,
    summary=excluded.summary,
    revision=target.revision+1,
    updated_at=clock_timestamp()
  where target.revision=p_expected_revision
  returning revision,updated_at into saved_revision,saved_at;

  if found then
    return jsonb_build_object(
      'conflict',false,
      'revision',saved_revision,
      'updated_at',saved_at,
      'summary',detail
    );
  end if;

  select * into existing
  from public.ntc_hsk5_review_progress
  where user_id=uid and lesson=p_lesson;

  return jsonb_build_object(
    'conflict',true,
    'revision',existing.revision,
    'state',existing.state,
    'updated_at',existing.updated_at
  );
end;
$function$;

-- ---- ntc_save_hsk6_review_progress ----
CREATE OR REPLACE FUNCTION public.ntc_save_hsk6_review_progress(p_lesson integer, p_state jsonb, p_expected_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  uid uuid:=auth.uid();
  total integer;
  s jsonb;
  detail jsonb;
  saved_revision bigint;
  saved_at timestamptz;
  existing public.ntc_hsk6_review_progress%rowtype;
begin
  if uid is null or not exists (
    select 1 from public.profiles p
    where p.user_id=uid
      and p.account_type='student'
      and p.approval_status='approved'
  ) then
    raise exception 'Tai khoan hoc sinh chua duoc phe duyet.';
  end if;

  select word_count into total
  from public.ntc_hsk6_review_catalog
  where lesson=p_lesson;

  if total is null
    or p_expected_revision is null
    or p_expected_revision<0 then
    raise exception 'Bai hoc hoac phien ban khong hop le.';
  end if;

  s:=p_state->'student';

  if jsonb_typeof(p_state) is distinct from 'object'
    or p_state->>'version' is distinct from '1'
    or p_state->>'lesson' is distinct from p_lesson::text
    or jsonb_typeof(s) is distinct from 'object'
    or jsonb_typeof(s->'studied') is distinct from 'array'
    or jsonb_typeof(s->'memory') is distinct from 'object'
    or jsonb_typeof(s->'ui') is distinct from 'object'
    or jsonb_typeof(s->'bookmark') is distinct from 'object'
    or jsonb_typeof(s->'quizHistory') is distinct from 'array'
    or jsonb_typeof(s->'orderHistory') is distinct from 'array'
    or jsonb_typeof(s->'timeMs') is distinct from 'number'
    or octet_length(p_state::text)>1000000 then
    raise exception 'Du lieu tien do khong hop le hoac qua lon.';
  end if;

  if (s->>'timeMs')::numeric<0
    or (s->>'timeMs')::numeric>315576000000 then
    raise exception 'Thoi gian hoc khong hop le.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(s->'studied') v
    where v !~ '^[0-9]{1,3}$'
  ) then
    raise exception 'Ma tu vung khong hop le.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(s->'studied') v
    where v::integer>=total
  ) or (
    select count(*)<>count(distinct v)
    from jsonb_array_elements_text(s->'studied') v
  ) then
    raise exception 'Danh sach tu vung bi trung hoac vuot bai hoc.';
  end if;

  if s ? 'quiz'
    and s->'quiz'<>'null'::jsonb
    and jsonb_typeof(s->'quiz'->'questions')
      is distinct from 'array' then
    raise exception 'Ban luu luyen tap khong hop le.';
  end if;

  if s ? 'order'
    and s->'order'<>'null'::jsonb
    and jsonb_typeof(s->'order'->'answers')
      is distinct from 'array' then
    raise exception 'Ban luu sap xep cau khong hop le.';
  end if;

  detail:=jsonb_build_object(
    'learned',jsonb_array_length(s->'studied'),
    'total',total,
    'weak',(
      select count(*)
      from jsonb_each(s->'memory') e
      where e.value='"review"'::jsonb
    ),
    'time_ms',s->'timeMs',
    'page',s->'ui'->'page',
    'bookmark',s->'bookmark',
    'quiz_rounds',jsonb_array_length(s->'quizHistory'),
    'order_rounds',jsonb_array_length(s->'orderHistory'),
    'quiz_answered',(
      select count(*)
      from jsonb_array_elements(
        coalesce(
          nullif(s->'quiz'->'questions','null'::jsonb),
          '[]'::jsonb
        )
      ) q
      where q->'picked' is not null
        and q->'picked'<>'null'::jsonb
    ),
    'quiz_correct',(
      select count(*)
      from jsonb_array_elements(
        coalesce(
          nullif(s->'quiz'->'questions','null'::jsonb),
          '[]'::jsonb
        )
      ) q
      where q->'picked' is not null
        and q->'picked'<>'null'::jsonb
        and q->'picked'=q->'correct'
    ),
    'order_answered',jsonb_array_length(
      coalesce(
        nullif(s->'order'->'answers','null'::jsonb),
        '[]'::jsonb
      )
    ),
    'order_correct',(
      select count(*)
      from jsonb_array_elements(
        coalesce(
          nullif(s->'order'->'answers','null'::jsonb),
          '[]'::jsonb
        )
      ) a
      where a->>'ok'='true'
    )
  );

  if p_expected_revision<>0 and not exists (
    select 1 from public.ntc_hsk6_review_progress
    where user_id=uid and lesson=p_lesson
  ) then
    return jsonb_build_object(
      'conflict',true,
      'revision',0,
      'state',null
    );
  end if;

  insert into public.ntc_hsk6_review_progress as target
    (user_id,lesson,state,summary,revision,updated_at)
  values
    (uid,p_lesson,p_state,detail,1,clock_timestamp())
  on conflict (user_id,lesson) do update set
    state=excluded.state,
    summary=excluded.summary,
    revision=target.revision+1,
    updated_at=clock_timestamp()
  where target.revision=p_expected_revision
  returning revision,updated_at into saved_revision,saved_at;

  if found then
    return jsonb_build_object(
      'conflict',false,
      'revision',saved_revision,
      'updated_at',saved_at,
      'summary',detail
    );
  end if;

  select * into existing
  from public.ntc_hsk6_review_progress
  where user_id=uid and lesson=p_lesson;

  return jsonb_build_object(
    'conflict',true,
    'revision',existing.revision,
    'state',existing.state,
    'updated_at',existing.updated_at
  );
end;
$function$;

-- ---- ntc_save_topic_review_step ----
CREATE OR REPLACE FUNCTION public.ntc_save_topic_review_step(p_assignment uuid, p_step text DEFAULT NULL::text, p_confirm boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 a public.ntc_topic_review_assignments;
 s public.ntc_topic_review_students;
 required text[];
begin
 if auth.uid() is null or public.homework_is_teacher() then
  raise exception 'Chỉ học sinh được xác nhận ôn tập';
 end if;

 if not exists (
  select 1 from public.profiles p
  where p.user_id=auth.uid()
   and p.account_type='student'
   and p.approval_status='approved'
 ) then
  raise exception 'Tài khoản chưa được duyệt';
 end if;

 select * into a
 from public.ntc_topic_review_assignments
 where id=p_assignment
 for share;

 if not found then
  raise exception 'Không tìm thấy lần giao';
 end if;

 select * into s
 from public.ntc_topic_review_students
 where assignment_id=a.id and user_id=auth.uid()
 for update;

 if not found then
  raise exception 'Bạn không có trong danh sách nhận bài';
 end if;

 -- Thử gửi lại sẽ nhận biên nhận cũ, không ghi trùng.
 if s.completed_at is not null then
  return to_jsonb(s);
 end if;

 if not a.is_enabled
 or now()<a.opens_at or now()>a.closes_at then
  raise exception 'Bài chưa mở, đã đóng hoặc hết hạn';
 end if;

 select array_agg(value->>'id')
 into required
 from jsonb_array_elements(a.steps);

 if p_step is not null then
  if not (p_step=any(required)) then
   raise exception 'Sai bước ôn tập';
  end if;

  if not (p_step=any(s.completed_steps)) then
   s.completed_steps:=array_append(s.completed_steps,p_step);
  end if;
 end if;

 if p_confirm then
  if not (s.completed_steps @> required) then
   raise exception
    'Cần hoàn thành tất cả các bước trước khi xác nhận';
  end if;

  s.completed_at:=now();
 end if;

 update public.ntc_topic_review_students
 set completed_steps=s.completed_steps,
     started_at=coalesce(started_at,now()),
     completed_at=s.completed_at,
     updated_at=now()
 where assignment_id=a.id and user_id=auth.uid()
 returning * into s;

 return to_jsonb(s);
end $function$;

-- ---- ntc_save_vocabulary_progress ----
CREATE OR REPLACE FUNCTION public.ntc_save_vocabulary_progress(p_mode text, p_level integer, p_unit text, p_difficulty text, p_snapshot jsonb, p_expected_revision bigint, p_run uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 k text;
 old public.ntc_vocabulary_progress;
 v bigint;
 n integer;
begin
 k:=public.ntc_vocabulary_progress_key(
  p_mode,p_level,p_unit,p_difficulty,p_run
 );

 select word_count into n
 from public.ntc_game_catalog
 where level=p_level and unit_key=p_unit;

 if p_expected_revision is null or p_expected_revision<0
  or jsonb_typeof(p_snapshot) is distinct from 'object'
  or octet_length(p_snapshot::text)>250000
  or p_snapshot->>'version' is distinct from '1'
  or coalesce(p_snapshot->>'phase','')
     not in ('playing','corrections','ready_to_save')
  or jsonb_typeof(p_snapshot->'first_correct')
     is distinct from 'number'
  or jsonb_typeof(p_snapshot->'total')
     is distinct from 'number'
  or jsonb_typeof(p_snapshot->'queue')
     is distinct from 'array'
  or jsonb_typeof(p_snapshot->'wrong')
     is distinct from 'array'
  or jsonb_typeof(p_snapshot->'index')
     is distinct from 'number'
  or jsonb_typeof(p_snapshot->'remaining_ms')
     is distinct from 'number' then
  raise exception 'Dữ liệu tiếp tục lượt chơi không hợp lệ';
 end if;

 if (p_snapshot->>'total')::integer<>n
  or (p_snapshot->>'first_correct')::integer
     not between 0 and n
  or jsonb_array_length(p_snapshot->'queue')
     not between 1 and n
  or jsonb_array_length(p_snapshot->'wrong')>n
  or (p_snapshot->>'index')::integer
     not between 0 and jsonb_array_length(p_snapshot->'queue')
  or (p_snapshot->>'remaining_ms')::numeric
     not between 0 and 60000
  or (
   p_snapshot->>'phase'='ready_to_save'
   and (
    jsonb_array_length(p_snapshot->'wrong')<>0
    or (p_snapshot->>'index')::integer
       <>jsonb_array_length(p_snapshot->'queue')
   )
  ) then
  raise exception 'Số câu, điểm hoặc thời gian không hợp lệ';
 end if;

 perform pg_advisory_xact_lock(
  hashtextextended(auth.uid()::text||':'||k,0)
 );

 select * into old
 from public.ntc_vocabulary_progress
 where user_id=auth.uid() and progress_key=k
 for update;

 if coalesce(old.revision,0)<>p_expected_revision then
  return jsonb_build_object(
   'conflict',true,
   'revision',old.revision,
   'snapshot',old.snapshot,
   'completed',old.completed
  );
 end if;

 v:=coalesce(old.revision,0)+1;

 insert into public.ntc_vocabulary_progress(
  user_id,progress_key,mode,level,unit_key,
  difficulty,run_id,revision,snapshot
 )
 values(
  auth.uid(),k,p_mode,p_level,p_unit,
  p_difficulty,p_run,v,p_snapshot
 )
 on conflict(user_id,progress_key)
 do update set
  revision=v,
  snapshot=excluded.snapshot,
  updated_at=now();

 return jsonb_build_object('conflict',false,'revision',v);
end;
$function$;

-- ---- ntc_topic_review_spec ----
CREATE OR REPLACE FUNCTION public.ntc_topic_review_spec(p_topic text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
begin
  if p_topic = 'chude-giogiac' then
    return '{
      "title": "Giờ giấc",
      "steps": [
        {"id":"learn","label":"Ôn toàn bộ từ vựng về giờ giấc"},
        {"id":"clock","label":"Thực hành ít nhất ba giờ khác nhau trên đồng hồ"},
        {"id":"sentences","label":"Ôn tất cả câu mẫu"},
        {"id":"talk","label":"Luyện đủ ba tình huống nói"},
        {"id":"quiz","label":"Hoàn thành một vòng luyện tập 10 câu"}
      ]
    }'::jsonb;
  end if;

  if p_topic = 'chude-bophancothe' then
    return '{
      "title": "Bộ phận cơ thể",
      "steps": [
        {"id":"diagram","label":"Khám phá các nhóm sơ đồ cơ thể"},
        {"id":"learn","label":"Ôn toàn bộ từ vựng bộ phận cơ thể"},
        {"id":"sentences","label":"Ôn tất cả câu mẫu"},
        {"id":"talk","label":"Luyện đủ ba tình huống nói"},
        {"id":"quiz-location","label":"Hoàn thành một vòng nhìn vị trí chọn từ"},
        {"id":"quiz-listen","label":"Hoàn thành một vòng nghe chọn nghĩa"}
      ]
    }'::jsonb;
  end if;

  -- Các chủ đề còn lại dùng nguyên danh mục cũ.
  return public.ntc_topic_review_spec_before_19_20261103(p_topic);
end;
$function$;

-- ---- ntc_topic_review_spec_before_19_20261103 ----
CREATE OR REPLACE FUNCTION public.ntc_topic_review_spec_before_19_20261103(p_topic text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 with topics(id,title,keys) as (values
  ('chude-mausac','Màu sắc',
   array['learn','flash','match','memory']),
  ('chude-dongvat','Động vật',
   array['learn','flash','match','memory']),
  ('chude-chiduong','Chỉ đường',
   array['learn','flash','match','memory']),
  ('chude-traicay','Trái cây',
   array['learn','flash','match','memory']),
  ('chude-quocgia','Quốc gia',
   array['learn','flash','match','memory']),
  ('chude-douuong','Đồ uống',
   array['learn','flash','match','memory']),
  ('chude-rauqua','Rau củ',
   array['learn','flash','match','memory']),
  ('chude-trangphuc','Trang phục',
   array['learn','flash','match','memory']),
  ('chude-dogiadung','Đồ gia dụng',
   array['learn','flash','match','memory']),
  ('chude-thoitiet','Thời tiết',
   array['learn','flash','match','memory']),
  ('chude-phuongtien','Phương tiện giao thông',
   array['learn','flash','match','memory']),
  ('chude-dungcu','Dụng cụ học tập',
   array['learn','flash','match','memory']),
  ('chude-camxuc','Cảm xúc',
   array['learn','flash','match','memory']),
  ('chude-hoatdonghangngay','Hoạt động hằng ngày',
   array['learn','sentence1','sentence2','writing']),
  ('chude-sodem-ngaythang','Số đếm và ngày tháng',
   array[
    'study-number','study-date','study-week',
    'listen-number','listen-date','listen-week',
    'read-number','read-date','read-week'
   ]),
  ('chude-giadinh','Gia đình và xưng hô',
   array[
    'learn','tree','sentences',
    'quiz-relation','quiz-listen','talk'
   ]),
  ('chude-nghenghiep','Nghề nghiệp và nơi làm việc',
   array[
    'learn','places','sentences',
    'quiz-listen','quiz-image','quiz-place','talk'
   ])
 ), labels(id,label) as (values
  ('learn','Nghe và ôn toàn bộ từ vựng'),
  ('flash','Ôn hết một lượt thẻ từ'),
  ('match','Hoàn thành một vòng nối nghĩa'),
  ('memory','Hoàn thành một vòng lật thẻ'),
  ('sentence1','Luyện mẫu câu thời gian'),
  ('sentence2','Luyện mẫu câu trình tự'),
  ('writing','Viết đoạn sinh hoạt hằng ngày'),
  ('study-number','Ôn số đếm'),
  ('study-date','Ôn ngày tháng'),
  ('study-week','Ôn thứ và tuần'),
  ('listen-number','Làm hết một vòng nghe số đếm'),
  ('listen-date','Làm hết một vòng nghe ngày tháng'),
  ('listen-week','Làm hết một vòng nghe thứ và tuần'),
  ('read-number','Đọc và ghi âm một vòng số đếm'),
  ('read-date','Đọc và ghi âm một vòng ngày tháng'),
  ('read-week','Đọc và ghi âm một vòng thứ và tuần'),
  ('tree','Khám phá các nhóm trong sơ đồ gia đình'),
  ('sentences','Ôn các câu mẫu'),
  ('quiz-relation','Làm hết một vòng chọn cách gọi'),
  ('quiz-listen','Làm hết một vòng nghe chọn nghĩa'),
  ('talk','Luyện đủ ba tình huống nói'),
  ('places','Ôn nơi làm việc'),
  ('quiz-image','Làm hết một vòng nhìn ảnh chọn nghề'),
  ('quiz-place','Làm hết một vòng nghề và nơi làm việc')
 )
 select jsonb_build_object(
  'title',t.title,
  'steps',(
   select jsonb_agg(
    jsonb_build_object('id',k.id,'label',l.label)
    order by k.n
   )
   from unnest(t.keys) with ordinality k(id,n)
   join labels l on l.id=k.id
  )
 )
 from topics t where t.id=p_topic;
$function$;

-- ---- ntc_undo_move ----
CREATE OR REPLACE FUNCTION public.ntc_undo_move(p_batch uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 m record;
 v_class text;
begin
 if not public.ntc_teacher() then
  raise exception 'Chỉ giáo viên được hoàn tác';
 end if;

 if not exists(
  select 1
  from public.ntc_class_moves
  where batch_id=p_batch and teacher_id=auth.uid()
 ) then
  raise exception 'Không tìm thấy lượt chuyển của bạn';
 end if;

 for m in
  select *
  from public.ntc_class_moves
  where batch_id=p_batch and teacher_id=auth.uid()
  order by user_id
 loop
  select class_code into v_class
  from public.profiles
  where user_id=m.user_id
  for update;

  if v_class is distinct from m.to_class
   or exists(
    select 1
    from public.ntc_class_moves n
    where n.user_id=m.user_id
     and n.created_at>m.created_at
   ) then
   raise exception
    'Học sinh đã được chuyển lần khác, hãy tải lại danh sách';
  end if;

  update public.profiles
  set class_code=m.from_class
  where user_id=m.user_id;

  insert into public.ntc_class_moves(
   batch_id,user_id,from_class,to_class,teacher_id
  )
  values(
   gen_random_uuid(),
   m.user_id,
   m.to_class,
   m.from_class,
   auth.uid()
  );
 end loop;
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

-- ---- ntc_vocabulary_leaderboard ----
CREATE OR REPLACE FUNCTION public.ntc_vocabulary_leaderboard(p_mode text, p_level integer, p_unit text, p_difficulty text, p_scope text DEFAULT 'overall'::text, p_class_code text DEFAULT NULL::text, p_limit integer DEFAULT 100)
 RETURNS TABLE(rank_no bigint, user_id uuid, full_name text, class_code text, score integer, correct integer, total integer, accuracy numeric, is_me boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 v_user uuid := auth.uid();
 v_teacher boolean;
 v_class text;
 v_count integer;
 v_game text;
 v_mode text;
begin
 if v_user is null then
  raise exception 'Cần đăng nhập';
 end if;

 v_teacher := public.ntc_teacher();

 if not v_teacher and not exists (
  select 1 from public.profiles p
  where p.user_id=v_user and p.account_type='student'
   and p.approval_status='approved'
 ) then
  raise exception 'Tài khoản chưa được duyệt';
 end if;

 if p_scope is null or p_scope not in ('overall','class')
  or p_mode is null or p_mode not in ('race','head')
  or p_difficulty is null
  or p_difficulty not in ('easy','medium','hard')
  or p_level is null or p_level not between 1 and 6
  or (p_level>=3 and p_difficulty='easy') then
  raise exception 'Bộ lọc không hợp lệ';
 end if;

 select c.word_count into v_count
 from public.ntc_game_catalog c
 where c.level=p_level and c.unit_key=p_unit;

 if not found then
  raise exception 'Bài không tồn tại';
 end if;

 if p_scope='class' then
  if v_teacher then
   v_class:=coalesce(p_class_code,'');
  else
   select coalesce(p.class_code,'') into v_class
   from public.profiles p
   where p.user_id=v_user;
  end if;
 end if;

 v_game:=case p_mode
  when 'race' then 'dua-xe' else 'nghieng-dau'
 end;
 v_mode:='unit='||p_unit||';difficulty='||p_difficulty;

 return query
 with ranked as (
  select
   dense_rank() over(
    order by g.score desc,g.accuracy desc
   ) as ranking,
   row_number() over(
    order by g.score desc,g.accuracy desc,
             p.full_name,p.user_id
   ) as pos,
   p.user_id as uid,
   coalesce(p.full_name,'Học sinh')::text as student_name,
   coalesce(p.class_code,'')::text as student_class,
   g.score as points,
   g.accuracy as pct
  from public.game_best_records g
  join public.profiles p on p.user_id=g.user_id
  where g.game_id=v_game
   and g.mode=v_mode
   and g.level=p_level
   and p.account_type='student'
   and p.approval_status='approved'
   and (
    p_scope='overall'
    or coalesce(p.class_code,'')=v_class
   )
 )
 select
  r.ranking,r.uid,r.student_name,r.student_class,
  r.points,r.points/10,v_count,r.pct,r.uid=v_user
 from ranked r
 where r.pos<=greatest(1,least(coalesce(p_limit,100),500))
    or r.uid=v_user
 order by r.pos;
end;
$function$;

-- ---- ntc_vocabulary_progress_key ----
CREATE OR REPLACE FUNCTION public.ntc_vocabulary_progress_key(p_mode text, p_level integer, p_unit text, p_difficulty text, p_run uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 if auth.uid() is null or not exists(
  select 1 from public.profiles
  where user_id=auth.uid()
   and account_type='student'
   and approval_status='approved'
 ) then
  raise exception 'Cần tài khoản học sinh đã duyệt';
 end if;

 if p_mode is null or p_mode not in ('race','head')
  or p_level is null or p_level not between 1 and 6
  or p_difficulty is null
  or p_difficulty not in ('easy','medium','hard')
  or (p_level>=3 and p_difficulty='easy')
  or not exists(
   select 1 from public.ntc_game_catalog
   where level=p_level and unit_key=p_unit
  ) then
  raise exception 'Bài hoặc chế độ không hợp lệ';
 end if;

 if p_run is not null then
  perform 1
  from public.ntc_game_runs r
  join public.ntc_game_assignments a
   on a.id=r.assignment_id
  where r.id=p_run
   and r.user_id=auth.uid()
   and r.finished_at is null
   and not a.archived
   and now() between a.opens_at and a.closes_at
   and a.mode=p_mode
   and a.level=p_level
   and a.unit_key=p_unit
   and a.difficulty=p_difficulty
   and (
    select count(*)
    from public.ntc_game_runs x
    where x.assignment_id=a.id
     and x.user_id=auth.uid()
     and x.finished_at is not null
   )<a.required_runs
  for share of r,a;

  if not found then
   raise exception
    'Lượt được giao đã đóng hoặc không thuộc tài khoản này';
  end if;

  return 'run:'||p_run::text;
 end if;

 return 'free:'||p_mode||':'||p_level||':'||
        p_unit||':'||p_difficulty;
end;
$function$;

-- ---- record_homework_achievement ----
CREATE OR REPLACE FUNCTION public.record_homework_achievement(p_window_id uuid, p_submission_kind text, p_part_key text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_course_name text;
  v_lesson_name text;
  v_kind_label text;
  v_part_label text;
  v_exercise_name text;
begin
  if v_user_id is null then
    raise exception 'Bạn chưa đăng nhập.';
  end if;

  if p_submission_kind not in (
    'writing',
    'vocabulary_audio',
    'text_audio'
  ) then
    raise exception 'Loại bài nộp không hợp lệ.';
  end if;

  if not (
    p_part_key = 'full'
    or p_part_key ~ '^(part|text)-[0-9]+$'
  ) then
    raise exception 'Mã phần bài không hợp lệ.';
  end if;

  select
    coalesce(w.course_code, 'Bài tập'),
    coalesce(w.lesson_name, w.lesson_code, 'Bài tập')
  into
    v_course_name,
    v_lesson_name
  from public.homework_windows w
  where w.id = p_window_id;

  if not found then
    raise exception 'Không tìm thấy lịch giao bài.';
  end if;

  -- Chỉ ghi thành tích nếu bài thực sự đã tồn tại.
  if not exists (
    select 1
    from public.homework_submissions s
    where s.window_id = p_window_id
      and s.user_id = v_user_id
      and s.submission_kind = p_submission_kind
      and s.part_key = p_part_key
      and s.status in ('pending', 'graded', 'revision_required')
  ) then
    raise exception
      'Chưa có bản ghi nộp bài hợp lệ trong homework_submissions.';
  end if;

  v_kind_label := case p_submission_kind
    when 'writing' then 'Bài tập viết'
    when 'vocabulary_audio' then 'Đọc từ vựng'
    else 'Đọc bài khóa'
  end;

  v_part_label := case
    when p_part_key = 'full' then 'Toàn bộ'
    when p_submission_kind = 'text_audio'
      then 'Bài khóa ' ||
        regexp_replace(p_part_key, '^[^0-9]*', '')
    else 'Phần ' ||
        regexp_replace(p_part_key, '^[^0-9]*', '')
  end;

  -- UUID đầy đủ bảo đảm phân biệt chính xác từng lịch giao bài.
  v_exercise_name :=
    'Nộp bài · ' ||
    v_kind_label || ' · ' ||
    v_part_label || ' · ' ||
    p_window_id::text;

  -- Khóa cùng học sinh + bài + mục + phần để chống hai thiết bị
  -- ghi thành tích đồng thời.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_user_id::text || '|' ||
      p_window_id::text || '|' ||
      p_submission_kind || '|' ||
      p_part_key,
      0
    )
  );

  if exists (
    select 1
    from public.results r
    where r.user_id = v_user_id
      and r.course_name = v_course_name
      and r.lesson_name = v_lesson_name
      and r.exercise_name = v_exercise_name
  ) then
    return false;
  end if;

  insert into public.results (
    user_id,
    session_id,
    course_name,
    lesson_name,
    exercise_name,
    score,
    correct_count,
    total_count,
    submitted_at
  )
  values (
    v_user_id,
    null,
    v_course_name,
    v_lesson_name,
    v_exercise_name,
    100,
    1,
    1,
    now()
  );

  return true;
end;
$function$;

-- ---- record_learning_activity_tick ----
CREATE OR REPLACE FUNCTION public.record_learning_activity_tick(p_seconds integer DEFAULT 60)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_seconds integer :=
    greatest(1, least(coalesce(p_seconds,60),60));
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.learning_activity_totals(
    user_id,
    active_seconds,
    updated_at
  )
  values (
    auth.uid(),
    v_seconds,
    now()
  )
  on conflict (user_id) do update
  set active_seconds =
        public.learning_activity_totals.active_seconds
        + excluded.active_seconds,
      updated_at = now();
end;
$function$;

-- ---- record_learning_activity_tick ----
CREATE OR REPLACE FUNCTION public.record_learning_activity_tick(p_seconds integer, p_session_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_seconds integer;
begin
  if v_user_id is null then
    raise exception 'Bạn chưa đăng nhập';
  end if;

  v_seconds := greatest(1, least(coalesce(p_seconds, 1), 30));

  insert into public.learning_lifetime_stats(
    user_id,
    active_seconds,
    total_submissions,
    updated_at
  )
  values (
    v_user_id,
    v_seconds,
    0,
    now()
  )
  on conflict (user_id)
  do update set
    active_seconds =
      public.learning_lifetime_stats.active_seconds
      + excluded.active_seconds,
    updated_at = now();

  if p_session_id is not null then
    update public.learning_sessions
    set
      active_seconds = coalesce(active_seconds, 0) + v_seconds,
      last_active_at = now(),
      status = 'studying'
    where id = p_session_id
      and user_id = v_user_id;
  end if;
end;
$function$;

-- ---- rls_auto_enable ----
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
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

-- ---- submit_game_record ----
CREATE OR REPLACE FUNCTION public.submit_game_record(p_game_id text, p_mode text, p_level integer, p_completed_stage integer, p_score integer, p_accuracy numeric, p_combo integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Bạn chưa đăng nhập';
  end if;

  insert into public.game_best_records(
    user_id,
    game_id,
    mode,
    level,
    completed_stage,
    score,
    accuracy,
    combo,
    updated_at
  )
  values (
    v_user_id,
    coalesce(nullif(p_game_id, ''), 'mat-than'),
    coalesce(nullif(p_mode, ''), 'default'),
    greatest(1, least(coalesce(p_level, 1), 20)),
    greatest(0, coalesce(p_completed_stage, 0)),
    greatest(0, coalesce(p_score, 0)),
    greatest(0, least(coalesce(p_accuracy, 0), 100)),
    greatest(0, coalesce(p_combo, 0)),
    now()
  )
  on conflict (user_id, game_id, mode, level)
  do update set
    completed_stage = greatest(
      public.game_best_records.completed_stage,
      excluded.completed_stage
    ),
    score = greatest(
      public.game_best_records.score,
      excluded.score
    ),
    accuracy = greatest(
      public.game_best_records.accuracy,
      excluded.accuracy
    ),
    combo = greatest(
      public.game_best_records.combo,
      excluded.combo
    ),
    updated_at = now();
end;
$function$;

-- ---- update_learning_submission_total ----
CREATE OR REPLACE FUNCTION public.update_learning_submission_total()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.learning_lifetime_stats(
    user_id,
    active_seconds,
    total_submissions,
    updated_at
  )
  values (
    new.user_id,
    0,
    1,
    now()
  )
  on conflict (user_id)
  do update set
    total_submissions =
      public.learning_lifetime_stats.total_submissions + 1,
    updated_at = now();

  return new;
end;
$function$;
