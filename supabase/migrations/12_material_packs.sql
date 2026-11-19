-- 12_material_packs.sql — 资料分发 v1（迁移 12）
-- 管理员把学习模块打成「资料包」指派给老师；学生端只显示分到手的模块。
-- 模块 = 学生首页九宫格 HOME_CATEGORIES 的 9 项（Shadowing 不进包，沿用其全局开关）。
-- item_ref：hsk1..hsk6、hsk7-9、topic（专题）、game（Game Center）。
-- 表只开 RLS、不设直接策略，全部走 SECURITY DEFINER 的 RPC（与 ntc_game_* 表同款姿态）。
-- 变改 RPC 非管理员或参数非法时返回 false/null，不抛错（沿用迁移 10/11 的约定）。
-- 单文件 8,334 字节，超 SQL Editor 安全块，改用 12_s1.sql + 12_s2.sql 两块按顺序跑。

-- ============ §1 表 ============
create table if not exists public.material_packs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.material_pack_items (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.material_packs(id) on delete cascade,
  item_type text not null default 'course' check (item_type = 'course'),
  item_ref text not null check (item_ref in ('hsk1','hsk2','hsk3','hsk4','hsk5','hsk6','hsk7-9','topic','game')),
  created_at timestamptz not null default now(),
  unique (pack_id, item_type, item_ref)
);
create table if not exists public.teacher_material_assignments (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.material_packs(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  unique (pack_id, teacher_id)
);
alter table public.material_packs enable row level security;
alter table public.material_pack_items enable row level security;
alter table public.teacher_material_assignments enable row level security;

-- ============ §2 包管理 RPC（只认 ntc_is_admin） ============
create or replace function public.ntc_admin_list_packs()
returns table (id uuid, name text, description text, is_active boolean, item_count bigint, teacher_count bigint, created_at timestamptz)
language sql stable security definer as $$
  select p.id, p.name, p.description, p.is_active,
    (select count(*) from public.material_pack_items i where i.pack_id = p.id),
    (select count(*) from public.teacher_material_assignments a where a.pack_id = p.id),
    p.created_at
  from public.material_packs p
  where public.ntc_is_admin()
  order by p.created_at desc;
$$;
create or replace function public.ntc_admin_create_pack(p_name text, p_description text default '')
returns uuid language plpgsql security definer as $$
declare v_id uuid;
begin
  if not public.ntc_is_admin() then return null; end if;
  if p_name is null or btrim(p_name) = '' then return null; end if;
  insert into public.material_packs (name, description, created_by)
  values (btrim(p_name), coalesce(p_description, ''), auth.uid()) returning id into v_id;
  return v_id;
end $$;
create or replace function public.ntc_admin_update_pack(p_pack_id uuid, p_name text, p_description text)
returns boolean language plpgsql security definer as $$
begin
  if not public.ntc_is_admin() then return false; end if;
  if p_name is null or btrim(p_name) = '' then return false; end if;
  update public.material_packs set name = btrim(p_name), description = coalesce(p_description, ''), updated_at = now()
  where id = p_pack_id;
  return found;
end $$;
create or replace function public.ntc_admin_delete_pack(p_pack_id uuid)
returns boolean language plpgsql security definer as $$
begin
  if not public.ntc_is_admin() then return false; end if;
  delete from public.material_packs where id = p_pack_id;
  return found;
end $$;
create or replace function public.ntc_admin_list_pack_items(p_pack_id uuid)
returns table (item_type text, item_ref text)
language sql stable security definer as $$
  select i.item_type, i.item_ref from public.material_pack_items i
  where i.pack_id = p_pack_id and public.ntc_is_admin()
  order by i.item_ref;
$$;

-- ============ §3 条目与指派 RPC ============
create or replace function public.ntc_admin_add_pack_item(p_pack_id uuid, p_item_type text, p_item_ref text)
returns boolean language plpgsql security definer as $$
begin
  if not public.ntc_is_admin() then return false; end if;
  if p_item_type <> 'course' then return false; end if;
  if p_item_ref not in ('hsk1','hsk2','hsk3','hsk4','hsk5','hsk6','hsk7-9','topic','game') then return false; end if;
  if not exists (select 1 from public.material_packs where id = p_pack_id) then return false; end if;
  insert into public.material_pack_items (pack_id, item_type, item_ref)
  values (p_pack_id, p_item_type, p_item_ref) on conflict do nothing;
  return true;
end $$;
create or replace function public.ntc_admin_remove_pack_item(p_pack_id uuid, p_item_type text, p_item_ref text)
returns boolean language plpgsql security definer as $$
begin
  if not public.ntc_is_admin() then return false; end if;
  delete from public.material_pack_items
  where pack_id = p_pack_id and item_type = p_item_type and item_ref = p_item_ref;
  return found;
end $$;
create or replace function public.ntc_admin_assign_pack(p_pack_id uuid, p_teacher_id uuid)
returns boolean language plpgsql security definer as $$
begin
  if not public.ntc_is_admin() then return false; end if;
  if not exists (select 1 from public.material_packs where id = p_pack_id) then return false; end if;
  if not exists (select 1 from public.teachers where id = p_teacher_id) then return false; end if;
  insert into public.teacher_material_assignments (pack_id, teacher_id, assigned_by)
  values (p_pack_id, p_teacher_id, auth.uid()) on conflict do nothing;
  return true;
end $$;
create or replace function public.ntc_admin_unassign_pack(p_pack_id uuid, p_teacher_id uuid)
returns boolean language plpgsql security definer as $$
begin
  if not public.ntc_is_admin() then return false; end if;
  delete from public.teacher_material_assignments
  where pack_id = p_pack_id and teacher_id = p_teacher_id;
  return found;
end $$;
create or replace function public.ntc_admin_list_pack_teachers(p_pack_id uuid)
returns table (teacher_id uuid, display_name text, slug text)
language sql stable security definer as $$
  select t.id, t.display_name, t.slug
  from public.teacher_material_assignments a
  join public.teachers t on t.id = a.teacher_id
  where a.pack_id = p_pack_id and public.ntc_is_admin()
  order by t.display_name;
$$;

-- ============ §4 学生侧：我分到了哪些模块 ============
-- 按学生自己的班级找到老师，再取该老师所有已激活包的条目；无班级/无指派返回空集。
create or replace function public.ntc_get_my_materials()
returns table (item_type text, item_ref text)
language sql stable security definer as $$
  select distinct i.item_type, i.item_ref
  from public.profiles p
  join public.classes c on c.code = p.class_code
  join public.teacher_material_assignments a on a.teacher_id = c.teacher_id
  join public.material_packs pk on pk.id = a.pack_id and pk.is_active
  join public.material_pack_items i on i.pack_id = a.pack_id
  where p.user_id = auth.uid() and p.account_type = 'student';
$$;

-- ============ §5 回填：全部课程包，指派给现有老师 ============
do $$
declare v_pack uuid;
begin
  select id into v_pack from public.material_packs where name = '全部课程' limit 1;
  if v_pack is null then
    insert into public.material_packs (name, description)
    values ('全部课程', '回填：包含全部 9 个学习模块，指派给现有老师。')
    returning id into v_pack;
  end if;
  insert into public.material_pack_items (pack_id, item_type, item_ref)
  select v_pack, 'course', r from (values ('hsk1'),('hsk2'),('hsk3'),('hsk4'),('hsk5'),('hsk6'),('hsk7-9'),('topic'),('game')) as t(r)
  on conflict do nothing;
  insert into public.teacher_material_assignments (pack_id, teacher_id)
  select v_pack, id from public.teachers
  on conflict do nothing;
end $$;
