# YuShuGe2 dev project — schema-copy migrations

Source: live project **NGOCTHUCAC-LMS** (org NGOCTHUCAC, Free, ap-south-1 Mumbai),
verified by a read-only browser check on 2026-11-17
(browser-task:98b0980d-5a14-5853-9060-568fd90e34dd).
Field lists, PKs, FKs, defaults and UNIQUEs were read from
`information_schema.columns` / `pg_constraint`; no data rows were queried,
no API keys were opened, nothing was changed in live.

Target: new dev project **NGOCTHUCAC-LMS-v2-dev**
(project ID `ggknfrlclouuvsmxyfrt`, org **YuShuGe2**, Free, ap-south-1 Mumbai).
The dev project is owned by the user; Mingyu agreed it will be developed
there first and migrated back to NGOCTHUCAC-LMS afterwards.

## Files in this folder

| File | What it does |
|---|---|
| `01_schema_copy.sql` | CREATE TABLE for all **29** tables in `public`, then all FK constraints (32 FKs). Schema only. |
| `02_storage_buckets.sql` | Creates the 2 Storage buckets found in live. No policies. |
| `03_rls_enable.sql` | `ENABLE ROW LEVEL SECURITY` on all 29 tables only. No policies. |
| `04_data_course_config.sql` | INSERTs the **345** exported rows of the 9 course/config tables (see below). `ON CONFLICT DO NOTHING`, re-runnable. No student data. |
| `05_functions_and_rls.sql` | `homework_is_teacher()` verbatim from live, then all **40** `public`-schema RLS policies verbatim from `pg_policies` (each preceded by `DROP POLICY IF EXISTS`, re-runnable). Policy #16 is last — see known blockers. |

## What was copied

- All 29 tables, with columns, types, NOT NULL, defaults, PKs (including
  composite PKs), UNIQUE constraints, and FKs with the ON DELETE actions
  given in the live report.
- The 2 Storage buckets: `sach-bt-audio` (public) and `student-homework`
  (private, 25 MB limit = 26214400 bytes, allowed MIME types as listed
  in `02_storage_buckets.sql`).
- RLS enabled state: all 29 tables had RLS on in live, so all 29 are
  enabled here.
- **Course/config data (04): 345 rows, 9 tables** — app_settings 4,
  homework_windows 76, ntc_game_catalog 172 (exported in two batches,
  f3+f4, merged and de-duplicated on `(level, unit_key)`, 0 overlaps),
  ntc_game_classes 10, ntc_hsk5_review_catalog 36,
  ntc_hsk6_review_catalog 40, ntc_hidden_classes 1, ntc_class_moves 4,
  ntc_topic_review_assignments 2. Values are verbatim from the CSV
  export; CSV literal `null` is SQL `NULL`; `steps` in
  ntc_topic_review_assignments is inserted as `jsonb`. UUIDs are kept
  verbatim. Verified by read-back: all 345 generated INSERTs were
  re-parsed and compared field-by-field to the CSVs, 0 mismatches.
- **RLS policies + function (05):** `homework_is_teacher()` verbatim
  from `pg_get_functiondef`, and all 40 `public`-schema policies
  verbatim from `pg_policies` (names, commands, qual, with_check,
  role `authenticated`, `PERMISSIVE`), including the duplicate
  policies in daily_activity_writings and profiles. Verified by
  read-back: 40 `CREATE POLICY` / 40 `DROP POLICY IF EXISTS`, every
  qual/with_check string present verbatim. The hardcoded
  single-teacher email in the function and several policies is
  migrated verbatim and **must be replaced by the multi-teacher
  upgrade** — see uncertainties 9–10.

## What was NOT copied

- **No data rows.** No student, teacher, homework, progress or log rows.
- **No auth users.** `auth.users` is not copied; FKs to `auth.users(id)`
  are kept because that table already exists in a new Supabase project.
  Test accounts must be created fresh in the dev project.
- **No storage files.** Bucket definitions only; no audio / homework files.
- **No user data rows.** The other 20 tables (profiles, learning
  progress, homework submissions, game runs, etc.) and all Auth users
  are intentionally not copied — see 04's scope.
- **`can_submit_homework()` — ADDED 2026-11-17.** Policy #16
  (`homework_submissions_student_insert`) references it; its full
  definition was fetched from live via `pg_get_functiondef`
  (`can_submit_homework(p_window_id uuid, p_user_id uuid)`,
  STABLE SECURITY DEFINER) and is now in 05 above the policies.
- **No Storage policies.** The 6 `storage.objects` policies reported
  in the earlier inventory were not in the f11 export (it held only
  the 40 `public`-schema policies), so none are in 05. Export them
  separately before writing the multi-teacher storage policy set.
- **No storage files.** `sach-bt-audio` has 134 files (~600 MB) and
  `student-homework` 169 files (~10 MB) in live; neither is copied
  here. Audio is course content and still needs a file migration;
  homework files are user data and are out of scope.
- **No Edge Functions, Auth settings, or project settings.** Live has
  2 Edge Functions (`cleanup-homework-files`, `register-student`),
  but their code was not examined and is not copied. `register-student`
  is the one that matters for the upgrade (registration must change
  for multi-teacher); it needs its source code, which lives in the
  original site repo, not in Supabase.
- **No Vercel / frontend code.** This folder is Supabase schema only.

## How to run

Run in the dev project's **SQL Editor** (Supabase Dashboard → project
NGOCTHUCAC-LMS-v2-dev → SQL Editor → New query), in this order:

1. `01_schema_copy.sql` — paste and run. It must run as one script;
   tables are created first, FKs are added at the end, so order
   inside the file does not depend on FK order.
2. `02_storage_buckets.sql` — paste and run.
3. `03_rls_enable.sql` — paste and run.
4. `04_data_course_config_A.sql` — paste and run. **OPTION B
   APPLIED 2026-11-17 (supersedes option A):** the user first chose
   option A (NULL the 5 audit fields), but part 6 failed because
   `ntc_topic_review_assignments.created_by` is NOT NULL, so the user
   chose option B instead — a test teacher account was created in dev
   auth.users with the same UUID as live's teacher
   (`f28a600d-0ebe-43e2-b832-b1e3f314d0fa`, fake email
   `dev-teacher@example.com`), then the A file was re-run with the 5
   audit fields carrying that UUID instead of NULL. The original
   `04_data_course_config.sql` keeps the live teacher UUID verbatim —
   do NOT run both files. (The A file's own header note still says
   "OPTION A APPLIED"; the B re-run is what actually landed in dev.)
5. `05_functions_and_rls.sql` — paste and run. Policy #16 is last;
   its `can_submit_homework()` function was added 2026-11-17, so it
   should now create successfully. Now contains 4 functions:
   `homework_is_teacher()`, `can_submit_homework()`, `is_teacher()`,
   `ntc_teacher()` (last two added 2026-11-17).
6. `06_storage_policies.sql` — paste and run. 6 policies on
   `storage.objects`, verbatim from live (CSV f14). Run after 02
   (buckets) and 05 (functions).

Run them in a fresh, empty dev project. If a table or bucket already
exists, the CREATE TABLE statements will fail (they are not
`IF NOT EXISTS`); the bucket inserts use `ON CONFLICT (id) DO NOTHING`.
04 and 05 are re-runnable (`ON CONFLICT DO NOTHING` /
`DROP POLICY IF EXISTS` + `CREATE POLICY`).

## Verify after running

In the dev project, check:

- [ ] Table Editor shows **29** tables in `public`, with the exact names
      in `01_schema_copy.sql` (see list below).
- [ ] Each table's columns, PK and UNIQUEs match the live report.
- [ ] FKs exist: 32 FK constraints in total (count in
      Database → the FK list, or query `pg_constraint`).
      Spot-check the composite FKs:
      `ntc_game_assignments (level, unit_key)` →
      `ntc_game_catalog`, `ntc_game_runs (assignment_id, user_id)` →
      `ntc_game_recipients`, `ntc_vocabulary_progress (level, unit_key)` →
      `ntc_game_catalog`.
- [ ] Storage shows 2 buckets: `sach-bt-audio` (public) and
      `student-homework` (private, 25 MB).
- [ ] RLS is enabled on all 29 tables (Database → Tables → RLS column,
      or query `pg_tables` / `pg_class`).
- [ ] **No policies exist yet** — that is expected at this stage.
      Do not mistake "RLS enabled" for "isolated".
- [ ] After 04: row counts match the checklist — app_settings 4,
      homework_windows 76, ntc_game_catalog 172, ntc_game_classes 10,
      ntc_hsk5_review_catalog 36, ntc_hsk6_review_catalog 40,
      ntc_hidden_classes 1, ntc_class_moves 4,
      ntc_topic_review_assignments 2 (total 345). Query, e.g.:
      `select count(*) from public.ntc_game_catalog;` per table.
- [ ] After 05: 4 functions exist — `public.homework_is_teacher()`,
      `can_submit_homework()`, `is_teacher()`, `ntc_teacher()` — and
      `pg_policies` shows 40 policies on 19 tables. The 10 tables with
      zero policies in live still have none — that is expected here.
- [ ] After 06: `pg_policies` shows 6 policies on `storage.objects`,
      all for `student-homework`; `sach-bt-audio` has none, as in live.
- [ ] Replica goal (user, 2026-11-17): the dev copy must deploy
      exactly like Mingyu's live site before upgrade work starts —
      same frontend files (40, in `yushugeBase/`), same audio (134
      files, ~600 MB, in `audio/sach-bt-audio/`), same schema/data/
      policies/functions, then `register-student` is rewritten for
      multi-teacher and `cleanup-homework-files` is deferred. The
      only intentional differences in the replica are: option B
      (test teacher account in dev auth.users with live's teacher UUID;
      the 5 audit fields carry that UUID, not NULL), no real student
      data, and the frontend config pointing at the dev project instead
      of live.
- [x] **Migration status 2026-11-17 12:01 CST — ALL COMPLETE and
      verified in dev:** 01 (29 tables, 32 FKs), 02 (2 buckets),
      03 (RLS on all 29), 04-A via option B (345 rows), 05 (4 functions
      + 40 policies on 19 tables), 06 (6 policies on storage.objects).
      Only the dev project was touched; live untouched.
- [x] **Migration status 2026-11-18 — 05b/05c EXECUTED AND VERIFIED IN DEV
      2026-11-18 12:08–12:31:** live public schema actually holds
      **54 functions**, not the 4 in 05. The frontend calls ~25 RPCs
      (ntc_list_game_assignments etc.); their absence is why assigned
      games fail to load on the replica. 05b executed in 23 small
      chunks (05b_s1..s23) via the dev SQL Editor: function count
      4 → 8 → 17 → 23 → 28 → 36 → 41 → 49 → 54, verified after each
      batch. 05c executed (8 business triggers + event trigger
      ensure_rls): distinct trigger count 8 verified (the raw
      information_schema count 11 counts the 3 BEFORE INSERT OR UPDATE
      triggers twice, once per event type). 2026-11-18 12:04: chunk 1
      (23 KB) was REJECTED by the SQL Editor ("Query is too large to
      be run via the SQL Editor") — nothing executed, function count
      still 4. Re-split into ≤7 KB pieces (05b_s1..s23, 08b_s1..s7)
      and execute piece by piece; that size works.
- [x] **Migration status 2026-11-18 — 07/08/09 EXECUTED AND VERIFIED IN DEV
      2026-11-18 12:31–12:39:** teachers 1; **classes 9, not 5** —
      GV, YGS-B001, YGS-B002, YGS-B003, YSG001–YSG005 (the backfill
      UNION over homework_windows / ntc_game_assignments /
      ntc_topic_review_assignments / daily_activity_writings / profiles
      found 4 extra codes the earlier "5 classes" count missed; they
      are real data, so they stay); class_members 10 (= 9 teacher rows
      + 1 student); functions 56; public policies 50; hardcoded-email
      policies 0. Note: the email check must use pg_policies columns
      qual / with_check, not polqual / polwithcheck (the latter does
      not exist on the view). 08b fix 2026-11-18: ntc_roster_v2's class
      list had an AND/OR precedence leak — "(owns AND NOT hidden) OR
      (has student)" let another teacher's class through; parenthesised
      to owns AND ((NOT hidden) OR (has student)) in
      08b_scope_by_class.sql, 08b_s1.sql and gen_08b.py (verified the
      fixed generator reproduces the fixed file byte-for-byte); the
      other 08b owns_class sites were audited and are correctly
      parenthesised.
      08b status 2026-11-18 12:53: ALL 7 chunks executed and verified
      (functions 57, public policies 50, roster_v2 paren check = 1).
      s6 re-send fixed the transcription slip (missing paren in pasted
      text, not in the files). Sync-trigger test 2026-11-18 12:54–12:58:
      UPDATE / INSERT / DELETE paths all behave (test-student moved
      YSG001→YSG002→YSG001 with class_members following; temp
      test-dash profile created YSG003 membership and its DELETE
      removed it; count 0 after cleanup). Home warnings check same
      time: logged in as test-student on the replica, both "加载失败"
      warnings are gone (no match for 加载失败 / Thử lại); homework
      card + course cards load normally.
      07_multiteacher_model.sql (teachers / classes / class_members +
      backfill from existing class codes YSG001–YSG005, additive only);
      08_unify_teacher_check.sql (3 teacher-check functions now read
      the teachers table; 13 policies rewritten, email branches and
      JWT role branches replaced by public.is_teacher(); verified
      13/13 identical except the substitutions); 09_rls_zero_policy_tables.sql
      (10 new policies for learning_sessions / results / activity_logs /
      teachers / classes / class_members + a sync trigger keeping
      class_members in step with profiles.class_code).
      Still open: 08b (scope RPC list views and old teacher-wide
      policies by class — written 2026-11-18 by script gen_08b.py from
      the 05b/05 verbatim copies: helper ntc_teacher_owns_class + 14 RPC
      functions + 27 policies; leaderboards deliberately left
      centre-wide; also fixes 2 non-COALESCE role checks that 08
      missed, in learning_attempt_reviews and learning_lifetime_stats).

Tables (29): activity_logs, app_settings, daily_activity_writings,
game_best_records, homework_student_overrides, homework_submissions,
homework_windows, hsk3_attempt_reviews, hsk4_attempt_reviews,
learning_activity_totals, learning_attempt_reviews,
learning_lifetime_stats, learning_sessions, ntc_class_moves,
ntc_game_assignments, ntc_game_catalog, ntc_game_classes,
ntc_game_recipients, ntc_game_runs, ntc_hidden_classes,
ntc_hsk5_review_catalog, ntc_hsk5_review_progress,
ntc_hsk6_review_catalog, ntc_hsk6_review_progress,
ntc_topic_review_assignments, ntc_topic_review_students,
ntc_vocabulary_progress, profiles, results.

## Uncertainties — do not silently fix these

These are gaps in the live report, recorded here instead of guessed:

1. **SQL in this folder has not been executed against a Postgres
   instance in this task.** It was verified by read-back only:
   29 `CREATE TABLE` statements, each table name exactly once, no
   duplicates, no missing tables; 32 FK constraints; RLS statements
   for all 29 tables. Run it in the dev SQL Editor and report any
   error verbatim before editing.
2. **`learning_attempt_reviews.id` is `bigint` PK with no recorded
   default / identity.** The file creates it as plain `bigint PRIMARY KEY`
   with no default. Do not assume `GENERATED BY DEFAULT AS IDENTITY`
   until the live definition is confirmed.
3. **Several columns have no FK recorded, so none was added:**
   `session_id` in `hsk3_attempt_reviews`, `hsk4_attempt_reviews` and
   `learning_attempt_reviews`; `approved_by` in `profiles`;
   `created_by` in `homework_windows`; `user_id` in
   `ntc_game_recipients`. If live actually has those FKs, they were
   not in the report — confirm with a fresh `pg_constraint` check.
4. **FK ON DELETE actions not given in the report** are created with
   no `ON DELETE` clause (Postgres default NO ACTION). Affected FKs:
   `homework_submissions.graded_by`, `ntc_game_assignments (level,
   unit_key)`, `ntc_game_runs (assignment_id, user_id)`,
   `ntc_hsk5_review_progress.lesson`, `ntc_hsk6_review_progress.lesson`,
   `ntc_topic_review_assignments.created_by`,
   `ntc_topic_review_students.assignment_id` and `.user_id`,
   `ntc_vocabulary_progress (level, unit_key)`.
   Constraint names in this file (`*_fkey`) are also invented for
   readability — live constraint names were not recorded, so names
   may differ from live; that does not affect behaviour.
5. **`sach-bt-audio` file-size limit is unconfirmed.** Live showed
   "Unset / 50 MB". `02_storage_buckets.sql` inserts `NULL` for the
   limit. Confirm in the dev/live dashboard whether it should be
   `NULL` or `52428800` and correct the file if needed.
6. **RLS policy definitions — RESOLVED for `public` by 05 (2026-11-17
   export).** All 40 policies on 19 tables are now in
   `05_functions_and_rls.sql`, verbatim from `pg_policies`; the 10
   zero-policy tables are activity_logs, learning_sessions,
   ntc_class_moves, ntc_game_assignments, ntc_game_catalog,
   ntc_game_classes, ntc_game_recipients, ntc_game_runs,
   ntc_hidden_classes, results. Still open: the 6 `storage.objects`
   policies (not in the export) and `can_submit_homework()` (see 10).
   Do not copy policies from memory — re-read them from live with
   `pg_policies` before writing the multi-teacher policy set.
7. **Indexes, triggers, views, functions, and check constraints were
   not recorded** in the live check. If live has any, they are missing
   from this copy. Check `pg_indexes`, `pg_trigger`, `pg_views` and
   `pg_proc` in live before relying on this schema for performance
   or behaviour.
8. **Storage bucket policies are 0 in live** for both buckets. No
   policy is created here; the multi-teacher work must define them
   (in particular for the private `student-homework` bucket).
9. **KNOWN BLOCKER in 04 — FK to `auth.users`.**
   `app_settings.updated_by` (3 rows) and
   `ntc_topic_review_assignments.created_by` (2 rows) hold the live
   teacher's `auth.users` UUID, and both columns have an FK to
   `auth.users(id)` in 01. A fresh dev project has no such user, so
   those two sections fail with a foreign-key violation. The UUIDs
   are kept verbatim in 04 (not silently nulled) and those tables are
   last in the file. Fix by creating a dev auth user with that UUID
   first, or by setting those two columns to NULL for dev testing.
   The other UUID columns in 04 have no FK recorded and insert fine.
10. **RESOLVED 2026-11-17 — `can_submit_homework()` blocker in 05.**
    Its definition was exported verbatim from live and added to 05
    above the policies; 05 executed cleanly and policy #16 exists.
    The hardcoded teacher email in `homework_is_teacher()` (and in
    several policies) is migrated verbatim and must be replaced by
    the multi-teacher upgrade, not shipped as-is.

## Next steps (not in these files)

- Create test accounts (teachers A/B, test students) in the dev project.
- Add the multi-teacher tables (`teachers`, `classes`,
  `class_members`) and `teacher_id` / `class_id` columns as separate,
  numbered migrations — do not edit these copy files in place, so the
  live→dev copy stays reproducible.
- Write RLS policies (including for the 10 zero-policy tables and
  both buckets) and run a cross-tenant test before any migration
  back to NGOCTHUCAC-LMS.
