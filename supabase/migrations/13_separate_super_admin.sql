-- Migration 13: separate the super admin from the teacher co-ngoc
-- Dev only. Run AFTER the admin auth user exists (created 2026-11-19 20:27
-- via dashboard Add user: admin@example.com, UUID below, email confirmed).
-- What it does:
--  1. Gives the new admin auth user app_metadata role='teacher' so every
--     login path that checks the role claim lets it into the teacher
--     dashboard (the teachers-table gate is the real check; this is belt
--     and braces, and matches how register-teacher creates teachers).
--  2. Deletes the auto-created student profiles row for the admin UUID
--     (handle_new_user_profile ran at user creation with no role claim,
--     so it made a student/pending row; the admin must not appear in the
--     student lists) plus any class_members row for it.
--  3. Inserts the admin's teachers row: slug 'admin', is_active + is_admin.
--  4. Removes is_admin from co-ngoc (Mingyu's teacher account) so that
--     account is a plain teacher from now on.
-- Idempotent: safe to re-run (ON CONFLICT DO NOTHING / targeted UPDATEs).
-- Live note: on live the admin email/UUID will differ; replay with the
-- live admin's real values, and only after deciding who holds the live
-- super admin account (user vs Mingyu) -- TBD at migration time.

-- 1. role claim on the admin auth user
UPDATE auth.users
SET raw_app_meta_data = jsonb_set(
  COALESCE(raw_app_meta_data, '{}'::jsonb),
  '{role}',
  '"teacher"'
)
WHERE id = '381a246a-0cc6-4e37-982c-7200de0f63f8';

-- 2. remove the auto-created student profile (+ membership) for the admin
DELETE FROM public.class_members
WHERE user_id = '381a246a-0cc6-4e37-982c-7200de0f63f8';
DELETE FROM public.profiles
WHERE user_id = '381a246a-0cc6-4e37-982c-7200de0f63f8';

-- 3. admin's teachers row (pure super admin: no classes, no students)
INSERT INTO public.teachers
  (auth_user_id, email, display_name, display_name_zh, slug, is_active, is_admin)
VALUES
  ('381a246a-0cc6-4e37-982c-7200de0f63f8',
   'admin@example.com', 'Quản trị viên', '超管', 'admin', true, true)
ON CONFLICT (auth_user_id) DO NOTHING;

-- 4. co-ngoc stops being an admin (stays a plain teacher)
UPDATE public.teachers
SET is_admin = false
WHERE slug = 'co-ngoc';
