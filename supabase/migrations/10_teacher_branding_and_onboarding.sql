-- 10_teacher_branding_and_onboarding.sql
-- 玉书阁多教师升级 · 品牌 + 入驻（只做加法，不动现有表、函数、策略）
-- 前置：07（teachers/classes/class_members）、08、09。执行顺序在 09/08b 之后。
-- 设计决定（2026-11-19，按 v2 方案“老师零配置、填表换品牌、专属链接 /t/<slug>、
-- 班级码加入”）：
--   1. 品牌字段直接放 teachers 表（品牌名、双语标语、照片、Zalo、Facebook），
--      不另建表；is_admin 标记管理员（明玉），只有管理员能审批新老师。
--   2. 首页品牌公开读：不用直接给 anon 开 teachers 表策略（表里有
--      auth_user_id 和邮箱），走 SECURITY DEFINER 的 RPC，只吐品牌字段。
--   3. 老师改自己品牌走 RPC ntc_update_my_branding，只改品牌列，
--      不碰 is_active / is_admin（所以不给 teachers 表开直接 UPDATE 策略）。
--   4. 新老师入驻走 register-teacher Edge 函数（另文件）：自助注册后
--      teachers.is_active=false（待审批），明玉在老师面板里批；
--      登录关（hoc-tap.html）只认 is_active 的老师行，待审批的进不来。
--   5. 品牌图存新公开桶 teacher-branding，上传路径以老师 Auth UID 开头，
--      策略只允许本人写自己目录；读公开。
-- 回填：只针对 slug='co-ngoc'（明玉），其他老师行不动。
-- Replay 到 live 时同样只回填 co-ngoc；新老师行由入驻流程产生。
-- 验证（执行后在 SQL Editor 跑）：
--   SELECT slug, brand_name, is_admin, photo_url FROM public.teachers ORDER BY slug;
--     -- 预期 co-ngoc：brand_name 'Ngọc Thư Các'、is_admin true、photo_url 已填
--   SELECT * FROM public.ntc_get_teacher_branding('co-ngoc');
--     -- 预期 1 行，品牌字段齐全
--   SELECT code FROM public.ntc_get_teacher_classes('co-ngoc') ORDER BY code;
--     -- 预期 9 行：GV、YGS-B001–B003、YSG001–YSG005（07 回填的全部班级都归明玉）
--   SELECT id, public FROM storage.buckets WHERE id = 'teacher-branding';
--     -- 预期 1 行，public true
--   SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
--     AND policyname LIKE 'teacher branding%';  -- 预期 4

-- ============ 1. teachers 表加品牌字段 + is_admin ============
ALTER TABLE public.teachers
  ADD COLUMN IF NOT EXISTS brand_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tagline_vi text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tagline_zh text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS photo_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS zalo_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS facebook_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- 回填明玉（首页现成信息：品牌名、标语、照片、Zalo、Facebook）。
UPDATE public.teachers
SET is_admin = true,
    brand_name = 'Ngọc Thư Các',
    tagline_vi = 'Cùng cô Ngọc học tiếng Trung',
    tagline_zh = '和明玉老师一起学中文',
    photo_url = 'assets-trang-chu/co-ngoc.jpeg',
    zalo_url = 'https://zalo.me/0932856677',
    facebook_url = 'https://www.facebook.com/ngoc.luong1993'
WHERE slug = 'co-ngoc';

-- ============ 2. 公开品牌读取 RPC ============
CREATE OR REPLACE FUNCTION public.ntc_get_teacher_branding(p_slug text)
RETURNS TABLE (
  slug text, display_name text, brand_name text,
  tagline_vi text, tagline_zh text,
  photo_url text, zalo_url text, facebook_url text
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT t.slug, t.display_name,
    COALESCE(NULLIF(t.brand_name, ''), t.display_name),
    t.tagline_vi, t.tagline_zh,
    t.photo_url, t.zalo_url, t.facebook_url
  FROM public.teachers t
  WHERE t.is_active AND lower(t.slug) = lower(trim(p_slug));
$$;

CREATE OR REPLACE FUNCTION public.ntc_get_teacher_classes(p_slug text)
RETURNS TABLE (code text, name text)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT c.code, c.name
  FROM public.classes c
  JOIN public.teachers t ON t.id = c.teacher_id
  WHERE t.is_active AND lower(t.slug) = lower(trim(p_slug))
  ORDER BY c.code;
$$;

-- ============ 3. 本人改品牌 RPC（只改品牌列） ============
CREATE OR REPLACE FUNCTION public.ntc_update_my_branding(
  p_brand_name text, p_tagline_vi text, p_tagline_zh text,
  p_photo_url text, p_zalo_url text, p_facebook_url text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_rows int;
BEGIN
  UPDATE public.teachers
  SET brand_name = p_brand_name,
      tagline_vi = p_tagline_vi,
      tagline_zh = p_tagline_zh,
      photo_url = p_photo_url,
      zalo_url = p_zalo_url,
      facebook_url = p_facebook_url,
      updated_at = now()
  WHERE auth_user_id = auth.uid() AND is_active;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

-- ============ 4. 管理员审批 RPC ============
CREATE OR REPLACE FUNCTION public.ntc_is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.teachers
    WHERE auth_user_id = auth.uid() AND is_active AND is_admin
  );
$$;

CREATE OR REPLACE FUNCTION public.ntc_list_pending_teachers()
RETURNS TABLE (
  id uuid, email text, display_name text, slug text,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT t.id, t.email, t.display_name, t.slug, t.created_at
  FROM public.teachers t
  WHERE NOT t.is_active AND public.ntc_is_admin()
  ORDER BY t.created_at;
$$;

CREATE OR REPLACE FUNCTION public.ntc_set_teacher_active(
  p_teacher_id uuid, p_active boolean
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_rows int;
BEGIN
  IF NOT public.ntc_is_admin() THEN RETURN false; END IF;
  -- 不能改自己的状态，防止管理员把自己锁在外面。
  IF p_teacher_id = (
    SELECT id FROM public.teachers WHERE auth_user_id = auth.uid()
  ) THEN RETURN false; END IF;
  UPDATE public.teachers
  SET is_active = p_active, updated_at = now()
  WHERE id = p_teacher_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN
    UPDATE public.profiles
    SET approval_status = CASE WHEN p_active THEN 'approved' ELSE 'pending' END
    WHERE user_id = (
      SELECT auth_user_id FROM public.teachers WHERE id = p_teacher_id
    );
  END IF;
  RETURN v_rows > 0;
END;
$$;

-- ============ 5. 品牌图存储桶 + 策略 ============
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'teacher-branding',
  'teacher-branding',
  true,
  5242880, -- 5 MB，品牌图够用；不要用音频桶的 600MB 思路
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- 公开读品牌图。
CREATE POLICY "teacher branding public read"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'teacher-branding');

-- 老师只写自己 UID 开头的目录（上传路径形如 <auth_user_id>/logo.png）。
CREATE POLICY "teacher branding owner insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'teacher-branding'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "teacher branding owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'teacher-branding'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'teacher-branding'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "teacher branding owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'teacher-branding'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- End of 10_teacher_branding_and_onboarding.sql
