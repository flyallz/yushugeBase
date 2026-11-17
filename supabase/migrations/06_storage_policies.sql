-- ============================================================================
-- YuShuGe2 dev project — 06_storage_policies.sql
-- Source: live project NGOCTHUCAC-LMS, exported 2026-11-17 as CSV
--   (browser downloads sess-203396841, f14 = pg_policies where
--   schemaname='storage', 6 rows). All 6 policies are on storage.objects,
--   all PERMISSIVE, roles {authenticated}. Definitions below are verbatim
--   from that CSV — table, command, qual, with_check copied as-is.
--   NOTE: the browser report summarised homework_teacher_feedback_read's
--   qual as identical to the delete policy; the CSV shows it is NOT —
--   read also allows ((storage.foldername(name))[2] = auth.uid()).
--   The CSV is authoritative here.
-- Target: dev project NGOCTHUCAC-LMS-v2-dev (ggknfrlclouuvsmxyfrt).
--   Run AFTER 02 (buckets exist) and 05 (functions exist: this file
--   depends on homework_is_teacher(), can_submit_homework() and
--   is_teacher() — all in 05).
--   sach-bt-audio has NO Storage policy in live — none is created here.
-- Re-runnable: each CREATE POLICY is preceded by DROP POLICY IF EXISTS
--   with the same name/table, so re-running replaces, not duplicates.
-- WARNING — hardcoded single-teacher email, migrated verbatim via
--   homework_is_teacher(): the multi-teacher upgrade MUST replace it.
--   is_teacher() (used by the 4 teacher-feedback policies) is role-only
--   and SECURITY DEFINER — keep it as-is for the replica.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. homework_storage_read — SELECT on storage.objects
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "homework_storage_read" ON storage.objects;
CREATE POLICY "homework_storage_read" ON storage.objects
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((bucket_id = 'student-homework'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR homework_is_teacher()));

-- ----------------------------------------------------------------------------
-- 2. homework_storage_student_upload — INSERT on storage.objects
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "homework_storage_student_upload" ON storage.objects;
CREATE POLICY "homework_storage_student_upload" ON storage.objects
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'student-homework'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text) AND can_submit_homework(((storage.foldername(name))[2])::uuid, auth.uid()));

-- ----------------------------------------------------------------------------
-- 3. homework_teacher_feedback_delete — DELETE on storage.objects
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "homework_teacher_feedback_delete" ON storage.objects;
CREATE POLICY "homework_teacher_feedback_delete" ON storage.objects
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((bucket_id = 'student-homework'::text) AND ((storage.foldername(name))[1] = 'teacher-feedback'::text) AND is_teacher());

-- ----------------------------------------------------------------------------
-- 4. homework_teacher_feedback_read — SELECT on storage.objects
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "homework_teacher_feedback_read" ON storage.objects;
CREATE POLICY "homework_teacher_feedback_read" ON storage.objects
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((bucket_id = 'student-homework'::text) AND ((storage.foldername(name))[1] = 'teacher-feedback'::text) AND (is_teacher() OR ((storage.foldername(name))[2] = (auth.uid())::text)));

-- ----------------------------------------------------------------------------
-- 5. homework_teacher_feedback_update — UPDATE on storage.objects
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "homework_teacher_feedback_update" ON storage.objects;
CREATE POLICY "homework_teacher_feedback_update" ON storage.objects
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((bucket_id = 'student-homework'::text) AND ((storage.foldername(name))[1] = 'teacher-feedback'::text) AND is_teacher())
  WITH CHECK ((bucket_id = 'student-homework'::text) AND ((storage.foldername(name))[1] = 'teacher-feedback'::text) AND is_teacher());

-- ----------------------------------------------------------------------------
-- 6. homework_teacher_feedback_upload — INSERT on storage.objects
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "homework_teacher_feedback_upload" ON storage.objects;
CREATE POLICY "homework_teacher_feedback_upload" ON storage.objects
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'student-homework'::text) AND ((storage.foldername(name))[1] = 'teacher-feedback'::text) AND is_teacher());

-- End of 06_storage_policies.sql — 6 policies on storage.objects.
