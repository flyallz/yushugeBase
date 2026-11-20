-- 16_admin_delete_functions.sql — 超管删除三件套：删学生账号数据、删老师、删班级（迁移 16）
-- 日期：2026-11-20。只改 dev，live 不动。用户 2026-11-20 14:25 批准“删学生、删老师、删班级都补上”，只给超管用。
-- 执行：文件 16,023 字节，SQL Editor 单次粘贴上限约 7.6KB——按 §1 / §2 / §3 拆 3 块执行，每块独立可执行。
-- 依赖：10（ntc_is_admin）、08b（ntc_remove_empty_class 的删班规则）、12（teacher_material_assignments）、15（ntc_hidden_classes 过滤）。
--
-- 共通约定（与 11/12 一致）：全部 SECURITY DEFINER，只认 ntc_is_admin() 这一道门；
-- 非超管不抛错，返回 ok:false + reason（前端按 reason 写状态行）。
-- 删学生账号分两步走，缺一不可：
--   ① 本迁移的 ntc_admin_delete_student_data 先删该学生全部数据行；
--   ② Edge Function admin-delete-user 再用 service_role 的 Admin API 删 Auth 用户。
-- 顺序不能反：homework_submissions.user_id 是 ON DELETE RESTRICT 外键，先删 Auth 号会直接报错；
-- 先删数据、后删号，万一第 ② 步失败，账号只是登不进（无档案行），数据已经清干净，不留半截。
-- student-homework 桶里的文件由 Edge Function 按 <user_id>/ 与 teacher-feedback/<user_id>/
-- 前缀删（前端上传路径约定：学生作业 <user_id>/<window_id>/…，老师语音反馈 teacher-feedback/<user_id>/…）。
--
-- 刻意不删、留作历史的东西（删老师 / 删班级时也一样）：
--   - homework_windows、ntc_game_assignments、ntc_class_moves：班级的历史记录，删班规则本身就不动它们；
--   - homework_windows.created_by、homework_student_overrides.created_by、profiles.approved_by：
--     没有外键，只存一个 UUID 备查，删号后留空引用不拦删号；
--   - app_settings.updated_by：外键是 ON DELETE SET NULL，删号自动置空。
-- 删老师时必须额外处理：ntc_topic_review_assignments.created_by 是 NO ACTION 外键，
-- 不先删该老师建的主题复习指派，删 Auth 号会被拦住（见 §2）。

-- ============ §1 删学生全部数据行（仅超管；Auth 号由 Edge Function 另删） ============
-- 枚举依据：01_schema_copy.sql 里所有带 user_id 列的表（逐表核过，不猜）。
-- 顺序要求只有一条：ntc_game_runs 必须在 ntc_game_recipients 之前
-- （复合外键 (assignment_id, user_id) 无级联）；其余各表只以外键连
-- auth.users，彼此独立。homework_windows 不删（窗口是班级的，不是学生的）。
-- 返回 jsonb：{ok, reason, user_id, counts:{表名: 删除行数}}；
-- 非超管返回 {ok:false, reason:'NOT_ADMIN'}（jsonb 里的 false，与 11/12 的布尔 false 同义）。
CREATE OR REPLACE FUNCTION public.ntc_admin_delete_student_data(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_counts jsonb := '{}'::jsonb;
  v_n int;
BEGIN
  IF NOT public.ntc_is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'NOT_ADMIN');
  END IF;
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'INVALID_INPUT');
  END IF;

  DELETE FROM public.ntc_game_runs WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('ntc_game_runs', v_n);
  DELETE FROM public.ntc_game_recipients WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('ntc_game_recipients', v_n);
  DELETE FROM public.homework_submissions WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('homework_submissions', v_n);
  DELETE FROM public.homework_student_overrides WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('homework_student_overrides', v_n);
  DELETE FROM public.hsk3_attempt_reviews WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('hsk3_attempt_reviews', v_n);
  DELETE FROM public.hsk4_attempt_reviews WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('hsk4_attempt_reviews', v_n);
  DELETE FROM public.learning_sessions WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('learning_sessions', v_n);
  DELETE FROM public.learning_attempt_reviews WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('learning_attempt_reviews', v_n);
  DELETE FROM public.learning_lifetime_stats WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('learning_lifetime_stats', v_n);
  DELETE FROM public.learning_activity_totals WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('learning_activity_totals', v_n);
  DELETE FROM public.results WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('results', v_n);
  DELETE FROM public.activity_logs WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('activity_logs', v_n);
  DELETE FROM public.daily_activity_writings WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('daily_activity_writings', v_n);
  DELETE FROM public.game_best_records WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('game_best_records', v_n);
  DELETE FROM public.ntc_topic_review_students WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('ntc_topic_review_students', v_n);
  DELETE FROM public.ntc_hsk5_review_progress WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('ntc_hsk5_review_progress', v_n);
  DELETE FROM public.ntc_hsk6_review_progress WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('ntc_hsk6_review_progress', v_n);
  DELETE FROM public.ntc_vocabulary_progress WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('ntc_vocabulary_progress', v_n);
  DELETE FROM public.ntc_class_moves WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('ntc_class_moves', v_n);
  DELETE FROM public.class_members WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('class_members', v_n);
  -- 只删学生档案行；老师档案行由 §2 另行处理（§2 内部调本函数清老师的学生侧数据时也不会误删）。
  DELETE FROM public.profiles WHERE user_id = p_user_id AND account_type = 'student';
  GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('profiles', v_n);

  RETURN jsonb_build_object('ok', true, 'reason', 'OK', 'user_id', p_user_id, 'counts', v_counts);
END;
$function$;

-- ============ §2 删老师（仅超管） ============
-- 规则（用户 2026-11-20 批准）：名下任一班有学生（待审核/锁定也算）就不让删；
-- 不能删自己；不能删另一个超管。名下空班按删班规则处理（有历史存档、无历史真删）；
-- 删其资料包指派、teachers 行、老师档案行，再由 Edge Function 删 Auth 用户。
-- 返回 jsonb：{ok, reason}，reason 取值 NOT_ADMIN / INVALID_INPUT / NOT_FOUND /
-- IS_SELF / IS_ADMIN / HAS_STUDENTS / OK；成功时另带 archived_classes、deleted_classes、
-- topic_assignments_removed、pack_assignments_removed、student_data、auth_user_id
-- （auth_user_id 供 Edge Function 删号用）。
CREATE OR REPLACE FUNCTION public.ntc_admin_delete_teacher(p_teacher_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_teacher_id uuid;
  v_auth uuid;
  v_slug text;
  v_is_admin boolean;
  v_code text;
  v_has_history boolean;
  v_archived text[] := '{}';
  v_deleted text[] := '{}';
  v_topic_assignments int := 0;
  v_pack_assignments int := 0;
  v_student_cleanup jsonb;
BEGIN
  IF NOT public.ntc_is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'NOT_ADMIN');
  END IF;
  IF p_teacher_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'INVALID_INPUT');
  END IF;
  SELECT id, auth_user_id, slug, is_admin
    INTO v_teacher_id, v_auth, v_slug, v_is_admin
  FROM public.teachers WHERE id = p_teacher_id;
  IF v_teacher_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'NOT_FOUND');
  END IF;
  IF v_auth = auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'IS_SELF');
  END IF;
  IF v_is_admin THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'IS_ADMIN');
  END IF;

  -- 名下任一班有学生（任何审核状态都算）就不让删。
  IF EXISTS (
    SELECT 1 FROM public.classes c
    JOIN public.profiles p ON upper(trim(p.class_code)) = upper(trim(c.code))
    WHERE c.teacher_id = v_teacher_id AND p.account_type = 'student'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'HAS_STUDENTS');
  END IF;

  -- 名下空班按删班规则处理（08b）：有历史存档，无历史真删。
  -- 存档行 teacher_id 填该老师的 Auth UUID（不是超管的），迁移 15 的过滤按这个对。
  FOR v_code IN
    SELECT code FROM public.classes WHERE teacher_id = v_teacher_id ORDER BY code
  LOOP
    v_has_history :=
      EXISTS (SELECT 1 FROM public.homework_windows w WHERE upper(trim(w.class_code)) = upper(trim(v_code)))
      OR EXISTS (SELECT 1 FROM public.ntc_game_assignments a WHERE upper(trim(a.class_code)) = upper(trim(v_code)))
      OR EXISTS (SELECT 1 FROM public.ntc_class_moves m
                 WHERE upper(trim(m.from_class)) = upper(trim(v_code))
                    OR upper(trim(m.to_class)) = upper(trim(v_code)));
    IF v_has_history THEN
      INSERT INTO public.ntc_hidden_classes(code, teacher_id)
      VALUES (upper(trim(v_code)), v_auth)
      ON CONFLICT (code) DO UPDATE SET hidden_at = now(), teacher_id = excluded.teacher_id;
      v_archived := v_archived || upper(trim(v_code));
    ELSE
      DELETE FROM public.ntc_game_classes WHERE code = v_code;
      DELETE FROM public.classes WHERE code = v_code;
      DELETE FROM public.ntc_hidden_classes WHERE code = v_code;
      v_deleted := v_deleted || upper(trim(v_code));
    END IF;
  END LOOP;

  -- 该老师建的主题复习指派：先删学生行（assignment_id 外键无级联），再删指派；
  -- 否则 created_by 外键（NO ACTION）会拦住后面删 Auth 号。
  DELETE FROM public.ntc_topic_review_students s
  USING public.ntc_topic_review_assignments a
  WHERE s.assignment_id = a.id AND a.created_by = v_auth;
  DELETE FROM public.ntc_topic_review_assignments WHERE created_by = v_auth;
  GET DIAGNOSTICS v_topic_assignments = ROW_COUNT;

  -- 资料包指派（teachers 行删了也会级联，这里显式删，计数用）。
  DELETE FROM public.teacher_material_assignments WHERE teacher_id = v_teacher_id;
  GET DIAGNOSTICS v_pack_assignments = ROW_COUNT;

  -- 该老师万一留过学生侧数据（例如曾以学生身份上过课），一并清掉。
  v_student_cleanup := public.ntc_admin_delete_student_data(v_auth);

  -- teachers 行（classes.teacher_id 是 RESTRICT，上面已把班清完）。
  DELETE FROM public.teachers WHERE id = v_teacher_id;
  DELETE FROM public.profiles WHERE user_id = v_auth AND account_type = 'teacher';

  RETURN jsonb_build_object(
    'ok', true, 'reason', 'OK',
    'teacher_id', v_teacher_id, 'slug', v_slug, 'auth_user_id', v_auth,
    'archived_classes', to_jsonb(v_archived),
    'deleted_classes', to_jsonb(v_deleted),
    'topic_assignments_removed', v_topic_assignments,
    'pack_assignments_removed', v_pack_assignments,
    'student_data', v_student_cleanup
  );
END;
$function$;

-- ============ §3 删班级（仅超管，可删任意老师的班） ============
-- 规则与 ntc_remove_empty_class 相同，但不设归属限制：有学生（任何审核状态）就拒绝；
-- 有历史则存档，无历史则真删。存档行 teacher_id 填该班所属老师的 Auth UUID
-- （不是超管自己的），否则迁移 15 的过滤对不上。
-- 返回 jsonb：{ok, reason, class_code, archived}；非超管返回 {ok:false, reason:'NOT_ADMIN'}。
CREATE OR REPLACE FUNCTION public.ntc_admin_delete_class(p_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_code text := upper(trim(p_code));
  v_teacher_auth uuid;
  v_has_history boolean;
BEGIN
  IF NOT public.ntc_is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'NOT_ADMIN');
  END IF;
  IF v_code IS NULL OR v_code = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'INVALID_INPUT');
  END IF;
  SELECT t.auth_user_id INTO v_teacher_auth
  FROM public.classes c JOIN public.teachers t ON t.id = c.teacher_id
  WHERE upper(trim(c.code)) = v_code;
  IF v_teacher_auth IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'NOT_FOUND');
  END IF;

  -- 有学生（任何审核状态）就拒绝，与 ntc_remove_empty_class 一致。
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.account_type = 'student' AND upper(trim(p.class_code)) = v_code
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'HAS_STUDENTS');
  END IF;

  v_has_history :=
    EXISTS (SELECT 1 FROM public.homework_windows w WHERE upper(trim(w.class_code)) = v_code)
    OR EXISTS (SELECT 1 FROM public.ntc_game_assignments a WHERE upper(trim(a.class_code)) = v_code)
    OR EXISTS (SELECT 1 FROM public.ntc_class_moves m
               WHERE upper(trim(m.from_class)) = v_code OR upper(trim(m.to_class)) = v_code);
  IF v_has_history THEN
    -- 存档行 teacher_id 填班主老师的 Auth UUID（不是超管的），迁移 15 的过滤按这个对。
    INSERT INTO public.ntc_hidden_classes(code, teacher_id)
    VALUES (v_code, v_teacher_auth)
    ON CONFLICT (code) DO UPDATE SET hidden_at = now(), teacher_id = excluded.teacher_id;
  ELSE
    DELETE FROM public.ntc_game_classes WHERE code = v_code;
    DELETE FROM public.classes WHERE code = v_code;
    DELETE FROM public.ntc_hidden_classes WHERE code = v_code;
  END IF;

  RETURN jsonb_build_object('ok', true, 'reason', 'OK', 'class_code', v_code, 'archived', v_has_history);
END;
$function$;

-- ============ 验证（在 SQL Editor 里逐条跑，开发库 only；先建测试学生/老师再删） ============
-- 以普通老师身份调三个 RPC：应返回 {"ok": false, "reason": "NOT_ADMIN"}。
-- 以超管身份：删名下有学生的老师 → {"ok": false, "reason": "HAS_STUDENTS"}；
-- 删有学生的班 → HAS_STUDENTS；删自己的老师行 → IS_SELF；删另一超管 → IS_ADMIN。
-- 删学生：先记下该学生的 homework_submissions / learning_sessions 行数，再调 Edge
-- Function admin-delete-user（kind='student'），复查：profiles 行消失、Auth 用户消失、
-- 各表计数与 RPC 返回的 counts 一致、student-homework 桶里 <user_id>/ 与
-- teacher-feedback/<user_id>/ 前缀下无文件。
-- 删老师：调 Edge Function（kind='teacher'，user_id 传 teachers.id），复查：teachers 行、
-- profiles 行、Auth 用户消失；有历史的空班进 ntc_hidden_classes（teacher_id 是该老师的
-- Auth UUID）、无历史的空班从 classes 消失；该老师建的主题复习指派消失。
-- 删班级：调 ntc_admin_delete_class，复查：有历史的班只进 ntc_hidden_classes、
-- 无历史的班从 classes 消失；ntc_get_teacher_classes 不再返回该班。
