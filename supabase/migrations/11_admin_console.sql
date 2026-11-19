-- 11_admin_console.sql — 管理员控制台 RPC（迁移 11）
-- 目标：超级管理员（is_admin）在教师面板里一把管全站——
-- 看所有老师/班级/学生、批学生、跨班转学生。
-- 全部 SECURITY DEFINER：管理员的跨租户读/写不走 RLS（普通老师
-- 的 RLS 只能看到自己的班），只认 ntc_is_admin() 这一道门。
-- 依赖：07（teachers/classes/class_members）、09（profiles.class_code
-- 同步触发器）、10（ntc_is_admin / ntc_set_teacher_active）。
-- 执行顺序：在 10/10b 之后。全部语句可重放（CREATE OR REPLACE）。
-- 注意：变改类 RPC 延续 10 的约定——非管理员或参数非法时返回
-- false，不抛错，前端按 false 弹提示。

-- ============ 1. 全量老师列表 ============
-- 非管理员调：WHERE ntc_is_admin() 为假，返回空集，不报错。
CREATE OR REPLACE FUNCTION public.ntc_admin_list_teachers()
RETURNS TABLE (
  id uuid, display_name text, display_name_zh text, brand_name text,
  slug text, email text, is_active boolean, is_admin boolean,
  created_at timestamptz, class_count bigint, student_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT t.id, t.display_name, t.display_name_zh, t.brand_name, t.slug,
         t.email, t.is_active, t.is_admin, t.created_at,
         (SELECT count(*) FROM public.classes c
           WHERE c.teacher_id = t.id),
         (SELECT count(*) FROM public.profiles p
            JOIN public.classes c ON c.code = p.class_code
           WHERE c.teacher_id = t.id AND p.account_type = 'student')
  FROM public.teachers t
  WHERE public.ntc_is_admin()
  ORDER BY t.created_at;
$$;

-- ============ 2. 全量班级列表 ============
CREATE OR REPLACE FUNCTION public.ntc_admin_list_classes()
RETURNS TABLE (
  id uuid, code text, name text, teacher_id uuid,
  teacher_name text, teacher_slug text, student_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT c.id, c.code, c.name, c.teacher_id,
         t.display_name, t.slug,
         (SELECT count(*) FROM public.profiles p
           WHERE p.class_code = c.code AND p.account_type = 'student')
  FROM public.classes c
  LEFT JOIN public.teachers t ON t.id = c.teacher_id
  WHERE public.ntc_is_admin()
  ORDER BY c.code;
$$;

-- ============ 3. 全量学生列表（可按老师 / 班级过滤） ============
CREATE OR REPLACE FUNCTION public.ntc_admin_list_students(
  p_teacher_id uuid DEFAULT NULL,
  p_class_code text DEFAULT NULL
)
RETURNS TABLE (
  user_id uuid, full_name text, email text, class_code text,
  approval_status text, teacher_name text, teacher_slug text,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT p.user_id, p.full_name, p.email, p.class_code,
         p.approval_status, t.display_name, t.slug, p.created_at
  FROM public.profiles p
  LEFT JOIN public.classes c ON c.code = p.class_code
  LEFT JOIN public.teachers t ON t.id = c.teacher_id
  WHERE p.account_type = 'student'
    AND public.ntc_is_admin()
    AND (p_teacher_id IS NULL OR t.id = p_teacher_id)
    AND (p_class_code IS NULL
         OR upper(trim(p.class_code)) = upper(trim(p_class_code)))
  ORDER BY p.created_at DESC
  LIMIT 500;
$$;

-- ============ 4. 管理员批学生 ============
-- 语义与教师端 setStudentApproval 的 patch 一致：批过写 approved_at /
-- approved_by，改成 blocked / rejected 时两字段清掉。
CREATE OR REPLACE FUNCTION public.ntc_admin_set_student_approval(
  p_user_id uuid, p_status text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_rows int;
BEGIN
  IF NOT public.ntc_is_admin() THEN RETURN false; END IF;
  IF p_status NOT IN ('approved', 'blocked', 'rejected') THEN
    RETURN false;
  END IF;
  UPDATE public.profiles
  SET approval_status = p_status,
      approved_at = CASE WHEN p_status = 'approved' THEN now() ELSE NULL END,
      approved_by = CASE WHEN p_status = 'approved' THEN auth.uid() ELSE NULL END,
      updated_at = now()
  WHERE user_id = p_user_id AND account_type = 'student';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

-- ============ 5. 管理员跨班转学生 ============
-- 目标班必须在 classes 表里存在（按 code 不区分大小写匹配，写入时用
-- 表里存的原始 code）。09 的同步触发器会跟着改 class_members。
CREATE OR REPLACE FUNCTION public.ntc_admin_move_student(
  p_user_id uuid, p_to_class text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_code text; v_rows int;
BEGIN
  IF NOT public.ntc_is_admin() THEN RETURN false; END IF;
  SELECT code INTO v_code FROM public.classes
  WHERE upper(code) = upper(trim(p_to_class));
  IF v_code IS NULL THEN RETURN false; END IF;
  UPDATE public.profiles
  SET class_code = v_code, updated_at = now()
  WHERE user_id = p_user_id AND account_type = 'student';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

-- ============ 验证（在 SQL Editor 里逐条跑） ============
-- SELECT count(*) FROM public.ntc_admin_list_teachers();   -- 以管理员身份应 > 0
-- SELECT count(*) FROM public.ntc_admin_list_classes();    -- 以管理员身份应 > 0
-- SELECT count(*) FROM public.ntc_admin_list_students();   -- 以管理员身份应 > 0
-- 以普通老师身份调上面三条应返回 0 行；两个变改 RPC 应返回 false。
-- 老师停用/启用复用 10 的 ntc_set_teacher_active，不另写。
