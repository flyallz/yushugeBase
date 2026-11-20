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
- [x] **register-student rewritten, deployed to dev and tested
      end-to-end 2026-11-18 12:58–13:04:** source in
      supabase/functions/register-student/index.ts (in the repo tree,
      rides the 19:30 single push). Deployed via Dashboard → Edge
      Functions → Via Editor. First site-form test failed at the
      gateway: "Missing authorization header" — the function ships
      with "Verify JWT with legacy secret" ON by default, but the
      frontend (live code, unchanged) sends no Authorization header.
      Fixed by turning JWT verification OFF for this function (matches
      live; registration is a public endpoint — noted in the source
      header). Retest passed: site form showed "✅ Đã gửi đăng ký.
      Vui lòng chờ giáo viên duyệt rồi đăng nhập。", profiles row
      created (student / pending / YSG001), class_members YSG001 row
      created by the sync trigger. Test account deleted afterwards
      (profiles count 0, Auth user deleted).
- [ ] **Frontend teacher-login gate — third JWT-role check, found by
      the cross-tenant test 2026-11-18 13:11:** hoc-tap.html:4081
      gated teacher login on `app_metadata.role === 'teacher'`.
      Fake teachers A/B (teachers rows active, profiles teacher /
      approved) were rejected with "Tài khoản này chưa được cấp quyền
      giáo viên。" because dashboard-created Auth users carry no role
      claim. Fixed locally in yushugeBase-dev/hoc-tap.html: the gate
      now queries the teachers table for the signed-in user's own
      active row (RLS self-read allows it) — the only app_metadata
      check left in the whole frontend. Rides the 19:30 single push.
      LIVE ROLLOUT ORDER MATTERS: run 07 (which backfills Mingyu's
      teachers row) BEFORE deploying this frontend change, or Mingyu
      herself gets locked out of teacher login. Cross-tenant UI test
      (A sees only TA-001/学生A, B only TB-001/学生B) runs after the
      19:30 switch. Fixtures ready in dev: teacher-a/b, student-a/b,
      TA-001/TB-001 classes + windows + submissions + game
      assignments, all counts 2.
- [x] **10_teacher_branding_and_onboarding — written 2026-11-19, EXECUTED
      AND VERIFIED 2026-11-19 09:49–09:54 in dev (browser SQL Editor,
      yanfu1999-create login):** teachers 表加品牌字段（brand_name、
      tagline_vi/zh、photo_url、zalo_url、facebook_url）+ is_admin；回填
      co-ngoc（品牌 Ngọc Thư Các、管理员 true、照片/Zalo/Facebook）；公开
      品牌 RPC ntc_get_teacher_branding / ntc_get_teacher_classes
      （SECURITY DEFINER，只吐品牌字段，不给 anon 开 teachers 表）；本人
      改品牌 RPC ntc_update_my_branding（只改品牌列）；管理员审批 RPC
      ntc_is_admin / ntc_list_pending_teachers / ntc_set_teacher_active
      （禁改自己防自锁，批的同时同步 profiles.approval_status）；新公开
      桶 teacher-branding（5MB、仅图片）+ 4 条存储策略（公开读、本人目录
      写）。执行分两块：10_s1.sql（§1–§3）、10_s2.sql（§4–§5），均
      "Success. No rows returned"。验证 6/6 通过：teachers 3 行
      （co-ngoc 品牌/管理员/照片齐全，teacher-a/b 为空）；品牌 RPC 1 行
      （co-ngoc 全字段；注：display_name 为空，属 07 回填既有数据，不影
      响品牌展示——RPC 里 brand_name 已做 fallback）；班级 RPC 9 行
      （GV、YGS-B001、YSG-B002、YSG-B003、YSG001–YSG005——注意实际码是
      YSG-B002/B003，不是任务里写的 YGS-B002/B003）；桶 public true；
      存储策略 4 条；函数总数 63（57+6）。register-teacher Edge 函数
      源码已写好（supabase/functions/register-teacher/index.ts），待部署
      （JWT 校验须关，参考 register-student）。多教师方向用户 2026-11-19
      拍板：模拟站先做全、没 bug 再迁回正式站；live Developer 权限先不动。
- [x] **10b_teacher_display_names — written 2026-11-19, EXECUTED AND
      VERIFIED 2026-11-19 09:57–10:03 in dev:** 补 10：teachers 表加
      display_name_zh；ntc_update_my_branding 加显示名参数；品牌 RPC
      返回 display_name_zh；回填 co-ngoc 显示名 Cô Ngọc / 明玉老师。
      首次执行报 42P13（Postgres 不允许 CREATE OR REPLACE 改函数返回
      类型），修正为先 DROP FUNCTION IF EXISTS 再建后重跑成功——修正版
      已写回 10b 文件（可重跑，幂等）。验证：teachers 3 行（co-ngoc
      Cô Ngọc / 明玉老师；teacher-a/b 显示名 A老师/B老师、中文名空）；
      品牌 RPC 1 行全字段齐全。register-teacher Edge 函数同日部署成功
      （Via Editor 粘贴，JWT 校验已关，函数列表现为 register-student +
      register-teacher）；主代理 curl 空请求验证通过：{} →
      MISSING_DISPLAY_NAME，错邮箱 → INVALID_EMAIL（均为 400，函数已
      跑、JWT 确实关着，未建任何账号）。
- [x] **11_admin_console — written 2026-11-19, EXECUTED AND VERIFIED
      2026-11-19 11:40–11:49 in dev:** 管理员控制台 RPC（5 个，全部
      SECURITY DEFINER、只认 ntc_is_admin）：ntc_admin_list_teachers /
      ntc_admin_list_classes / ntc_admin_list_students（可按老师/班级过滤）/
      ntc_admin_set_student_approval / ntc_admin_move_student；老师停用复用
      10 的 ntc_set_teacher_active。变改 RPC 非管理员或参数非法时返回
      false，不抛错。单文件 5,452 字节，整块执行 Success。验证（JWT
      claims 设身份）：管理员 dev-teacher：老师 4 行、班级 13 行、学生 5 行
      （不是预期的 4 行——多的一行是 Cô C 的遗留学生 profiles 记录：
      register-teacher 时触发器建的学生档案，A/B 当时删了重建、C 的没删；
      迁移只建函数、不写 profiles，所以是既有数据，E2E 前删掉该行再验）、
      函数总数 69（不是预期的 68——基数实际为 64 不是 63，5 个新函数按名
      全在；多出的 1 个疑似 can_submit_homework_before_reopen_20261106，
      未定论，只记账不阻塞）；普通老师 A：两列表 0 行、两变改 RPC 均
      false，无数据改动。
      前端控制台已于 2026-11-19 14:43–14:49 端到端验证通过
      （管理员 4 老师/13 班/4 学生、筛选、转班/锁定/停用三组往返、
      普通老师 A 看不到控制台卡）；Cô C 遗留学生档案已删，学生数回到 4。
- [x] **12_material_packs — written 2026-11-19, EXECUTED AND VERIFIED
      2026-11-19 15:18–15:23 in dev:**
      资料分发 v1（3 张新表 + 11 个 RPC，全部 SECURITY DEFINER）：
      material_packs / material_pack_items / teacher_material_assignments，
      只开 RLS、不设直接策略（RPC-only）。管理 RPC 只认 ntc_is_admin：
      list_packs / create_pack / update_pack / delete_pack /
      list_pack_items / add_pack_item / remove_pack_item /
      assign_pack / unassign_pack / list_pack_teachers；学生侧
      ntc_get_my_materials() 按自己班级找到老师、返回已激活包的条目。
      条目只限 9 个九宫格模块（hsk1..hsk6、hsk7-9、topic、game），
      Shadowing 不进包（沿用其全局开关）。回填「全部课程」包（9 条目）
      指派给现有 4 位老师。单文件 8,334 字节超 SQL Editor 安全块，
      分 12_s1.sql（4,358）+ 12_s2.sql（3,976）两块按顺序跑。
      两块均 Success，无报错。验证（JWT claims 设身份）：管理员：
      包 1、条目 9、指派 4，函数总数 80（69 + 11），
      ntc_admin_list_packs() 1 行（全部课程，9 条目 / 4 老师）；
      学生 C（auth UUID e4cb1a01-1af8-4ce9-922d-eaf1fb03cb98）
      ntc_get_my_materials() 9 行；普通老师 A：列表 0 行、
      create_pack null、assign_pack false，无数据改动。
      小现象：停用老师即置 is_active=false，界面上显示为“待审批”
      （复用审批流程，无单独停用标签）；刚批准后待审批列表需手动刷新
      才消失，属刷新滞后，数据无误。
- [x] **13_separate_super_admin — written 2026-11-19, EXECUTED AND VERIFIED
      2026-11-19 20:28–20:30 in dev:**
      超管与老师分家。新建纯超管 Auth 用户 admin@example.com
      （UUID 381a246a-0cc6-4e37-982c-7200de0f63f8，Auto Confirm，
      密码 admin-123，仅开发站测试号）：补 app_metadata role='teacher'
      （登录路径不依赖它，只是以防万一；doLogin 只查 teachers 表），
      删掉触发器自动建的学生 profiles 行，插入 teachers 行
      （slug 'admin'，display_name 'Quản trị viên' / 超管，
      is_active + is_admin），同时把 co-ngoc 的 is_admin 改为 false
      （明玉号从此只是普通老师）。验证：teachers 6 行——admin true/true，
      co-ngoc / co-c / teacher-a / teacher-b / flyall 均为 is_admin false；
      该 UUID 的 profiles 0 行；role='teacher'。
      前端配合（hoc-tap.html，提交 fdf8c9e7）：新增 applyAdminView()，
      超管进老师面板只显示待审批老师 + 全站管理（老师/班级/学生/
      资料包）两张卡，老师工作台整块（.teacher-dashboard-wrap）和
      通向学生视图的侧栏菜单全部隐藏；非超管老师行为不变；零新文案。
      注意：品牌卡在老师工作台里，超管号改不了 co-ngoc 的品牌，
      要切明玉老师号；超管进面板后老师数据查询仍在后台跑（隐藏的
      wrap 还在被写），只浪费请求，不影响显示。
- [x] **14_teacher_profile_and_course_listing — EXECUTED 2026-11-20 in dev:**
      老师可改项扩展（个人详细信息 + 主页上架）：
      teachers 表加 profile jsonb（全名/头衔/学校、自我介绍、学历时间线、
      标签、奖学金），回填 co-ngoc 照 index.html #giaovien 区原文
      （学历两条、自我介绍、标签、奖学金三条，一个字不编；标签为
      {vi,zh} 对象）；classes 表加 display_name/level/description/
      schedule/is_listed（现有班级默认全部上架，主页行为不变）；
      ntc_get_teacher_branding 改版（返回加 profile，先 DROP 再 CREATE，
      见 10b 的 42P13 教训），ntc_get_teacher_classes 改版（返回加 id +
      5 个上架字段，id 是前端按班保存必需的）；新写 RPC
      ntc_update_my_profile（只改自己行，非 JSON 对象返回 false）与
      ntc_update_my_class_listing（只改自己名下班级，按
      classes.teacher_id 对调用者 teachers 行校验，否则返回 false）。
      单文件 8,571 字节，分 5 段按顺序粘贴执行（2,426 + 348 + 760 +
      648 + 1,507，均 ≤7KB）。执行后核对全过：co-ngoc profile 非空
      （intro_zh 与 full_name_zh 梁黄明玉已确认）、classes 9 行
      is_listed 全 true、两个改版 RPC 返回正确、public 函数总数 82
      （80 + 2 个新写 RPC；注意：ntc_ 前缀的函数只有 62 个，82 是
      全部 public 函数数——文件头验证查询的 LIKE 'ntc_%' 口径写错过，
      已另跑全量计数确认为 82）。
      前端配合（hoc-tap.html 个人主页视图内新增个人详细信息表单与
      主页上架表单；index.html 按 profile 渲染介绍区、按 is_listed
      与上架字段渲染课程卡；outer-language.js 补字典并把
      #teacherBrandingView 补进翻译 scopes——拆分时品牌卡搬出
      #teacherDashboardView 后一度不在翻译范围内；档案字段补全修正：
      全名/头衔/学校 + 双语标签，co-ngoc 渲染后与原站 26 处文案逐字一致）。
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

## API-level isolation test — PASSED 2026-11-19 (dev only, curl + anon key)

Direct REST/RPC calls with teacher A and teacher B JWTs (throwaway dev
test accounts). 10 checks, all passed, no test data created (every
forged write was rejected server-side, nothing landed):

- A reads own: ntc_list_game_assignments = TA-001 only (1 row);
  profiles student-a visible (学生A / TA-001).
- A forged reads: profiles student-b = []; learning_sessions
  student-b = []; homework_windows class TB-001 = [].
- A forged writes: ntc_create_game_assignment(TB-001) -> 400
  "Lớp không thuộc về bạn"; set_homework_window_enabled(TB-001
  window) -> 400 "Không tìm thấy lịch nộp bài."; direct INSERT into
  homework_windows(TB-001) -> 403 "new row violates row-level
  security policy".
- B reverse: own assignments = TB-001 only; profiles student-a = [];
  homework_windows TA-001 = []; ntc_create_game_assignment(TA-001)
  -> 400 "Lớp không thuộc về bạn".

Conclusion: cross-tenant isolation holds at the API/RLS layer, not
just in the UI. UI-level test (2026-11-19 09:22) had already passed.

## 15. ntc_get_teacher_classes 排除存档班（2026-11-20，已执行并核对通过）
- 原因：删班有历史记录时只存档（ntc_hidden_classes），不删 classes 行；但 ntc_get_teacher_classes 不排除存档班，班级管理总览、个人主页“主页上的课程”、首页课程卡三处仍显示已删的班；花名册本来就过滤存档班，两边不一致。
- 改动：CREATE OR REPLACE ntc_get_teacher_classes（返回列不变），加 NOT EXISTS 排除当前老师在 ntc_hidden_classes 里的班（按 code + teachers.auth_user_id 对，hidden 表的 teacher_id 存的是 Auth UUID）。
- 前端不用改，三处都走同一个 RPC。超管 ntc_admin_list_classes 不走此函数，不受影响。
- 执行与核对（2026-11-20 14:24–14:26，SQL Editor，开发库 only）：执行成功（Success. No rows returned）。核对：ntc_hidden_classes 共 6 行——GV、YSG-B002、YSG002、YSG003、YSG004、YSG005（即用户在班级管理删掉的 6 个班，全为有历史记录的存档删）；ntc_get_teacher_classes('co-ngoc') 返回 3 行——YGS-B001、YSG-B003、YSG001（is_listed 全 true），count(*) = 3，与 9 - 6 一致。修正：班级管理顶上的“班级”总览也走这个 RPC，之前称“花名册过滤、总览不过滤”的说法不准确——总览与上架卡、首页一样都不过滤，迁移 15 一次修了三处。
- 注：repo 副本 README 尚未同步本条，下次推前端时随同更新。

## 16. 超管删除三件套（2026-11-20，文件已写，待执行/部署/验证）
- 批准：用户 2026-11-20 14:25 亲口批准“删学生、删老师、删班级都补上”，只给超管用。
- 迁移 16_admin_delete_functions.sql（16,023 字节，两份副本逐字节一致）：3 个 RPC，全部 SECURITY DEFINER、ntc_is_admin() 门控、非超管返回 {ok:false, reason:'NOT_ADMIN'}。
  - ntc_admin_delete_student_data(p_user_id)：删学生 21 张表的全部数据行（按 01 枚举：ntc_game_runs→ntc_game_recipients 先后顺序有要求，复合外键无级联；homework_submissions 因 RESTRICT 外键必须在删 Auth 号之前；profiles 只删 account_type='student' 的行），返回 jsonb 各表删除数。
  - ntc_admin_delete_teacher(p_teacher_id)：名下任一班有学生（任何审核状态）→ HAS_STUDENTS；不能删自己（IS_SELF）、不能删另一超管（IS_ADMIN）；名下空班按 08b 删班规则（有历史存档、无历史真删，存档行 teacher_id 填该老师的 Auth UUID）；删该老师建的主题复习指派（先删学生行再删指派，否则 created_by NO ACTION 外键拦删号）；删资料包指派；内部调 §1 清老师的学生侧数据；删 teachers 行与老师档案行；返回 auth_user_id 供 Edge Function 删号。
  - ntc_admin_delete_class(p_code)：可删任意老师的班，不设归属限制；有学生 → HAS_STUDENTS；有历史存档（teacher_id 填班主老师的 Auth UUID）、无历史真删；返回 {class_code, archived}。
  - 刻意不删的：homework_windows / ntc_game_assignments / ntc_class_moves（班级历史）、无外键的 created_by / approved_by 引用、app_settings.updated_by（删号自动 SET NULL）。
- Edge Function supabase/functions/admin-delete-user/index.ts（新建，8,472 字节）：JWT 校验必须开（与注册函数相反）；前端带 session token 调；先以调用者 JWT 调对应 RPC（第二道门），再用 service_role 删 student-homework 桶文件（前缀 <user_id>/ 与 teacher-feedback/<user_id>/，递归 list，文件夹以 id 为 null 识别），最后 Admin API 删 Auth 用户；Storage 失败不阻断删号（记进 storage_error），Auth 删号失败报 AUTH_DELETE_FAILED + data_deleted:true。kind='student' 时 user_id 是学生 Auth UUID；kind='teacher' 时 user_id 是 teachers.id。
- 前端 hoc-tap.html（仅超管控制台内）：老师行（超管行与自己行不显示）、班级行、学生行各加“🗑 Xóa”删除按钮；两步确认仿 adminDeletePack（armDeleteConfirm，5 秒回退），第一次点在 #adminConsoleStatus 写整句警告；删完刷新列表、状态写进 adminConsoleStatus；reason 映射用整句文案。outer-language.js +20 键（628 键），'🗑 Xóa' 走已有 emoji 前缀规则 + 'Xóa' 键、'⚠ Chắc chắn xóa?' 已有，无重复键。
- 执行与部署（2026-11-20，开发库 only）：迁移 3 块执行成功（14:35–14:38，SQL Editor），函数总数 82 → 85；Edge Function admin-delete-user 已部署（14:35–14:37，Via Editor 粘贴），JWT 校验确认开，无授权头请求返回 401 UNAUTHORIZED_NO_AUTH_HEADER。
- 复核修正（2026-11-20，我）：子代理初版 adminDeleteTeacher 只调 RPC、不走 Edge Function，老师登录账号会漏删；已改成与删学生同一条路（调 admin-delete-user，kind='teacher'），另补 1 条词典（628 键）——老师侧 AUTH_DELETE_FAILED 不能点重试（RPC 会报 NOT_FOUND），状态句改为指引去后台 Authentication → Users 手动删号；学生侧重试可行（RPC 幂等），保留“请重试”。
- 状态：迁移已执行、函数已部署；待推前端、真删测试（新建测试学生/老师再删，验证清单见 16 文件末尾）。
