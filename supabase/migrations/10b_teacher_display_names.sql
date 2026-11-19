-- 10b_teacher_display_names.sql
-- 补 10：老师中文显示名 + 改品牌接口补显示名 + 回填明玉显示名。
-- 原因：10 执行后核查发现 co-ngoc 的 display_name 为空（07 回填既有数据），
-- 首页品牌换肤要用到越/中两个显示名（照片签、联系按钮、导航、标题）。
-- 内容：
--   1. teachers 表加 display_name_zh text NOT NULL DEFAULT ''。
--   2. ntc_update_my_branding 加 p_display_name / p_display_name_zh 两个参数
--      （旧签名的调用会报错——改品牌表单尚未上线，无旧调用）。
--   3. ntc_get_teacher_branding 返回 display_name_zh。
--   4. 回填 co-ngoc：display_name='Cô Ngọc'、display_name_zh='明玉老师'。
-- 验证（执行后在 SQL Editor 跑）：
--   SELECT slug, display_name, display_name_zh FROM public.teachers ORDER BY slug;
--     -- 预期 co-ngoc：Cô Ngọc / 明玉老师；teacher-a/b 为空
--   SELECT * FROM public.ntc_get_teacher_branding('co-ngoc');
--     -- 预期 1 行，含 display_name_zh='明玉老师'

ALTER TABLE public.teachers
  ADD COLUMN IF NOT EXISTS display_name_zh text NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION public.ntc_update_my_branding(
  p_display_name text, p_display_name_zh text,
  p_brand_name text, p_tagline_vi text, p_tagline_zh text,
  p_photo_url text, p_zalo_url text, p_facebook_url text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_rows int;
BEGIN
  UPDATE public.teachers
  SET display_name = p_display_name,
      display_name_zh = p_display_name_zh,
      brand_name = p_brand_name,
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

-- 注意：Postgres 不允许 CREATE OR REPLACE 改函数的返回类型（42P13）。
-- 10b 给 ntc_get_teacher_branding 加了 display_name_zh 列，所以必须先
-- DROP 再建。DROP 的只是我方 10 里新建的函数，不动其他函数。
DROP FUNCTION IF EXISTS public.ntc_get_teacher_branding(text);

CREATE OR REPLACE FUNCTION public.ntc_get_teacher_branding(p_slug text)
RETURNS TABLE (
  slug text, display_name text, display_name_zh text, brand_name text,
  tagline_vi text, tagline_zh text,
  photo_url text, zalo_url text, facebook_url text
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT t.slug, t.display_name, t.display_name_zh,
    COALESCE(NULLIF(t.brand_name, ''), t.display_name),
    t.tagline_vi, t.tagline_zh,
    t.photo_url, t.zalo_url, t.facebook_url
  FROM public.teachers t
  WHERE t.is_active AND lower(t.slug) = lower(trim(p_slug));
$$;

UPDATE public.teachers
SET display_name = 'Cô Ngọc', display_name_zh = '明玉老师'
WHERE slug = 'co-ngoc';

-- End of 10b_teacher_display_names.sql
