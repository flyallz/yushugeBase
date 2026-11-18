-- 07_multiteacher_model.sql
-- 玉书阁多教师升级 · 数据模型（只做加法，不动现有表、函数、策略）
-- 目标库：开发项目 NGOCTHUCAC-LMS-v2-dev；写完后在开发库执行验证，通过后再随
-- 回迁 SQL 一起 replay 到线上 NGOCTHUCAC-LMS。
--
-- 设计决定（2026-11-18，按架构评审意见）：
--  1. 只新建 3 张表，不给现有 29 张表加 teacher_id / class_id 列。
--     现有 50 个 RPC 函数和 40 条策略全用 class_code 字符串做隔离，
--     租户归属改为“class_code → classes.code”关联推导，不用改一行旧代码。
--     以后哪张表确实需要直连 teacher_id，再单开迁移加列。
--  2. teachers 表是“谁是老师”的唯一事实来源。08 会把 is_teacher() /
--     ntc_teacher() / homework_is_teacher() 三个判断改成查这张表，
--     删掉硬编码邮箱；所有 RPC 和策略自动继承新判断。
--  3. 回填只用库里已有的数据推导，不编新班级、不编新老师：
--     老师 = 现有老师账号（线上 UUID，与开发库 dev-teacher 账号同一 UUID）；
--     班级 = 现有数据里出现过的全部 class_code（开发库 5 个：YSG001–YSG005）；
--     成员 = profiles 里有 class_code 的学生 + 老师本人。
--  4. slug 'co-ngoc' 是明玉的默认专属链接标识（/t/co-ngoc），她以后可改。
-- 执行顺序：在 05b（函数）、05c（触发器）之后；在 08（统一 teacher 判断）、
-- 09（补 RLS）之前。Rerunnable：全部 INSERT 都有 ON CONFLICT DO NOTHING，
-- CREATE TABLE 若重跑会报错——重跑前请先 DROP 三张表（开发库才可如此操作）。
-- 验证（执行后在 SQL Editor 跑）：
--   SELECT count(*) FROM public.teachers;            -- 预期 1
--   SELECT code FROM public.classes ORDER BY code;   -- 预期 YSG001..YSG005
--   SELECT count(*) FROM public.class_members;       -- 预期 = 学生数 + 5（老师本人进 5 个班）

-- ============ 1. teachers：谁是老师 ============
CREATE TABLE public.teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  slug text UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX teachers_email_unique ON public.teachers (lower(email));

-- ============ 2. classes：班级，归属一个老师 ============
CREATE TABLE public.classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE RESTRICT,
  code text NOT NULL UNIQUE,
  name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ 3. class_members：谁在哪个班 ============
CREATE TABLE public.class_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'assistant')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, user_id)
);
CREATE INDEX class_members_user_idx ON public.class_members (user_id);
CREATE INDEX class_members_class_idx ON public.class_members (class_id);

-- RLS：显式开启（05c 的 ensure_rls 事件触发器建表时也会自动开，双保险）。
-- 策略不在此文件，见 09。
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_members ENABLE ROW LEVEL SECURITY;

-- updated_at 自动维护（复用 05b 里已有的 homework_set_updated_at）。
DROP TRIGGER IF EXISTS teachers_updated_at ON public.teachers;
CREATE TRIGGER teachers_updated_at
  BEFORE UPDATE ON public.teachers
  FOR EACH ROW EXECUTE FUNCTION public.homework_set_updated_at();
DROP TRIGGER IF EXISTS classes_updated_at ON public.classes;
CREATE TRIGGER classes_updated_at
  BEFORE UPDATE ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.homework_set_updated_at();

-- ============ 4. 回填老师：现有老师账号 ============
-- UUID 与线上老师账号一致，开发库的 dev-teacher 账号就是同一 UUID，
-- 所以同一条语句在开发库和线上库都能跑。
INSERT INTO public.teachers (auth_user_id, email, display_name, slug)
SELECT 'f28a600d-0ebe-43e2-b832-b1e3f314d0fa'::uuid,
       'tailieutiengtrung142@gmail.com',
       COALESCE((SELECT full_name FROM public.profiles WHERE user_id = 'f28a600d-0ebe-43e2-b832-b1e3f314d0fa'::uuid), ''),
       'co-ngoc'
WHERE EXISTS (SELECT 1 FROM auth.users WHERE id = 'f28a600d-0ebe-43e2-b832-b1e3f314d0fa'::uuid)
ON CONFLICT (auth_user_id) DO NOTHING;

-- ============ 5. 回填班级：现有数据里出现过的全部 class_code ============
INSERT INTO public.classes (teacher_id, code, name)
SELECT t.id, c.code, c.code
FROM public.teachers t,
     (SELECT DISTINCT class_code AS code FROM public.homework_windows WHERE class_code <> ''
      UNION
      SELECT DISTINCT class_code FROM public.ntc_game_assignments WHERE class_code <> ''
      UNION
      SELECT DISTINCT class_code FROM public.ntc_topic_review_assignments WHERE class_code <> ''
      UNION
      SELECT DISTINCT class_code FROM public.daily_activity_writings WHERE class_code <> ''
      UNION
      SELECT DISTINCT class_code FROM public.profiles WHERE class_code <> '') c
WHERE t.auth_user_id = 'f28a600d-0ebe-43e2-b832-b1e3f314d0fa'::uuid
ON CONFLICT (code) DO NOTHING;

-- ============ 6. 回填成员：有 class_code 的学生进班 ============
INSERT INTO public.class_members (class_id, user_id, role)
SELECT cl.id, p.user_id, 'student'
FROM public.profiles p
JOIN public.classes cl ON cl.code = p.class_code
WHERE p.class_code <> '' AND p.account_type = 'student'
ON CONFLICT (class_id, user_id) DO NOTHING;

-- ============ 7. 回填成员：老师本人进自己的班 ============
INSERT INTO public.class_members (class_id, user_id, role)
SELECT cl.id, t.auth_user_id, 'teacher'
FROM public.classes cl
JOIN public.teachers t ON t.id = cl.teacher_id
ON CONFLICT (class_id, user_id) DO NOTHING;
