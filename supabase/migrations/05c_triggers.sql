-- 05c_triggers.sql
-- 玉书阁开发项目 NGOCTHUCAC-LMS-v2-dev：触发器挂接（逐字照录线上定义）
-- 来源：2026-11-18 从线上项目 NGOCTHUCAC-LMS 用 pg_get_triggerdef 全量导出
-- （CSV：browser-download-20261118T035050.095945460Z-1-Supabase_Snippet_Untitled_query.csv，
-- 21 个非系统触发器，定义逐字照录，未改一字）
-- 执行顺序：必须在 05b_rpc_functions.sql 之后执行，因为触发器引用的函数本体
-- （handle_new_user_profile、ntc_guard_*、ntc_close_assigned_checkpoint、
-- update_learning_submission_total、homework_set_updated_at 等）都在 05b 里。
-- 注意：
--  1. 线上 21 个触发器中只有下面 8 个是业务触发器，本文件只建这 8 个。
--     其余 13 个是 Supabase 平台自带的（cron.job、realtime.subscription、
--     storage.buckets、storage.objects 上的），新项目默认就有，不用重建；
--     它们的定义附在文件末尾注释里备查，不执行。
--  2. on_auth_user_created 挂在 auth.users 上：新用户注册后自动建 profiles 行。
--     这是注册链路的一部分，register-student 重写时要以它为准。
--  3. 事件触发器（pg_event_trigger，如 rls_auto_enable）不在此文件——事件触发器
--     没有 pg_get_triggerdef 等价物，待清单回来后另写语句，见文件末尾待办。
-- 目标：执行完开发库业务触发器数 = 8；平台触发器由 Supabase 自带。


-- ---- on_auth_user_created ON auth.users ----
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user_profile();

-- ---- homework_overrides_updated_at ON homework_student_overrides ----
CREATE TRIGGER homework_overrides_updated_at BEFORE UPDATE ON public.homework_student_overrides FOR EACH ROW EXECUTE FUNCTION homework_set_updated_at();

-- ---- ntc_guard_hsk3_writing ON homework_submissions ----
CREATE TRIGGER ntc_guard_hsk3_writing BEFORE INSERT OR UPDATE ON public.homework_submissions FOR EACH ROW EXECUTE FUNCTION ntc_guard_hsk3_writing();

-- ---- ntc_guard_hsk46_payload ON homework_submissions ----
CREATE TRIGGER ntc_guard_hsk46_payload BEFORE INSERT OR UPDATE ON public.homework_submissions FOR EACH ROW EXECUTE FUNCTION ntc_guard_hsk46_payload();

-- ---- ntc_guard_hsk5_payload ON homework_submissions ----
CREATE TRIGGER ntc_guard_hsk5_payload BEFORE INSERT OR UPDATE ON public.homework_submissions FOR EACH ROW EXECUTE FUNCTION ntc_guard_hsk5_payload();

-- ---- homework_windows_updated_at ON homework_windows ----
CREATE TRIGGER homework_windows_updated_at BEFORE UPDATE ON public.homework_windows FOR EACH ROW EXECUTE FUNCTION homework_set_updated_at();

-- ---- ntc_close_assigned_checkpoint ON ntc_game_runs ----
CREATE TRIGGER ntc_close_assigned_checkpoint AFTER UPDATE OF finished_at ON public.ntc_game_runs FOR EACH ROW WHEN (((old.finished_at IS NULL) AND (new.finished_at IS NOT NULL))) EXECUTE FUNCTION ntc_close_assigned_checkpoint();

-- ---- trg_update_learning_submission_total ON results ----
CREATE TRIGGER trg_update_learning_submission_total AFTER INSERT ON public.results FOR EACH ROW EXECUTE FUNCTION update_learning_submission_total();


-- ============ 以下为平台自带触发器定义，仅备查，不执行 ============
-- （新 Supabase 项目默认自带；若开发库核对时发现缺失，说明平台版本不同，
-- 再单独处理，不要直接 CREATE TRIGGER。）
-- ---- cron_job_cache_invalidate ON cron.job ----
-- CREATE TRIGGER cron_job_cache_invalidate AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON cron.job FOR EACH STATEMENT EXECUTE FUNCTION cron.job_cache_invalidate();

-- ---- tr_check_filters ON realtime.subscription ----
-- CREATE TRIGGER tr_check_filters BEFORE INSERT OR UPDATE ON realtime.subscription FOR EACH ROW EXECUTE FUNCTION realtime.subscription_check_filters();

-- ---- enforce_bucket_name_length_trigger ON storage.buckets ----
-- CREATE TRIGGER enforce_bucket_name_length_trigger BEFORE INSERT OR UPDATE OF name ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_name_length();

-- ---- enforce_versioning_status_transition ON storage.buckets ----
-- CREATE TRIGGER enforce_versioning_status_transition BEFORE UPDATE OF versioning_status ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_versioning_status_transition();

-- ---- protect_active_lifecycle_states ON storage.buckets ----
-- CREATE TRIGGER protect_active_lifecycle_states BEFORE DELETE ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.protect_active_lifecycle_states();

-- ---- protect_bucket_control_insert ON storage.buckets ----
-- CREATE TRIGGER protect_bucket_control_insert BEFORE INSERT ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.protect_bucket_control_columns('service_role');

-- ---- protect_bucket_control_update ON storage.buckets ----
-- CREATE TRIGGER protect_bucket_control_update BEFORE UPDATE OF lifecycle_configuration, lifecycle_configuration_generation ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.protect_bucket_control_columns();

-- ---- protect_bucket_control_update_role ON storage.buckets ----
-- CREATE TRIGGER protect_bucket_control_update_role AFTER UPDATE OF lifecycle_configuration, lifecycle_configuration_generation ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_lifecycle_service_role('service_role');

-- ---- protect_buckets_delete ON storage.buckets ----
-- CREATE TRIGGER protect_buckets_delete BEFORE DELETE ON storage.buckets FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();

-- ---- wake_lifecycle_on_policy_write ON storage.buckets ----
-- CREATE TRIGGER wake_lifecycle_on_policy_write AFTER INSERT OR UPDATE OF lifecycle_configuration_generation ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.wake_lifecycle_state();

-- ---- wake_lifecycle_on_versioning_enable ON storage.buckets ----
-- CREATE TRIGGER wake_lifecycle_on_versioning_enable AFTER UPDATE OF versioning_status ON storage.buckets FOR EACH ROW WHEN ((new.lifecycle_configuration IS NOT NULL)) EXECUTE FUNCTION storage.wake_lifecycle_state();

-- ---- protect_objects_delete ON storage.objects ----
-- CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete();

-- ---- update_objects_updated_at ON storage.objects ----
-- CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column();


-- ============ 事件触发器 ============
-- 线上 pg_event_trigger 共 7 行，只有 ensure_rls 是业务相关的：
-- 建表时自动给新表开 RLS——这就是为什么线上 29 张表 RLS 全开着。
-- 其余 6 个是 Supabase 平台自带的（graphql / pg_cron / pg_net 授权占位、
-- PostgREST 缓存监听），新项目默认就有，不用重建，函数也不在 public 模式。
DROP EVENT TRIGGER IF EXISTS ensure_rls;
CREATE EVENT TRIGGER ensure_rls
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION public.rls_auto_enable();
-- 平台自带（备查，不执行）：issue_graphql_placeholder / issue_pg_cron_access /
-- issue_pg_graphql_access / issue_pg_net_access / pgrst_ddl_watch / pgrst_drop_watch。
-- 目标：执行完开发库事件触发器 ensure_rls 存在且启用。
