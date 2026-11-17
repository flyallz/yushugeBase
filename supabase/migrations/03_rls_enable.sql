-- ============================================================================
-- YuShuGe2 dev project — 03_rls_enable.sql
-- Source: live project NGOCTHUCAC-LMS, verified by read-only browser check
--   on 2026-11-17 (browser-task:98b0980d-5a14-5853-9060-568fd90e34dd).
--   In live, RLS was enabled (rowsecurity = true) on all 29 tables.
-- Target: new dev project NGOCTHUCAC-LMS-v2-dev
--   (project ID ggknfrlclouuvsmxyfrt, org YuShuGe2, Free, ap-south-1 Mumbai).
-- This file ONLY enables RLS. It creates NO policies.
-- Policy definitions were NOT recorded in the live check — only the
--   count of policies per table — so no policy can be faithfully copied
--   here. Policies are part of the multi-teacher work, not this copy.
--
-- Tables that HAD policies in live (count only, definitions unknown):
--   app_settings (3), daily_activity_writings (4), game_best_records (3),
--   homework_student_overrides (4), homework_submissions (3),
--   homework_windows (4), hsk3_attempt_reviews (2),
--   hsk4_attempt_reviews (2), learning_activity_totals (1),
--   learning_attempt_reviews (2), learning_lifetime_stats (1),
--   ntc_hsk5_review_catalog (1), ntc_hsk5_review_progress (1),
--   ntc_hsk6_review_catalog (1), ntc_hsk6_review_progress (1),
--   ntc_topic_review_assignments (1), ntc_topic_review_students (1),
--   ntc_vocabulary_progress (1), profiles (4)
--   — 19 tables in total.
--
-- Tables that had ZERO policies in live (RLS on, no policy):
--   activity_logs, learning_sessions, ntc_class_moves,
--   ntc_game_assignments, ntc_game_catalog, ntc_game_classes,
--   ntc_game_recipients, ntc_game_runs, ntc_hidden_classes, results
--   — 10 tables in total.
--   With RLS enabled and no policy, these tables deny access through
--   the API (service_role still bypasses RLS). This gap must be
--   addressed explicitly in the multi-teacher work — do not assume
--   "RLS on" means "isolated".
-- ============================================================================

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_activity_writings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_best_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homework_student_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homework_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homework_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hsk3_attempt_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hsk4_attempt_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_activity_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_attempt_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_lifetime_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ntc_class_moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ntc_game_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ntc_game_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ntc_game_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ntc_game_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ntc_game_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ntc_hidden_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ntc_hsk5_review_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ntc_hsk5_review_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ntc_hsk6_review_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ntc_hsk6_review_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ntc_topic_review_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ntc_topic_review_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ntc_vocabulary_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;

-- End of 03_rls_enable.sql — RLS enabled on all 29 tables, 0 policies created.
