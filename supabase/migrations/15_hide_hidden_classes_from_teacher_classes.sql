-- 迁移 15：ntc_get_teacher_classes 排除已存档（隐藏）的班级
-- 日期：2026-11-20。只改 dev，live 不动。
--
-- 背景：ntc_remove_empty_class 删班时，有历史记录的班（布置过作业 / 指派过游戏 /
-- 转过班）只写入 ntc_hidden_classes（存档），不删 classes 行；只有完全没记录的班
-- 才真删。学生花名册（ntc_roster_v2）本来就按 (NOT hidden OR has student) 过滤，
-- 所以删掉的班在班级管理里消失了；但 ntc_get_teacher_classes 不排除存档班，导致
-- 三处仍显示已删的班：班级管理总览（teacher-home.js 取 classList）、个人主页
-- “主页上的课程”（loadTeacherClassListings）、首页课程卡（renderCourses）。
-- 本迁移只改 ntc_get_teacher_classes 的返回集合：排除当前老师在 ntc_hidden_classes
-- 里的班。返回列不变（id, code, name, display_name, level, description, schedule,
-- is_listed），不需要 DROP + CREATE，直接 CREATE OR REPLACE。
--
-- 注意：ntc_hidden_classes.teacher_id 存的是老师的 Auth UUID（删班时写 auth.uid()），
-- 与 teachers.auth_user_id 对得上；与 classes.teacher_id（teachers.id）不是同一个值。
-- code 在两张表里都是全局唯一，upper(trim()) 两边都做是防大小写/空格差异。
-- 恢复存档班目前没有入口；如需恢复，删 ntc_hidden_classes 对应行即可（后台操作）。
-- 超管用的 ntc_admin_list_classes 不走这个函数，不受影响。
-- 前端不用改：三处都走同一个 RPC，过滤后自动一致。
--
-- 验证（执行后跑）：
--   SELECT code FROM public.ntc_hidden_classes ORDER BY code;
--   SELECT code, is_listed FROM public.ntc_get_teacher_classes('co-ngoc') ORDER BY code;
--   -- 第二条结果不应包含第一条里的班；执行前是 9 行，执行后是 9 - 存档数。

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
    AND NOT EXISTS (
      SELECT 1 FROM public.ntc_hidden_classes h
      WHERE upper(trim(h.code)) = upper(trim(c.code))
        AND h.teacher_id = t.auth_user_id
    )
  ORDER BY c.code;
$$;
