-- Legacy cleanup plan for historical `public.peptides` table.
--
-- Safe by default:
-- - Always inspects first.
-- - Creates a timestamped backup copy.
-- - Refuses to drop when dependencies exist.
-- - Does not drop unless `perform_drop` is set to true in Step 4.
--
-- Usage (Supabase SQL editor or psql):
-- 1) Run full script once with default settings (no drop).
-- 2) Review dependency output.
-- 3) Re-run Step 4 only after confirming no dependencies and after backup is verified.

-- Step 1: Preflight
select
  to_regclass('public.peptides') as peptides_table,
  to_regclass('public.compounds') as compounds_table;

do $$
declare
  peptides_exists boolean := to_regclass('public.peptides') is not null;
  peptides_rows bigint := 0;
  compounds_rows bigint := 0;
begin
  if peptides_exists then
    execute 'select count(*) from public.peptides' into peptides_rows;
  end if;

  if to_regclass('public.compounds') is not null then
    execute 'select count(*) from public.compounds' into compounds_rows;
  end if;

  raise notice 'Preflight: peptides_exists=%, peptides_rows=%, compounds_rows=%', peptides_exists, peptides_rows, compounds_rows;
end $$;

-- Step 2: Backup legacy table (idempotent per run via timestamped backup table name)
do $$
declare
  backup_table text;
begin
  if to_regclass('public.peptides') is null then
    raise notice 'Skipping backup: public.peptides does not exist.';
    return;
  end if;

  backup_table := format('peptides_legacy_backup_%s', to_char(clock_timestamp(), 'YYYYMMDD_HH24MISS'));

  execute format('create table public.%I (like public.peptides including all)', backup_table);
  execute format('insert into public.%I select * from public.peptides', backup_table);
  execute format(
    'comment on table public.%I is %L',
    backup_table,
    format(
      'Legacy backup of public.peptides created by sql/maintenance/cleanup-legacy-peptides.sql at %s',
      to_char(clock_timestamp(), 'YYYY-MM-DD HH24:MI:SS TZ')
    )
  );

  raise notice 'Created backup table: public.%', backup_table;
end $$;

-- Step 3: Dependency checks (must be empty/zero before drop)
-- Foreign keys pointing to public.peptides
select
  conname as fk_name,
  conrelid::regclass as referencing_table
from pg_constraint
where contype = 'f'
  and confrelid = to_regclass('public.peptides');

-- Views/materialized views depending on public.peptides
select distinct
  n.nspname as view_schema,
  c.relname as view_name,
  c.relkind as view_type
from pg_depend d
join pg_rewrite r on r.oid = d.objid
join pg_class c on c.oid = r.ev_class
join pg_namespace n on n.oid = c.relnamespace
where d.classid = 'pg_rewrite'::regclass
  and d.refobjid = to_regclass('public.peptides')
  and c.relkind in ('v', 'm')
order by 1, 2;

-- SQL objects/functions with explicit dependency metadata
select
  n.nspname as function_schema,
  p.proname as function_name,
  p.oid::regprocedure as signature
from pg_depend d
join pg_proc p on p.oid = d.objid
join pg_namespace n on n.oid = p.pronamespace
where d.classid = 'pg_proc'::regclass
  and d.refobjid = to_regclass('public.peptides')
order by 1, 2;

-- Step 4: Guarded drop (explicit opt-in)
do $$
declare
  perform_drop boolean := false; -- flip to true only after review
  fk_count integer := 0;
  view_count integer := 0;
  function_count integer := 0;
begin
  if to_regclass('public.peptides') is null then
    raise notice 'Drop skipped: public.peptides does not exist.';
    return;
  end if;

  select count(*) into fk_count
  from pg_constraint
  where contype = 'f'
    and confrelid = to_regclass('public.peptides');

  select count(distinct c.oid) into view_count
  from pg_depend d
  join pg_rewrite r on r.oid = d.objid
  join pg_class c on c.oid = r.ev_class
  where d.classid = 'pg_rewrite'::regclass
    and d.refobjid = to_regclass('public.peptides')
    and c.relkind in ('v', 'm');

  select count(distinct p.oid) into function_count
  from pg_depend d
  join pg_proc p on p.oid = d.objid
  where d.classid = 'pg_proc'::regclass
    and d.refobjid = to_regclass('public.peptides');

  if fk_count > 0 or view_count > 0 or function_count > 0 then
    raise exception
      'Drop blocked: dependencies found (fk=% view=% function=%). Resolve dependencies first.',
      fk_count, view_count, function_count;
  end if;

  if not perform_drop then
    raise notice 'Dry run only. Set perform_drop=true in Step 4 to drop public.peptides.';
    return;
  end if;

  execute 'drop table public.peptides';
  raise notice 'Dropped table public.peptides.';
end $$;

-- Step 5: Post-check
select to_regclass('public.peptides') as peptides_table_after_cleanup;
