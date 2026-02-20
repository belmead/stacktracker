create extension if not exists pgcrypto;

create table if not exists vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  website_url text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists vendor_pages (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id) on delete cascade,
  url text not null,
  page_type text not null default 'catalog' check (page_type in ('catalog', 'product', 'search', 'custom')),
  is_active boolean not null default true,
  allow_aggressive boolean not null default true,
  last_scraped_at timestamptz,
  last_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, url)
);

create table if not exists compounds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists compound_aliases (
  id uuid primary key default gen_random_uuid(),
  compound_id uuid references compounds(id) on delete set null,
  alias text not null,
  alias_normalized text not null unique,
  source text not null default 'scraped' check (source in ('scraped', 'rules', 'admin', 'import')),
  confidence numeric(5,4) not null default 0,
  status text not null default 'needs_review' check (status in ('auto_matched', 'needs_review', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists formulations (
  code text primary key,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists compound_variants (
  id uuid primary key default gen_random_uuid(),
  compound_id uuid not null references compounds(id) on delete cascade,
  formulation_code text not null references formulations(code),
  display_size_label text not null,
  strength_value numeric(12,4),
  strength_unit text,
  package_quantity numeric(12,4),
  package_unit text,
  total_mass_mg numeric(14,4),
  total_volume_ml numeric(14,4),
  total_count_units numeric(14,4),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (compound_id, formulation_code, display_size_label)
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists compound_category_map (
  id uuid primary key default gen_random_uuid(),
  compound_id uuid not null references compounds(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (compound_id, category_id)
);

create table if not exists featured_compounds (
  compound_id uuid primary key references compounds(id) on delete cascade,
  display_order integer not null check (display_order between 1 and 5),
  source text not null default 'auto' check (source in ('auto', 'manual')),
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (display_order)
);

create table if not exists scrape_runs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null check (job_type in ('vendor', 'finnrick')),
  run_mode text not null check (run_mode in ('scheduled', 'manual')),
  scrape_mode text not null check (scrape_mode in ('safe', 'aggressive_manual')),
  status text not null check (status in ('running', 'success', 'partial', 'failed')),
  started_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  finished_at timestamptz,
  triggered_by text,
  summary jsonb not null default '{}'::jsonb
);

alter table if exists scrape_runs
  add column if not exists heartbeat_at timestamptz not null default now();

create table if not exists scrape_events (
  id uuid primary key default gen_random_uuid(),
  scrape_run_id uuid not null references scrape_runs(id) on delete cascade,
  vendor_id uuid references vendors(id) on delete set null,
  severity text not null check (severity in ('info', 'warn', 'error')),
  code text not null,
  message text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists offers_current (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id) on delete cascade,
  variant_id uuid not null references compound_variants(id) on delete cascade,
  product_url text not null,
  product_name text not null,
  currency_code text not null default 'USD',
  list_price_cents integer not null check (list_price_cents >= 0),
  price_per_mg_cents numeric(14,4),
  price_per_ml_cents numeric(14,4),
  price_per_vial_cents numeric(14,4),
  price_per_unit_cents numeric(14,4),
  is_available boolean not null default true,
  last_scraped_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, variant_id, product_url)
);

create table if not exists offer_history (
  id uuid primary key default gen_random_uuid(),
  offer_current_id uuid not null references offers_current(id) on delete cascade,
  scrape_run_id uuid references scrape_runs(id) on delete set null,
  vendor_id uuid not null references vendors(id) on delete cascade,
  variant_id uuid not null references compound_variants(id) on delete cascade,
  product_url text not null,
  currency_code text not null default 'USD',
  list_price_cents integer not null check (list_price_cents >= 0),
  price_per_mg_cents numeric(14,4),
  price_per_ml_cents numeric(14,4),
  price_per_vial_cents numeric(14,4),
  price_per_unit_cents numeric(14,4),
  is_available boolean not null default true,
  effective_from timestamptz not null,
  effective_to timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists finnrick_ratings (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id) on delete cascade,
  rating numeric(4,2),
  rating_label text,
  rated_at timestamptz not null,
  source_url text not null,
  created_at timestamptz not null default now()
);

create table if not exists finnrick_rating_history (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id) on delete cascade,
  rating numeric(4,2),
  rating_label text,
  captured_at timestamptz not null,
  scrape_run_id uuid references scrape_runs(id) on delete set null,
  source_url text not null,
  created_at timestamptz not null default now()
);

create table if not exists review_queue (
  id uuid primary key default gen_random_uuid(),
  queue_type text not null check (queue_type in ('alias_match', 'scrape_blocked', 'parse_failure', 'policy_block', 'other')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'ignored')),
  vendor_id uuid references vendors(id) on delete set null,
  page_url text,
  raw_text text,
  suggested_compound_id uuid references compounds(id) on delete set null,
  confidence numeric(5,4),
  payload jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists scrape_requests (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id) on delete cascade,
  requested_by text not null,
  scrape_mode text not null check (scrape_mode in ('safe', 'aggressive_manual')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  failure_message text,
  linked_scrape_run_id uuid references scrape_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ai_agent_tasks (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references vendors(id) on delete set null,
  page_url text not null,
  reason text not null,
  scrape_run_id uuid references scrape_runs(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  attempt_count integer not null default 0,
  requested_by text,
  output_payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists admin_magic_links (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  requested_ip text,
  requested_user_agent text,
  consumed_ip text,
  consumed_user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists admin_sessions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  session_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_ip text,
  created_user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_email text not null,
  action text not null,
  target_type text not null,
  target_id text,
  before_payload jsonb not null default '{}'::jsonb,
  after_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists app_settings (
  id integer primary key check (id = 1),
  key_headline text not null,
  key_subhead text not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_vendor_pages_vendor_id on vendor_pages(vendor_id);
create index if not exists idx_compound_aliases_compound_id on compound_aliases(compound_id);
create index if not exists idx_compound_variants_compound_id on compound_variants(compound_id);
create index if not exists idx_compound_variants_formulation on compound_variants(formulation_code);
create index if not exists idx_offers_current_variant on offers_current(variant_id);
create index if not exists idx_offers_current_vendor on offers_current(vendor_id);
create index if not exists idx_offers_current_variant_price_mg on offers_current(variant_id, price_per_mg_cents);
create index if not exists idx_offer_history_variant_effective on offer_history(variant_id, effective_from);
create index if not exists idx_review_queue_status on review_queue(status, created_at);
create index if not exists idx_scrape_runs_job_type_started on scrape_runs(job_type, started_at desc);
create index if not exists idx_scrape_runs_status_heartbeat on scrape_runs(status, heartbeat_at asc);
create index if not exists idx_scrape_events_run on scrape_events(scrape_run_id);
create index if not exists idx_scrape_requests_status on scrape_requests(status, created_at);
create index if not exists idx_ai_agent_tasks_status on ai_agent_tasks(status, created_at);
create unique index if not exists compound_category_map_one_primary_per_compound
  on compound_category_map(compound_id)
  where is_primary = true;

insert into formulations (code, display_name)
values
  ('vial', 'Vial'),
  ('injectable', 'Injectable'),
  ('cream', 'Cream'),
  ('troche', 'Troche'),
  ('spray', 'Spray'),
  ('capsule', 'Capsule'),
  ('tablet', 'Tablet'),
  ('solution', 'Solution'),
  ('gel', 'Gel'),
  ('other', 'Other')
on conflict (code) do nothing;
