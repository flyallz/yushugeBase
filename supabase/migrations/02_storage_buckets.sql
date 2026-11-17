-- ============================================================================
-- YuShuGe2 dev project — 02_storage_buckets.sql
-- Source: live project NGOCTHUCAC-LMS, verified by read-only browser check
--   on 2026-11-17 (browser-task:98b0980d-5a14-5853-9060-568fd90e34dd).
--   Live had exactly 2 Storage buckets, both with 0 policies.
--   No bucket files were opened or copied.
-- Target: new dev project NGOCTHUCAC-LMS-v2-dev
--   (project ID ggknfrlclouuvsmxyfrt, org YuShuGe2, Free, ap-south-1 Mumbai).
-- IMPORTANT: bucket policies are 0 in live and must be added separately
--   in the multi-teacher work. No policy is invented here.
-- Uncertainty: for sach-bt-audio the live page showed the file-size
--   limit as "Unset / 50 MB". It is not confirmed whether the limit is
--   unset (NULL) or 50 MB (52428800). This file therefore inserts NULL
--   for file_size_limit for that bucket — do not treat that as verified.
--   Verify in the dev project after running, and record the correct
--   value in the README if it is confirmed.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sach-bt-audio',
  'sach-bt-audio',
  true,
  NULL, -- live showed "Unset / 50 MB" — unconfirmed, see header
  NULL  -- live showed allowed MIME types as "any" — no restriction recorded
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'student-homework',
  'student-homework',
  false,
  26214400, -- 25 MB, as recorded in live
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'audio/mpeg',
    'audio/mp4',
    'audio/aac',
    'audio/wav',
    'audio/webm',
    'audio/x-m4a'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- No storage policies are created here: live had 0 policies on both buckets.
-- End of 02_storage_buckets.sql — 2 buckets.
