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
  ('NexGen Peptides', 'nexgen-peptides', 'https://nexgenpeptides.shop/'),
  ('Peptidology', 'peptidology', 'https://peptidology.co/'),
  ('Eternal Peptides', 'eternal-peptides', 'https://eternalpeptides.com/'),
  ('Pure Tested Peptides', 'pure-tested-peptides', 'https://www.puretestedpeptides.com/'),
  ('Verified Peptides', 'verified-peptides', 'https://verifiedpeptides.com/'),
  ('Planet Peptide', 'planet-peptide', 'https://planetpeptide.com/'),
  ('Simple Peptide', 'simple-peptide', 'https://simplepeptide.com/'),
  ('Bulk Peptide Supply', 'bulk-peptide-supply', 'https://bulkpeptidesupply.com/'),
  ('Coastal Peptides', 'coastal-peptides', 'https://coastalpeptides.com/'),
  ('My Oasis Labs', 'my-oasis-labs', 'https://myoasislabs.com/'),
  ('PeptiLab Research', 'peptilab-research', 'https://peptilabresearch.com/'),
  ('Evolve BioPep', 'evolve-biopep', 'https://evolvebiopep.com/'),
  ('Pura Peptides', 'pura-peptides', 'https://purapeptides.com/'),
  ('NuScience Peptides', 'nuscience-peptides', 'https://nusciencepeptides.com/'),
  ('Peptides 4 Research', 'peptides-4-research', 'https://peptides4research.com/'),
  ('Atomik Labz', 'atomik-labz', 'https://atomiklabz.com/'),
  ('PeptiAtlas', 'pepti-atlas', 'https://peptiatlas.com/'),
  ('PureRawz', 'pure-rawz', 'https://purerawz.co/'),
  ('Peptide Crafters', 'peptide-crafters', 'https://peptidecrafters.com/'),
  ('BioLongevity Labs', 'biolongevity-labs', 'https://biolongevitylabs.com/'),
  ('Loti Labs', 'loti-labs', 'https://lotilabs.com/'),
  ('Nexaph', 'nexaph', 'https://nexaph.com/'),
  ('Eros Peptides', 'eros-peptides', 'https://erospeptides.com/'),
  ('BioPepz', 'biopepz', 'https://www.biopepz.net/'),
  ('PurePeps', 'purepeps', 'https://purepeps.com/'),
  ('HK Roids', 'hk-roids', 'https://hkroids.com/'),
  ('Reta Peptide', 'reta-peptide', 'https://reta-peptide.com/'),
  ('Swiss Chems', 'swiss-chems', 'https://swisschems.is/'),
  ('The Peptide Haven', 'the-peptide-haven', 'https://thepeptidehaven.com/'),
  ('Injectify US', 'injectify-us', 'https://us.injectify.is/'),
  ('Pure Peptide Labs', 'pure-peptide-labs', 'https://purepeptidelabs.shop/'),
  ('Alpha G Research', 'alpha-g-research', 'https://www.alphagresearch.com/'),
  ('Kits4Less', 'kits4less', 'https://kits4less.com/'),
  ('Top Peptides', 'top-peptides', 'https://www.toppeptides.com/'),
  ('Dragon Pharma Store', 'dragon-pharma-store', 'https://dragonpharmastore.com/'),
  ('Precision Peptide Co', 'precision-peptide-co', 'https://precisionpeptideco.com/'),
  ('Amino Asylum', 'amino-asylum', 'https://aminoasylumllc.com/'),
  ('Elite Peptides', 'elite-peptides', 'https://elitepeptides.com/'),
  ('Peptides World', 'peptides-world', 'https://peptidesworld.com/'),
  ('Amplify Peptides', 'amplify-peptides', 'https://amplifypeptides.com/'),
  ('Peptide Supply Co', 'peptide-supply-co', 'https://peptidesupplyco.org/'),
  ('Trusted Peptide', 'trusted-peptide', 'https://trustedpeptide.net/'),
  ('Crush Research', 'crush-research', 'https://crushresearch.com/')
on conflict (slug) do update
set
  name = excluded.name,
  website_url = excluded.website_url,
  updated_at = now();

with desired_vendor_pages as (
  select * from (
    values
      ('elite-research-usa', 'http://eliteresearchusa.com/', 'catalog'),
      ('elite-research-usa', 'https://eliteresearchusa.com/products', 'catalog'),
      ('peptide-labs-x', 'https://peptidelabsx.com/', 'catalog'),
      ('peptide-labs-x', 'https://peptidelabsx.com/product-category/products-all/', 'catalog'),
      ('peptide-labs-x', 'https://peptidelabsx.com/shop/', 'catalog'),
      ('nexgen-peptides', 'https://nexgenpeptides.shop/', 'catalog'),
      ('nexgen-peptides', 'https://nexgenpeptides.shop/shop/', 'catalog'),
      ('nexgen-peptides', 'https://nexgenpeptides.shop/product-category/us-finished/', 'catalog'),
      ('nexgen-peptides', 'https://nexgenpeptides.shop/product-category/foundation/', 'catalog'),
      ('nexgen-peptides', 'https://nexgenpeptides.shop/product-category/longevity/', 'catalog'),
      ('nexgen-peptides', 'https://nexgenpeptides.shop/product-category/strength/', 'catalog'),
      ('peptidology', 'https://peptidology.co/', 'catalog'),
      ('eternal-peptides', 'https://eternalpeptides.com/', 'catalog'),
      ('pure-tested-peptides', 'https://www.puretestedpeptides.com/', 'catalog'),
      ('verified-peptides', 'https://verifiedpeptides.com/', 'catalog'),
      ('planet-peptide', 'https://planetpeptide.com/', 'catalog'),
      ('simple-peptide', 'https://simplepeptide.com/', 'catalog'),
      ('bulk-peptide-supply', 'https://bulkpeptidesupply.com/', 'catalog'),
      ('coastal-peptides', 'https://coastalpeptides.com/', 'catalog'),
      ('my-oasis-labs', 'https://myoasislabs.com/', 'catalog'),
      ('peptilab-research', 'https://peptilabresearch.com/', 'catalog'),
      ('evolve-biopep', 'https://evolvebiopep.com/', 'catalog'),
      ('pura-peptides', 'https://purapeptides.com/', 'catalog'),
      ('nuscience-peptides', 'https://nusciencepeptides.com/', 'catalog'),
      ('peptides-4-research', 'https://peptides4research.com/', 'catalog'),
      ('atomik-labz', 'https://atomiklabz.com/', 'catalog'),
      ('pepti-atlas', 'https://peptiatlas.com/', 'catalog'),
      ('pure-rawz', 'https://purerawz.co/', 'catalog'),
      ('peptide-crafters', 'https://peptidecrafters.com/', 'catalog'),
      ('biolongevity-labs', 'https://biolongevitylabs.com/', 'catalog'),
      ('loti-labs', 'https://lotilabs.com/', 'catalog'),
      ('nexaph', 'https://nexaph.com/', 'catalog'),
      ('eros-peptides', 'https://erospeptides.com/', 'catalog'),
      ('biopepz', 'https://www.biopepz.net/', 'catalog'),
      ('purepeps', 'https://purepeps.com/', 'catalog'),
      ('hk-roids', 'https://hkroids.com/', 'catalog'),
      ('reta-peptide', 'https://reta-peptide.com/', 'catalog'),
      ('swiss-chems', 'https://swisschems.is/', 'catalog'),
      ('the-peptide-haven', 'https://thepeptidehaven.com/', 'catalog'),
      ('injectify-us', 'https://us.injectify.is/', 'catalog'),
      ('pure-peptide-labs', 'https://purepeptidelabs.shop/', 'catalog'),
      ('alpha-g-research', 'https://www.alphagresearch.com/shop-1', 'catalog'),
      ('kits4less', 'https://kits4less.com/', 'catalog'),
      ('top-peptides', 'https://www.toppeptides.com/', 'catalog'),
      ('dragon-pharma-store', 'https://dragonpharmastore.com/64-peptides', 'catalog'),
      ('precision-peptide-co', 'https://precisionpeptideco.com/', 'catalog'),
      ('amino-asylum', 'https://aminoasylumllc.com/', 'catalog'),
      ('elite-peptides', 'https://elitepeptides.com/', 'catalog'),
      ('peptides-world', 'https://peptidesworld.com/', 'catalog'),
      ('amplify-peptides', 'https://amplifypeptides.com/', 'catalog'),
      ('peptide-supply-co', 'https://peptidesupplyco.org/', 'catalog'),
      ('trusted-peptide', 'https://trustedpeptide.net/', 'catalog'),
      ('crush-research', 'https://crushresearch.com/', 'catalog')
  ) as t(vendor_slug, url, page_type)
)
insert into vendor_pages (vendor_id, url, page_type)
select v.id, dvp.url, dvp.page_type
from desired_vendor_pages dvp
inner join vendors v on v.slug = dvp.vendor_slug
on conflict (vendor_id, url) do update
set
  page_type = excluded.page_type,
  updated_at = now();

update vendor_pages vp
set is_active = false,
    updated_at = now()
from vendors v
where vp.vendor_id = v.id
  and (
    (v.slug = 'alpha-g-research' and vp.url = 'https://www.alphagresearch.com/') or
    (v.slug = 'dragon-pharma-store' and vp.url = 'https://dragonpharmastore.com/')
  );

-- Seed compounds used by initial alias rules and UI bootstrapping.
insert into compounds (name, slug, description)
values
  ('BPC-157', 'bpc-157', 'Body protection compound peptide listings across formulations.'),
  ('Semaglutide', 'semaglutide', 'GLP-1 agonist peptide listings, including shorthand aliases like GLP1-S.'),
  ('Cagrilintide', 'cagrilintide', 'Amylin analog peptide listings and shorthand aliases like CAG.'),
  ('CagriSema', 'cagrisema', 'Cagrilintide and semaglutide combination listings.'),
  ('LL-37', 'll-37', 'Host-defense peptide listings including vendor variants labeled as LL-37 Complex.'),
  ('Tirzepatide', 'tirzepatide', 'Dual GIP/GLP-1 agonist peptide listings including shorthand aliases like tirz and GLP-1 TZ.'),
  ('Retatrutide', 'retatrutide', 'GLP-related investigational peptide listings.'),
  ('CJC-1295', 'cjc-1295', 'Growth-hormone-related peptide listings.'),
  ('Ipamorelin', 'ipamorelin', 'Peptide listings normalized by formulation.'),
  ('Tesamorelin', 'tesamorelin', 'Peptide listings normalized by formulation.'),
  ('Thymalin', 'thymalin', 'Thymic peptide bioregulator listings.'),
  ('Mazdutide', 'mazdutide', 'GLP-related investigational peptide listings.'),
  ('Survodutide', 'survodutide', 'GLP-related investigational peptide listings.'),
  ('Cardiogen', 'cardiogen', 'Peptide bioregulator listings.'),
  ('Cartalax', 'cartalax', 'Peptide bioregulator listings.'),
  ('Cortagen', 'cortagen', 'Peptide bioregulator listings.'),
  ('Vesugen', 'vesugen', 'Peptide bioregulator listings.'),
  ('Vilon', 'vilon', 'Peptide bioregulator listings.'),
  ('Pinealon', 'pinealon', 'Peptide bioregulator listings.'),
  ('Fragment 176-191', 'fragment-176-191', 'HGH fragment peptide listings.'),
  ('VIP', 'vip', 'Vasoactive intestinal peptide listings.'),
  ('PNC-27', 'pnc-27', 'Peptide listings normalized by formulation.'),
  ('CMAX', 'cmax', 'Peptide listings normalized by formulation.'),
  ('KISP', 'kisp', 'Kisspeptin-family peptide listings.'),
  ('GHR-2', 'ghr-2', 'Growth-hormone-related peptide listings.'),
  ('GHR-6', 'ghr-6', 'Growth-hormone-related peptide listings.'),
  ('Chonluten', 'chonluten', 'Peptide bioregulator listings.'),
  ('Ovagen', 'ovagen', 'Peptide bioregulator listings.'),
  ('Prostamax', 'prostamax', 'Peptide bioregulator listings.'),
  ('Testagen', 'testagen', 'Peptide bioregulator listings.'),
  ('ARA-290', 'ara-290', 'Erythropoietin-derived peptide listings.'),
  ('Argireline', 'argireline', 'Acetyl hexapeptide cosmetic peptide listings.'),
  ('Pal Tetrapeptide-7', 'pal-tetrapeptide-7', 'Matrixyl peptide listings.'),
  ('SMT10', 'smt10', 'Somatotropin-family peptide listings.'),
  ('Copper Glow', 'copper-glow', 'Copper-related peptide blend listings.')
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
