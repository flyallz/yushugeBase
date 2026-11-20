-- 14_teacher_profile_and_course_listing.sql
-- 玉书阁多教师升级 · 老师个人档案 + 主页上架（只做加法，不动现有表、函数、策略）
-- 前置：10/10b（ntc_get_teacher_branding / ntc_get_teacher_classes 的当前版）、13。
-- 内容：
--   1. teachers 表加 profile jsonb（个人档案：全名/头衔/学校、自我介绍、学历时间线、标签、奖学金），
--      回填 co-ngoc（照 index.html #giaovien 区原文，一个字不编）。
--   2. classes 表加 5 列上架字段（display_name/level/description/schedule/is_listed），
--      现有班级默认全部上架（is_listed 默认 true），主页行为不变。
--   3. ntc_get_teacher_branding 改版：返回加 profile 列（先 DROP 再 CREATE，
--      见 10b 的教训：CREATE OR REPLACE 不能改返回类型，42P13）。
--   4. ntc_get_teacher_classes 改版：返回加 id + 5 个上架字段（先 DROP 再 CREATE）。
--      id 也一并返回——前端按班保存时调 ntc_update_my_class_listing 需要 class id。
--   5. ntc_update_my_profile：本人改自己 teachers 行的 profile。
--   6. ntc_update_my_class_listing：本人改自己名下班级的上架信息。
-- 执行：按分段顺序粘贴执行（SQL Editor 单块上限，每段 ≤7KB；各段字节数见段首注释）。
--   分段 1：§1 teachers.profile + co-ngoc 回填
--   分段 2：§2 classes 上架列
--   分段 3：§3 branding RPC 改版
--   分段 4：§4 classes RPC 改版
--   分段 5：§5 + §6 两个写 RPC
-- 验证（执行后在 SQL Editor 跑）：
--   SELECT slug, profile->>'intro_zh' FROM public.teachers WHERE slug = 'co-ngoc';
--     -- 预期 1 行，intro_zh 为明玉中文自我介绍
--   SELECT code, is_listed FROM public.classes ORDER BY code;
--     -- 预期 9 行，is_listed 全部 true
--   SELECT * FROM public.ntc_get_teacher_branding('co-ngoc');
--     -- 预期 1 行，含 profile（jsonb，非空）
--   SELECT code, name, is_listed FROM public.ntc_get_teacher_classes('co-ngoc') ORDER BY code;
--     -- 预期 9 行，is_listed 全部 true
--   SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE n.nspname = 'public' AND p.proname LIKE 'ntc_%';
--     -- 预期 82（迁移 12 后的 80 + 2 个新写 RPC；改版的两个 RPC 只换定义不增数）

-- ============ 分段 1（2,113 字节）：§1 teachers.profile + co-ngoc 回填 ============
ALTER TABLE public.teachers
  ADD COLUMN IF NOT EXISTS profile jsonb NOT NULL DEFAULT '{}';

-- 回填 co-ngoc：照 index.html 第 23 行 #giaovien 区的越/中文原文。
-- 学历两条、自我介绍、标签、奖学金三条，一个字不编；period 与 text 分开存，
-- 奖学金 text 里不带年份（渲染时拼成 "period · text"，与原站显示一致）。
UPDATE public.teachers
SET profile = '{
  "intro_vi": "Giáo viên tiếng Trung, phiên dịch viên Trung–Việt. Mình mong mỗi giờ học đều giúp bạn hiểu rõ hơn, thực hành nhiều hơn và từng bước tự tin dùng tiếng Trung trong cuộc sống.",
  "intro_zh": "中文教师、中越口译员。我希望每一堂课都能帮助你理解得更清楚、练习得更充分，并逐步自信地在生活中使用中文。",
  "full_name_vi": "Lương Huỳnh Minh Ngọc",
  "full_name_zh": "梁黄明玉",
  "headline_vi": "Nghiên cứu sinh tiến sĩ – Nguyên lí Giáo dục học",
  "headline_zh": "教育学原理专业博士研究生",
  "school_vi": "Đại học Tây Nam · Trùng Khánh, Trung Quốc",
  "school_zh": "西南大学 · 中国重庆",
  "education": [
    {"period": "2026 — 2030", "title_vi": "Nghiên cứu sinh tiến sĩ · Nguyên lí Giáo dục học", "title_zh": "博士阶段 · 教育学原理", "desc_vi": "Đang theo học tại Đại học Tây Nam. Dự kiến hoàn thành năm 2030.", "desc_zh": "在西南大学攻读博士学位，预计2030年完成学业。"},
    {"period": "2024 — 2026", "title_vi": "Thạc sĩ · Giáo dục Hán ngữ Quốc tế", "title_zh": "硕士 · 汉语国际教育", "desc_vi": "Đại học Tây Nam · Trùng Khánh, Trung Quốc", "desc_zh": "西南大学 · 中国重庆"}
  ],
  "tags": [{"vi": "HSK6", "zh": "HSK6"}, {"vi": "Giảng dạy & phiên dịch Trung–Việt", "zh": "中文教学与中越口译"}],
  "scholarships": [
    {"period": "2026", "text_vi": "Học bổng Chính phủ Trung Quốc bậc tiến sĩ", "text_zh": "中国政府奖学金（博士）"},
    {"period": "2024–2026", "text_vi": "Học bổng Khổng Tử bậc thạc sĩ", "text_zh": "孔子学院奖学金（硕士）"},
    {"period": "2023", "text_vi": "Học bổng Khổng Tử, một năm tiếng Trung tại Bắc Kinh", "text_zh": "孔子学院奖学金（北京一年汉语研修）"}
  ]
}'::jsonb
WHERE slug = 'co-ngoc';

-- ============ 分段 2（441 字节）：§2 classes 表加 5 列上架字段 ============
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS level text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS schedule text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_listed boolean NOT NULL DEFAULT true;

-- ============ 分段 3（875 字节）：§3 ntc_get_teacher_branding 改版（返回加 profile） ============
-- 注意：返回类型变了，必须先 DROP 再 CREATE（CREATE OR REPLACE 会报 42P13）。
DROP FUNCTION IF EXISTS public.ntc_get_teacher_branding(text);

CREATE OR REPLACE FUNCTION public.ntc_get_teacher_branding(p_slug text)
RETURNS TABLE (
  slug text, display_name text, display_name_zh text, brand_name text,
  tagline_vi text, tagline_zh text,
  photo_url text, zalo_url text, facebook_url text,
  profile jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT t.slug, t.display_name, t.display_name_zh,
    COALESCE(NULLIF(t.brand_name, ''), t.display_name),
    t.tagline_vi, t.tagline_zh,
    t.photo_url, t.zalo_url, t.facebook_url,
    t.profile
  FROM public.teachers t
  WHERE t.is_active AND lower(t.slug) = lower(trim(p_slug));
$$;

-- ============ 分段 4（777 字节）：§4 ntc_get_teacher_classes 改版（返回加 id + 5 个上架字段） ============
-- 注意：返回类型变了，必须先 DROP 再 CREATE（同 §3）。
DROP FUNCTION IF EXISTS public.ntc_get_teacher_classes(text);

CREATE OR REPLACE FUNCTION public.ntc_get_teacher_classes(p_slug text)
RETURNS TABLE (
  id uuid, code text, name text,
  display_name text, level text, description text, schedule text,
  is_listed boolean
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT c.id, c.code, c.name,
    c.display_name, c.level, c.description, c.schedule,
    c.is_listed
  FROM public.classes c
  JOIN public.teachers t ON t.id = c.teacher_id
  WHERE t.is_active AND lower(t.slug) = lower(trim(p_slug))
  ORDER BY c.code;
$$;

-- ============ 分段 5（1,537 字节）：§5 + §6 两个写 RPC ============
CREATE OR REPLACE FUNCTION public.ntc_update_my_profile(p_profile jsonb)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_rows int;
BEGIN
  -- 只接受 JSON 对象；数组、标量、NULL 都拒绝（返回 false，不写库）。
  IF p_profile IS NULL OR jsonb_typeof(p_profile) <> 'object' THEN RETURN false; END IF;
  UPDATE public.teachers
  SET profile = p_profile, updated_at = now()
  WHERE auth_user_id = auth.uid() AND is_active;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.ntc_update_my_class_listing(
  p_class_id uuid, p_display_name text, p_level text,
  p_description text, p_schedule text, p_is_listed boolean
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_rows int;
BEGIN
  -- 只改自己名下的班：classes.teacher_id 必须对上调用者的 teachers 行；
  -- 不是自己的班、或调用者不是激活老师，0 行受影响，返回 false。
  UPDATE public.classes c
  SET display_name = COALESCE(p_display_name, ''),
      level = COALESCE(p_level, ''),
      description = COALESCE(p_description, ''),
      schedule = COALESCE(p_schedule, ''),
      is_listed = COALESCE(p_is_listed, true),
      updated_at = now()
  FROM public.teachers t
  WHERE c.id = p_class_id
    AND c.teacher_id = t.id
    AND t.auth_user_id = auth.uid()
    AND t.is_active;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

-- End of 14_teacher_profile_and_course_listing.sql
