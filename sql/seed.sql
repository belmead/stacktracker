-- Smart placeholder copy for MVP boot
insert into app_settings (id, key_headline, key_subhead)
values (
  1,
  'Peptide price intelligence, normalized.',
  'Stack Tracker monitors peptide-adjacent vendor pricing and standardizes units so you can compare offers on equal footing.'
)
on conflict (id) do update
set
  key_headline = excluded.key_headline,
  key_subhead = excluded.key_subhead,
  updated_at = now();

insert into vendors (name, slug, website_url)
values
  ('Elite Research USA', 'elite-research-usa', 'http://eliteresearchusa.com/'),
  ('Peptide Labs X', 'peptide-labs-x', 'https://peptidelabsx.com/'),
  ('NexGen Peptides', 'nexgen-peptides', 'https://nexgenpeptides.shop/')
on conflict (slug) do update
set
  name = excluded.name,
  website_url = excluded.website_url,
  updated_at = now();

insert into vendor_pages (vendor_id, url, page_type)
select v.id, v.website_url, 'catalog'
from vendors v
where v.slug in ('elite-research-usa', 'peptide-labs-x', 'nexgen-peptides')
on conflict (vendor_id, url) do update
set
  page_type = excluded.page_type,
  updated_at = now();

-- Seed compounds used by initial alias rules and UI bootstrapping.
insert into compounds (name, slug, description)
values
  ('BPC-157', 'bpc-157', 'Body protection compound peptide listings across formulations.'),
  ('Retatrutide', 'retatrutide', 'GLP-related investigational peptide listings.'),
  ('CJC-1295', 'cjc-1295', 'Growth-hormone-related peptide listings.'),
  ('Ipamorelin', 'ipamorelin', 'Peptide listings normalized by formulation.'),
  ('Tesamorelin', 'tesamorelin', 'Peptide listings normalized by formulation.')
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  updated_at = now();

insert into featured_compounds (compound_id, display_order, source, is_pinned)
select id, row_number() over (order by name asc), 'auto', false
from compounds
where slug in ('bpc-157', 'retatrutide', 'cjc-1295', 'ipamorelin', 'tesamorelin')
on conflict (compound_id) do update
set
  display_order = excluded.display_order,
  source = excluded.source,
  is_pinned = excluded.is_pinned,
  updated_at = now();
