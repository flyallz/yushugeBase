-- ============================================================================
-- YuShuGe2 dev project — 05_functions_and_rls.sql
-- Source: live project NGOCTHUCAC-LMS, exported 2026-11-17 as CSV
--   (browser downloads sess-203396841, f11 = pg_policies, 40 rows;
--   f12 = pg_get_functiondef for homework_is_teacher()). Every policy
--   and the function below are verbatim from those exports — table,
--   command, qual, with_check, roles (authenticated) and PERMISSIVE
--   are copied as-is, including the duplicate policies in
--   daily_activity_writings (2x SELECT, 2x UPDATE with identical
--   conditions under different names) and profiles (same pattern).
--   Duplicates are preserved, not cleaned up — cleanup is a later
--   multi-teacher decision, not part of this copy.
-- Target: dev project NGOCTHUCAC-LMS-v2-dev (ggknfrlclouuvsmxyfrt).
--   Run AFTER 01 (tables) and 03 (RLS enabled on all 29 tables),
--   and after 04 (data) — order vs 04 does not matter for policies.
-- Re-runnable: each CREATE POLICY is preceded by DROP POLICY IF EXISTS
--   with the same name/table, so re-running replaces, not duplicates.
-- WARNING — hardcoded single-teacher email, migrated verbatim:
--   homework_is_teacher() and several policies check
--   lower(email) = 'tailieutiengtrung142@gmail.com'. That is live's
--   single-teacher rule. The multi-teacher upgrade MUST replace it
--   (e.g. by a teachers table / role check). Do not ship it as-is.
-- can_submit_homework() — ADDED 2026-11-17 from live pg_get_functiondef:
--   public.can_submit_homework(p_window_id uuid, p_user_id uuid)
--   RETURNS boolean, LANGUAGE sql, STABLE SECURITY DEFINER.
--   It returns true only when p_user_id = auth.uid(), that user has an
--   approved 'student' profile whose class_code matches the homework
--   window (case/space-insensitive), and the window is currently open —
--   either via an allowed per-student override or, with no override,
--   via the window itself being enabled, not archived, and in time.
--   Verbatim from live; see function below.
-- is_teacher() + ntc_teacher() — ADDED 2026-11-17 from live pg_get_functiondef
--   (CSV f17, 2 rows): is_teacher() is STABLE SECURITY DEFINER, SET
--   search_path TO 'public', only checks app_metadata.role='teacher'
--   (no email check) — the 4 teacher-feedback Storage policies depend
--   on it, so SECURITY DEFINER must be kept. ntc_teacher() is STABLE,
--   SET search_path TO 'public', 'pg_temp', also role-only plus
--   auth.uid() IS NOT NULL. Neither may be substituted for
--   homework_is_teacher(), which additionally allows the hardcoded
--   teacher email. All three are now in this file (4 functions total).
--   Storage policies are in 06_storage_policies.sql (exported 2026-11-17,
--   6 rows, CSV f14), not in this file.
-- Policy counts per table (from f11): app_settings 3,
--   daily_activity_writings 4, game_best_records 3,
--   homework_student_overrides 4, homework_submissions 3,
--   homework_windows 4, hsk3_attempt_reviews 2, hsk4_attempt_reviews 2,
--   learning_activity_totals 1, learning_attempt_reviews 2,
--   learning_lifetime_stats 1, ntc_hsk5_review_catalog 1,
--   ntc_hsk5_review_progress 1, ntc_hsk6_review_catalog 1,
--   ntc_hsk6_review_progress 1, ntc_topic_review_assignments 1,
--   ntc_topic_review_students 1, ntc_vocabulary_progress 1, profiles 4
--   — TOTAL 40 policies on 19 tables; the other 10 tables have none.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Function: public.homework_is_teacher() — verbatim from f12
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.homework_is_teacher()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select
    coalesce(
      auth.jwt() -> 'app_metadata' ->> 'role',
      ''
    ) = 'teacher'
    or lower(coalesce(auth.jwt() ->> 'email', ''))
       = 'tailieutiengtrung142@gmail.com';
$function$;

-- ----------------------------------------------------------------------------
-- Function: public.can_submit_homework(p_window_id uuid, p_user_id uuid)
-- — verbatim from live pg_get_functiondef, 2026-11-17
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_submit_homework(p_window_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
 AS $function$
  select coalesce(
    (
      select
        p_user_id = auth.uid()
        and exists (
          select 1
          from public.homework_windows w
          join public.profiles p
            on p.user_id = p_user_id
            and upper(trim(p.class_code))
              = upper(trim(w.class_code))
          left join public.homework_student_overrides o
            on o.window_id = w.id
            and o.user_id = p_user_id
          where w.id = p_window_id
            and p.approval_status = 'approved'
            and p.account_type = 'student'
            and (
              (
                o.id is not null
                and o.is_allowed
                and (
                  o.allow_closed_window
                  or (
                    w.is_enabled
                    and w.archived_at is null
                  )
                )
                and now() >= coalesce(o.opens_at, w.opens_at)
                and now() <= coalesce(o.closes_at, w.closes_at)
              )
              or
              (
                o.id is null
                and w.is_enabled
                and w.archived_at is null
                and now() >= w.opens_at
                and now() <= w.closes_at
              )
            )
        )
    ),
    false
  );
 $function$;

-- ----------------------------------------------------------------------------
-- Function: public.is_teacher() — verbatim from live pg_get_functiondef, 2026-11-17
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_teacher()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'teacher';
$function$;

-- ----------------------------------------------------------------------------
-- Function: public.ntc_teacher() — verbatim from live pg_get_functiondef, 2026-11-17
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ntc_teacher()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
 select auth.uid() is not null
  and coalesce(auth.jwt()->'app_metadata'->>'role','')='teacher'
$function$;

-- ----------------------------------------------------------------------------
-- RLS policies (40; #16 is at the end — see header)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "authenticated can read app settings" ON public.app_settings;
CREATE POLICY "authenticated can read app settings" ON public.app_settings
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "teacher can insert app settings" ON public.app_settings;
CREATE POLICY "teacher can insert app settings" ON public.app_settings
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((COALESCE(((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text), ''::text) = 'teacher'::text));

DROP POLICY IF EXISTS "teacher can update app settings" ON public.app_settings;
CREATE POLICY "teacher can update app settings" ON public.app_settings
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((COALESCE(((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text), ''::text) = 'teacher'::text))
  WITH CHECK ((COALESCE(((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text), ''::text) = 'teacher'::text));

DROP POLICY IF EXISTS "teacher_can_read_all_writings" ON public.daily_activity_writings;
CREATE POLICY "teacher_can_read_all_writings" ON public.daily_activity_writings
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR (lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) = 'tailieutiengtrung142@gmail.com'::text) OR (COALESCE(((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text), ''::text) = 'teacher'::text)));

DROP POLICY IF EXISTS "teacher_can_update_writings" ON public.daily_activity_writings;
CREATE POLICY "teacher_can_update_writings" ON public.daily_activity_writings
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) = 'tailieutiengtrung142@gmail.com'::text) OR (COALESCE(((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text), ''::text) = 'teacher'::text)))
  WITH CHECK (((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) = 'tailieutiengtrung142@gmail.com'::text) OR (COALESCE(((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text), ''::text) = 'teacher'::text)));

DROP POLICY IF EXISTS "teacher_read_all_daily_writings" ON public.daily_activity_writings;
CREATE POLICY "teacher_read_all_daily_writings" ON public.daily_activity_writings
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR (lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) = 'tailieutiengtrung142@gmail.com'::text) OR (COALESCE(((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text), ''::text) = 'teacher'::text)));

DROP POLICY IF EXISTS "teacher_update_daily_writings" ON public.daily_activity_writings;
CREATE POLICY "teacher_update_daily_writings" ON public.daily_activity_writings
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) = 'tailieutiengtrung142@gmail.com'::text) OR (COALESCE(((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text), ''::text) = 'teacher'::text)))
  WITH CHECK (((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) = 'tailieutiengtrung142@gmail.com'::text) OR (COALESCE(((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text), ''::text) = 'teacher'::text)));

DROP POLICY IF EXISTS "read game leaderboard" ON public.game_best_records;
CREATE POLICY "read game leaderboard" ON public.game_best_records
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "student insert own game record" ON public.game_best_records;
CREATE POLICY "student insert own game record" ON public.game_best_records
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid()));

DROP POLICY IF EXISTS "student update own game record" ON public.game_best_records;
CREATE POLICY "student update own game record" ON public.game_best_records
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK ((user_id = auth.uid()));

DROP POLICY IF EXISTS "homework_overrides_read" ON public.homework_student_overrides;
CREATE POLICY "homework_overrides_read" ON public.homework_student_overrides
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR homework_is_teacher()));

DROP POLICY IF EXISTS "homework_overrides_teacher_delete" ON public.homework_student_overrides;
CREATE POLICY "homework_overrides_teacher_delete" ON public.homework_student_overrides
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (homework_is_teacher());

DROP POLICY IF EXISTS "homework_overrides_teacher_insert" ON public.homework_student_overrides;
CREATE POLICY "homework_overrides_teacher_insert" ON public.homework_student_overrides
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (homework_is_teacher());

DROP POLICY IF EXISTS "homework_overrides_teacher_update" ON public.homework_student_overrides;
CREATE POLICY "homework_overrides_teacher_update" ON public.homework_student_overrides
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (homework_is_teacher())
  WITH CHECK (homework_is_teacher());

DROP POLICY IF EXISTS "homework_submissions_read" ON public.homework_submissions;
CREATE POLICY "homework_submissions_read" ON public.homework_submissions
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR homework_is_teacher()));

DROP POLICY IF EXISTS "homework_submissions_teacher_update" ON public.homework_submissions;
CREATE POLICY "homework_submissions_teacher_update" ON public.homework_submissions
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (homework_is_teacher())
  WITH CHECK (homework_is_teacher());

DROP POLICY IF EXISTS "homework_windows_student_read" ON public.homework_windows;
CREATE POLICY "homework_windows_student_read" ON public.homework_windows
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((homework_is_teacher() OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = auth.uid()) AND (p.approval_status = 'approved'::text) AND (upper(TRIM(BOTH FROM p.class_code)) = upper(TRIM(BOTH FROM homework_windows.class_code))))))));

DROP POLICY IF EXISTS "homework_windows_teacher_delete" ON public.homework_windows;
CREATE POLICY "homework_windows_teacher_delete" ON public.homework_windows
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (homework_is_teacher());

DROP POLICY IF EXISTS "homework_windows_teacher_insert" ON public.homework_windows;
CREATE POLICY "homework_windows_teacher_insert" ON public.homework_windows
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (homework_is_teacher());

DROP POLICY IF EXISTS "homework_windows_teacher_update" ON public.homework_windows;
CREATE POLICY "homework_windows_teacher_update" ON public.homework_windows
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (homework_is_teacher())
  WITH CHECK (homework_is_teacher());

DROP POLICY IF EXISTS "students_insert_own_hsk3_reviews" ON public.hsk3_attempt_reviews;
CREATE POLICY "students_insert_own_hsk3_reviews" ON public.hsk3_attempt_reviews
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid()));

DROP POLICY IF EXISTS "teacher_read_hsk3_reviews" ON public.hsk3_attempt_reviews;
CREATE POLICY "teacher_read_hsk3_reviews" ON public.hsk3_attempt_reviews
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR (lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) = 'tailieutiengtrung142@gmail.com'::text)));

DROP POLICY IF EXISTS "ngoc_hsk4_review_insert" ON public.hsk4_attempt_reviews;
CREATE POLICY "ngoc_hsk4_review_insert" ON public.hsk4_attempt_reviews
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid()));

DROP POLICY IF EXISTS "ngoc_hsk4_review_select" ON public.hsk4_attempt_reviews;
CREATE POLICY "ngoc_hsk4_review_select" ON public.hsk4_attempt_reviews
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR (lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) = 'tailieutiengtrung142@gmail.com'::text)));

DROP POLICY IF EXISTS "student reads own learning time" ON public.learning_activity_totals;
CREATE POLICY "student reads own learning time" ON public.learning_activity_totals
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR (COALESCE(((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text), ''::text) = 'teacher'::text)));

DROP POLICY IF EXISTS "student insert own attempt review" ON public.learning_attempt_reviews;
CREATE POLICY "student insert own attempt review" ON public.learning_attempt_reviews
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid()));

DROP POLICY IF EXISTS "student read own attempt review" ON public.learning_attempt_reviews;
CREATE POLICY "student read own attempt review" ON public.learning_attempt_reviews
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'teacher'::text)));

DROP POLICY IF EXISTS "teacher read lifetime stats" ON public.learning_lifetime_stats;
CREATE POLICY "teacher read lifetime stats" ON public.learning_lifetime_stats
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'teacher'::text) OR (user_id = auth.uid())));

DROP POLICY IF EXISTS "ntc_hsk5_catalog_read" ON public.ntc_hsk5_review_catalog;
CREATE POLICY "ntc_hsk5_catalog_read" ON public.ntc_hsk5_review_catalog
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((auth.uid() IS NOT NULL));

DROP POLICY IF EXISTS "ntc_hsk5_progress_read" ON public.ntc_hsk5_review_progress;
CREATE POLICY "ntc_hsk5_progress_read" ON public.ntc_hsk5_review_progress
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((((auth.uid() IS NOT NULL) AND homework_is_teacher()) OR ((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = auth.uid()) AND (p.account_type = 'student'::text) AND (p.approval_status = 'approved'::text)))))));

DROP POLICY IF EXISTS "ntc_hsk6_catalog_read" ON public.ntc_hsk6_review_catalog;
CREATE POLICY "ntc_hsk6_catalog_read" ON public.ntc_hsk6_review_catalog
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((auth.uid() IS NOT NULL));

DROP POLICY IF EXISTS "ntc_hsk6_progress_read" ON public.ntc_hsk6_review_progress;
CREATE POLICY "ntc_hsk6_progress_read" ON public.ntc_hsk6_review_progress
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((((auth.uid() IS NOT NULL) AND homework_is_teacher()) OR ((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = auth.uid()) AND (p.account_type = 'student'::text) AND (p.approval_status = 'approved'::text)))))));

DROP POLICY IF EXISTS "ntc_topic_review_assignment_read" ON public.ntc_topic_review_assignments;
CREATE POLICY "ntc_topic_review_assignment_read" ON public.ntc_topic_review_assignments
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((homework_is_teacher() OR (EXISTS ( SELECT 1
   FROM ntc_topic_review_students s
  WHERE ((s.assignment_id = ntc_topic_review_assignments.id) AND (s.user_id = auth.uid()))))));

DROP POLICY IF EXISTS "ntc_topic_review_student_read" ON public.ntc_topic_review_students;
CREATE POLICY "ntc_topic_review_student_read" ON public.ntc_topic_review_students
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((homework_is_teacher() OR ((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = auth.uid()) AND (p.approval_status = 'approved'::text) AND (p.account_type = 'student'::text)))))));

DROP POLICY IF EXISTS "ntc_read_own_progress" ON public.ntc_vocabulary_progress;
CREATE POLICY "ntc_read_own_progress" ON public.ntc_vocabulary_progress
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.user_id = auth.uid()) AND (p.account_type = 'student'::text) AND (p.approval_status = 'approved'::text))))));

DROP POLICY IF EXISTS "teacher_can_read_all_profiles" ON public.profiles;
CREATE POLICY "teacher_can_read_all_profiles" ON public.profiles
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR (lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) = 'tailieutiengtrung142@gmail.com'::text) OR (COALESCE(((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text), ''::text) = 'teacher'::text)));

DROP POLICY IF EXISTS "teacher_can_update_profiles" ON public.profiles;
CREATE POLICY "teacher_can_update_profiles" ON public.profiles
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) = 'tailieutiengtrung142@gmail.com'::text) OR (COALESCE(((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text), ''::text) = 'teacher'::text)))
  WITH CHECK (((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) = 'tailieutiengtrung142@gmail.com'::text) OR (COALESCE(((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text), ''::text) = 'teacher'::text)));

DROP POLICY IF EXISTS "teacher_read_all_profiles" ON public.profiles;
CREATE POLICY "teacher_read_all_profiles" ON public.profiles
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR (lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) = 'tailieutiengtrung142@gmail.com'::text) OR (COALESCE(((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text), ''::text) = 'teacher'::text)));

DROP POLICY IF EXISTS "teacher_update_profiles" ON public.profiles;
CREATE POLICY "teacher_update_profiles" ON public.profiles
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) = 'tailieutiengtrung142@gmail.com'::text) OR (COALESCE(((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text), ''::text) = 'teacher'::text)))
  WITH CHECK (((lower(COALESCE((auth.jwt() ->> 'email'::text), ''::text)) = 'tailieutiengtrung142@gmail.com'::text) OR (COALESCE(((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text), ''::text) = 'teacher'::text)));

-- ----------------------------------------------------------------------------
-- Policy #16 — LAST on purpose: requires can_submit_homework(), now
-- added above (2026-11-17). It should now create successfully.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "homework_submissions_student_insert" ON public.homework_submissions;
CREATE POLICY "homework_submissions_student_insert" ON public.homework_submissions
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((user_id = auth.uid()) AND can_submit_homework(window_id, auth.uid())));

-- End of 05_functions_and_rls.sql — 4 functions, 40 policies (39 + #16 last).
