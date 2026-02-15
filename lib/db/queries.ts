import { sql } from "@/lib/db/client";
import type { JSONValue } from "postgres";
import type {
  HomeCard,
  HomePayload,
  JobRunMode,
  JobType,
  MetricPriceMap,
  MetricType,
  ReviewQueueStatus,
  ReviewQueueType,
  ScrapeMode,
  ScrapeStatus,
  TrendPoint,
  TrendRange
} from "@/lib/types";

const toJson = (value: unknown) => sql.json(value as JSONValue);
let scrapeRunsHeartbeatReady: Promise<void> | null = null;

async function ensureScrapeRunsHeartbeatColumn(): Promise<void> {
  if (!scrapeRunsHeartbeatReady) {
    scrapeRunsHeartbeatReady = (async () => {
      const rows = await sql<{ exists: boolean }[]>`
        select exists (
          select 1
          from information_schema.columns
          where
            table_schema = 'public'
            and table_name = 'scrape_runs'
            and column_name = 'heartbeat_at'
        )
      `;

      if (rows[0]?.exists) {
        return;
      }

      await sql`
        alter table if exists scrape_runs
        add column heartbeat_at timestamptz not null default now()
      `;
    })();
  }

  await scrapeRunsHeartbeatReady;
}

const HOME_IMAGE_PLACEHOLDER = "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?auto=format&fit=crop&w=1400&q=80";

function metricColumn(metric: MetricType): string {
  switch (metric) {
    case "price_per_mg":
      return "price_per_mg_cents";
    case "price_per_ml":
      return "price_per_ml_cents";
    case "price_per_vial":
      return "price_per_vial_cents";
    case "price_per_unit":
      return "price_per_unit_cents";
    default:
      return "price_per_mg_cents";
  }
}

function trendWindow(range: TrendRange): string {
  switch (range) {
    case "1w":
      return "7 days";
    case "1m":
      return "1 month";
    case "6m":
      return "6 months";
    case "1y":
      return "1 year";
    default:
      return "1 month";
  }
}

export interface CompoundSelectorOption {
  id: string;
  slug: string;
  name: string;
  categorySlug: string | null;
  categoryName: string | null;
}

export async function getCompoundSelectorOptions(): Promise<CompoundSelectorOption[]> {
  return sql<CompoundSelectorOption[]>`
    select
      c.id,
      c.slug,
      c.name,
      cat.slug as category_slug,
      cat.name as category_name
    from compounds c
    left join compound_category_map ccm on ccm.compound_id = c.id and ccm.is_primary = true
    left join categories cat on cat.id = ccm.category_id
    where
      c.is_active = true
      and exists (
        select 1
        from compound_variants cv
        where cv.compound_id = c.id and cv.is_active = true
      )
    order by c.name asc
  `;
}

export interface CategorySummary {
  id: string;
  slug: string;
  name: string;
  compoundCount: number;
}

export async function getCategorySummaries(): Promise<CategorySummary[]> {
  return sql<CategorySummary[]>`
    select
      cat.id,
      cat.slug,
      cat.name,
      count(distinct c.id)::int as compound_count
    from categories cat
    left join compound_category_map ccm on ccm.category_id = cat.id
    left join compounds c on c.id = ccm.compound_id
      and c.is_active = true
      and exists (
        select 1
        from compound_variants cv
        where cv.compound_id = c.id and cv.is_active = true
      )
    group by cat.id, cat.slug, cat.name
    having count(distinct c.id) > 0
    order by cat.name asc
  `;
}

export async function getCategoryBySlug(slug: string): Promise<CategorySummary | null> {
  const rows = await sql<CategorySummary[]>`
    select
      cat.id,
      cat.slug,
      cat.name,
      count(distinct c.id)::int as compound_count
    from categories cat
    left join compound_category_map ccm on ccm.category_id = cat.id
    left join compounds c on c.id = ccm.compound_id
      and c.is_active = true
      and exists (
        select 1
        from compound_variants cv
        where cv.compound_id = c.id and cv.is_active = true
      )
    where cat.slug = ${slug}
    group by cat.id, cat.slug, cat.name
    limit 1
  `;

  return rows[0] ?? null;
}

export interface CategoryCompound {
  id: string;
  slug: string;
  name: string;
  description: string | null;
}

export async function getCompoundsForCategorySlug(slug: string): Promise<CategoryCompound[]> {
  return sql<CategoryCompound[]>`
    select
      c.id,
      c.slug,
      c.name,
      c.description
    from compounds c
    inner join compound_category_map ccm on ccm.compound_id = c.id
    inner join categories cat on cat.id = ccm.category_id
    where
      cat.slug = ${slug}
      and c.is_active = true
      and exists (
        select 1
        from compound_variants cv
        where cv.compound_id = c.id and cv.is_active = true
      )
    group by c.id, c.slug, c.name, c.description
    order by c.name asc
  `;
}

export async function getHomePayload(metric: MetricType = "price_per_mg"): Promise<HomePayload> {
  const metricCol = metricColumn(metric);

  const heroRows = await sql<
    {
      headline: string;
      subhead: string;
    }[]
  >`
    select key_headline as headline, key_subhead as subhead
    from app_settings
    where id = 1
    limit 1
  `;

  const featured = await sql<
    {
      compoundId: string;
      slug: string;
      name: string;
      categoryName: string | null;
      displayOrder: number;
    }[]
  >`
    select
      fc.compound_id,
      c.slug,
      c.name,
      cat.name as category_name,
      fc.display_order
    from featured_compounds fc
    inner join compounds c on c.id = fc.compound_id
    left join compound_category_map ccm on ccm.compound_id = c.id and ccm.is_primary = true
    left join categories cat on cat.id = ccm.category_id
    order by fc.display_order asc
    limit 5
  `;

  const cards: HomeCard[] = [];

  for (const row of featured) {
    const bestVariant = await sql<
      {
        variantId: string;
      }[]
    >`
      select cv.id as variant_id
      from compound_variants cv
      left join offers_current oc on oc.variant_id = cv.id and oc.is_available = true
      where cv.compound_id = ${row.compoundId}
      group by cv.id
      order by
        case when cv.formulation_code = 'vial' then 0 else 1 end,
        count(distinct oc.vendor_id) desc,
        cv.created_at asc
      limit 1
    `;

    if (!bestVariant[0]) {
      continue;
    }

    const variantId = bestVariant[0].variantId;

    const metricUnsafe = sql.unsafe(metricCol);
    const vendorRows = await sql<
      {
        vendorId: string;
        vendorName: string;
        vendorUrl: string;
        metricPrice: number | null;
        finnrickRating: number | null;
      }[]
    >`
      with ranked as (
        select
          v.id as vendor_id,
          v.name as vendor_name,
          coalesce(oc.product_url, v.website_url) as vendor_url,
          ${metricUnsafe}::float8 as metric_price,
          fr.rating::float8 as finnrick_rating,
          row_number() over (
            partition by v.id
            order by ${metricUnsafe} asc nulls last, oc.last_seen_at desc, oc.id asc
          ) as vendor_rank
        from offers_current oc
        inner join vendors v on v.id = oc.vendor_id
        left join lateral (
          select rating
          from finnrick_ratings fr
          where fr.vendor_id = v.id
          order by fr.rated_at desc
          limit 1
        ) fr on true
        where oc.variant_id = ${variantId} and oc.is_available = true
      )
      select vendor_id, vendor_name, vendor_url, metric_price, finnrick_rating
      from ranked
      where vendor_rank = 1
      order by metric_price asc nulls last, vendor_name asc
      limit 5
    `;

    const heroMetric = vendorRows.find((vendor) => vendor.metricPrice !== null)?.metricPrice ?? null;

    cards.push({
      compoundSlug: row.slug,
      compoundName: row.name,
      categoryName: row.categoryName,
      heroMetricType: metric,
      heroMetricPrice: heroMetric,
      imageUrl: HOME_IMAGE_PLACEHOLDER,
      rows: vendorRows.map((vendor) => ({
        vendorId: vendor.vendorId,
        vendorName: vendor.vendorName,
        vendorUrl: vendor.vendorUrl,
        metricPrice: vendor.metricPrice,
        metricType: metric,
        finnrickRating: vendor.finnrickRating
      }))
    });
  }

  return {
    heroHeadline: heroRows[0]?.headline ?? "Track peptide pricing with confidence.",
    heroSubhead:
      heroRows[0]?.subhead ??
      "Stack Tracker aggregates vendor pricing, normalizes formulation differences, and surfaces apples-to-apples unit comparisons.",
    cards
  };
}

export interface CompoundDetails {
  id: string;
  slug: string;
  name: string;
  description: string | null;
}

export async function getCompoundBySlug(slug: string): Promise<CompoundDetails | null> {
  const rows = await sql<CompoundDetails[]>`
    select id, slug, name, description
    from compounds
    where slug = ${slug} and is_active = true
    limit 1
  `;

  return rows[0] ?? null;
}

export interface CompoundCoverageStats {
  vendorCount: number;
  variationCount: number;
}

export async function getCompoundCoverageStats(compoundId: string): Promise<CompoundCoverageStats> {
  const rows = await sql<CompoundCoverageStats[]>`
    select
      count(distinct oc.vendor_id)::int as vendor_count,
      count(distinct oc.variant_id)::int as variation_count
    from offers_current oc
    inner join compound_variants cv on cv.id = oc.variant_id
    where
      cv.compound_id = ${compoundId}
      and cv.is_active = true
      and oc.is_available = true
  `;

  return rows[0] ?? { vendorCount: 0, variationCount: 0 };
}

export interface VariantFilterOption {
  variantId: string;
  formulationCode: string;
  formulationLabel: string;
  sizeLabel: string;
  vendorCoverage: number;
}

export async function getVariantFilters(compoundId: string): Promise<VariantFilterOption[]> {
  return sql<VariantFilterOption[]>`
    select
      cv.id as variant_id,
      cv.formulation_code,
      f.display_name as formulation_label,
      cv.display_size_label as size_label,
      count(distinct oc.vendor_id)::int as vendor_coverage
    from compound_variants cv
    inner join formulations f on f.code = cv.formulation_code
    left join offers_current oc on oc.variant_id = cv.id and oc.is_available = true
    where cv.compound_id = ${compoundId}
    group by cv.id, f.display_name
    having count(distinct oc.vendor_id) > 0
    order by
      case when cv.formulation_code = 'vial' then 0 else 1 end,
      count(distinct oc.vendor_id) desc,
      cv.display_size_label asc
  `;
}

export async function getDefaultVariantId(compoundId: string): Promise<string | null> {
  const rows = await sql<
    {
      variantId: string;
    }[]
  >`
    select cv.id as variant_id
    from compound_variants cv
    left join offers_current oc on oc.variant_id = cv.id and oc.is_available = true
    where cv.compound_id = ${compoundId}
    group by cv.id
    order by
      case when cv.formulation_code = 'vial' then 0 else 1 end,
      count(distinct oc.vendor_id) desc,
      cv.created_at asc
    limit 1
  `;

  return rows[0]?.variantId ?? null;
}

export interface VariantDetails {
  id: string;
  compoundId: string;
  formulationCode: string;
  formulationLabel: string;
  sizeLabel: string;
}

export async function getVariantById(variantId: string): Promise<VariantDetails | null> {
  const rows = await sql<VariantDetails[]>`
    select
      cv.id,
      cv.compound_id,
      cv.formulation_code,
      f.display_name as formulation_label,
      cv.display_size_label as size_label
    from compound_variants cv
    inner join formulations f on f.code = cv.formulation_code
    where cv.id = ${variantId}
    limit 1
  `;

  return rows[0] ?? null;
}

export async function getVariantByFilter(input: {
  compoundId: string;
  formulationCode?: string | null;
  sizeLabel?: string | null;
}): Promise<VariantDetails | null> {
  const rows = await sql<VariantDetails[]>`
    select
      cv.id,
      cv.compound_id,
      cv.formulation_code,
      f.display_name as formulation_label,
      cv.display_size_label as size_label
    from compound_variants cv
    inner join formulations f on f.code = cv.formulation_code
    where
      cv.compound_id = ${input.compoundId}
      and (${input.formulationCode ?? null}::text is null or cv.formulation_code = ${input.formulationCode ?? null})
      and (${input.sizeLabel ?? null}::text is null or cv.display_size_label = ${input.sizeLabel ?? null})
    order by
      case when cv.formulation_code = 'vial' then 0 else 1 end,
      cv.created_at asc
    limit 1
  `;

  return rows[0] ?? null;
}

export interface OfferRow {
  vendorId: string;
  vendorSlug: string;
  vendorName: string;
  vendorUrl: string;
  metricPrice: number | null;
  metricValues: MetricPriceMap;
  finnrickRating: number | null;
  lastSeenAt: string;
}

export interface OfferPage {
  rows: OfferRow[];
  total: number;
  page: number;
  pageSize: number;
}

export async function getOffersForVariant(input: {
  variantId: string;
  metric: MetricType;
  page: number;
  pageSize: number;
}): Promise<OfferPage> {
  const metricCol = metricColumn(input.metric);
  const metricUnsafe = sql.unsafe(metricCol);
  const offset = (input.page - 1) * input.pageSize;

  const totalRows = await sql<
    {
      count: number;
    }[]
  >`
    select count(distinct vendor_id)::int as count
    from offers_current
    where variant_id = ${input.variantId} and is_available = true
  `;

  const rows = await sql<
    {
      vendorId: string;
      vendorSlug: string;
      vendorName: string;
      vendorUrl: string;
      metricPrice: number | null;
      pricePerMgCents: number | null;
      pricePerMlCents: number | null;
      pricePerVialCents: number | null;
      pricePerUnitCents: number | null;
      finnrickRating: number | null;
      lastSeenAt: string;
    }[]
  >`
    with ranked as (
      select
        v.id as vendor_id,
        v.slug as vendor_slug,
        v.name as vendor_name,
        coalesce(oc.product_url, v.website_url) as vendor_url,
        ${metricUnsafe}::float8 as metric_price,
        oc.price_per_mg_cents::float8 as price_per_mg_cents,
        oc.price_per_ml_cents::float8 as price_per_ml_cents,
        oc.price_per_vial_cents::float8 as price_per_vial_cents,
        oc.price_per_unit_cents::float8 as price_per_unit_cents,
        fr.rating::float8 as finnrick_rating,
        oc.last_seen_at,
        row_number() over (
          partition by v.id
          order by ${metricUnsafe} asc nulls last, oc.last_seen_at desc, oc.id asc
        ) as vendor_rank
      from offers_current oc
      inner join vendors v on v.id = oc.vendor_id
      left join lateral (
        select rating
        from finnrick_ratings fr
        where fr.vendor_id = v.id
        order by fr.rated_at desc
        limit 1
      ) fr on true
      where oc.variant_id = ${input.variantId} and oc.is_available = true
    )
    select
      vendor_id,
      vendor_slug,
      vendor_name,
      vendor_url,
      metric_price,
      price_per_mg_cents,
      price_per_ml_cents,
      price_per_vial_cents,
      price_per_unit_cents,
      finnrick_rating,
      last_seen_at
    from ranked
    where vendor_rank = 1
    order by metric_price asc nulls last, vendor_name asc
    limit ${input.pageSize} offset ${offset}
  `;

  return {
    rows: rows.map((row) => ({
      vendorId: row.vendorId,
      vendorSlug: row.vendorSlug,
      vendorName: row.vendorName,
      vendorUrl: row.vendorUrl,
      metricPrice: row.metricPrice,
      metricValues: {
        price_per_mg: row.pricePerMgCents,
        price_per_ml: row.pricePerMlCents,
        price_per_vial: row.pricePerVialCents,
        price_per_unit: row.pricePerUnitCents
      },
      finnrickRating: row.finnrickRating,
      lastSeenAt: row.lastSeenAt
    })),
    total: totalRows[0]?.count ?? 0,
    page: input.page,
    pageSize: input.pageSize
  };
}

export interface VendorDetails {
  id: string;
  name: string;
  slug: string;
  websiteUrl: string;
  finnrickRating: number | null;
  lastUpdatedAt: string | null;
}

export async function getVendorBySlug(slug: string): Promise<VendorDetails | null> {
  const rows = await sql<VendorDetails[]>`
    select
      v.id,
      v.name,
      v.slug,
      v.website_url,
      fr.rating::float8 as finnrick_rating,
      summary.last_updated_at
    from vendors v
    left join lateral (
      select rating
      from finnrick_ratings fr
      where fr.vendor_id = v.id
      order by fr.rated_at desc
      limit 1
    ) fr on true
    left join lateral (
      select max(last_seen_at) as last_updated_at
      from offers_current oc
      where oc.vendor_id = v.id and oc.is_available = true
    ) summary on true
    where v.slug = ${slug} and v.is_active = true
    limit 1
  `;

  return rows[0] ?? null;
}

export interface VendorOfferRow {
  id: string;
  compoundSlug: string;
  compoundName: string;
  formulationLabel: string;
  sizeLabel: string;
  productName: string;
  productUrl: string;
  metricPrice: number | null;
  metricValues: MetricPriceMap;
  listPriceCents: number;
  lastSeenAt: string;
}

export interface VendorOfferPage {
  rows: VendorOfferRow[];
  total: number;
  page: number;
  pageSize: number;
}

export async function getOffersForVendor(input: {
  vendorId: string;
  metric: MetricType;
  page: number;
  pageSize: number;
}): Promise<VendorOfferPage> {
  const metricCol = metricColumn(input.metric);
  const metricUnsafe = sql.unsafe(metricCol);
  const offset = (input.page - 1) * input.pageSize;

  const totalRows = await sql<
    {
      count: number;
    }[]
  >`
    select count(*)::int as count
    from offers_current
    where vendor_id = ${input.vendorId} and is_available = true
  `;

  const rows = await sql<
    {
      id: string;
      compoundSlug: string;
      compoundName: string;
      formulationLabel: string;
      sizeLabel: string;
      productName: string;
      productUrl: string;
      metricPrice: number | null;
      pricePerMgCents: number | null;
      pricePerMlCents: number | null;
      pricePerVialCents: number | null;
      pricePerUnitCents: number | null;
      listPriceCents: number;
      lastSeenAt: string;
    }[]
  >`
    select
      oc.id,
      c.slug as compound_slug,
      c.name as compound_name,
      f.display_name as formulation_label,
      cv.display_size_label as size_label,
      oc.product_name,
      oc.product_url,
      ${metricUnsafe}::float8 as metric_price,
      oc.price_per_mg_cents::float8 as price_per_mg_cents,
      oc.price_per_ml_cents::float8 as price_per_ml_cents,
      oc.price_per_vial_cents::float8 as price_per_vial_cents,
      oc.price_per_unit_cents::float8 as price_per_unit_cents,
      oc.list_price_cents,
      oc.last_seen_at
    from offers_current oc
    inner join compound_variants cv on cv.id = oc.variant_id
    inner join compounds c on c.id = cv.compound_id
    inner join formulations f on f.code = cv.formulation_code
    where
      oc.vendor_id = ${input.vendorId}
      and oc.is_available = true
    order by c.name asc, cv.display_size_label asc, ${metricUnsafe} asc nulls last, oc.last_seen_at desc
    limit ${input.pageSize} offset ${offset}
  `;

  return {
    rows: rows.map((row) => ({
      id: row.id,
      compoundSlug: row.compoundSlug,
      compoundName: row.compoundName,
      formulationLabel: row.formulationLabel,
      sizeLabel: row.sizeLabel,
      productName: row.productName,
      productUrl: row.productUrl,
      metricPrice: row.metricPrice,
      metricValues: {
        price_per_mg: row.pricePerMgCents,
        price_per_ml: row.pricePerMlCents,
        price_per_vial: row.pricePerVialCents,
        price_per_unit: row.pricePerUnitCents
      },
      listPriceCents: row.listPriceCents,
      lastSeenAt: row.lastSeenAt
    })),
    total: totalRows[0]?.count ?? 0,
    page: input.page,
    pageSize: input.pageSize
  };
}

export async function getTrendPoints(input: {
  variantId: string;
  metric: MetricType;
  range: TrendRange;
}): Promise<TrendPoint[]> {
  const metricCol = metricColumn(input.metric);
  const metricUnsafe = sql.unsafe(metricCol);

  const rows = await sql<
    {
      timestamp: string;
      value: number;
    }[]
  >`
    select
      effective_from as timestamp,
      ${metricUnsafe}::float8 as value
    from offer_history
    where
      variant_id = ${input.variantId}
      and ${metricUnsafe} is not null
      and effective_from >= now() - ${trendWindow(input.range)}::interval
    order by effective_from asc
  `;

  if (rows.length > 0) {
    return rows;
  }

  const fallbackRows = await sql<
    {
      timestamp: string;
      value: number | null;
    }[]
  >`
    select
      max(last_seen_at) as timestamp,
      avg(${metricUnsafe})::float8 as value
    from offers_current
    where
      variant_id = ${input.variantId}
      and is_available = true
      and ${metricUnsafe} is not null
  `;

  if (!fallbackRows[0]?.timestamp || fallbackRows[0].value === null) {
    return [];
  }

  return [
    {
      timestamp: fallbackRows[0].timestamp,
      value: fallbackRows[0].value
    }
  ];
}

export async function createScrapeRun(input: {
  jobType: JobType;
  runMode: JobRunMode;
  scrapeMode: ScrapeMode;
  triggeredBy: string | null;
}): Promise<string> {
  await ensureScrapeRunsHeartbeatColumn();

  const rows = await sql<
    {
      id: string;
    }[]
  >`
    insert into scrape_runs (job_type, run_mode, scrape_mode, status, started_at, heartbeat_at, triggered_by, summary)
    values (
      ${input.jobType},
      ${input.runMode},
      ${input.scrapeMode},
      'running',
      now(),
      now(),
      ${input.triggeredBy},
      jsonb_build_object('heartbeatEnabled', true)
    )
    returning id
  `;

  return rows[0].id;
}

export async function finishScrapeRun(input: {
  scrapeRunId: string;
  status: ScrapeStatus;
  summary: Record<string, unknown>;
}): Promise<void> {
  await ensureScrapeRunsHeartbeatColumn();

  await sql`
    update scrape_runs
    set status = ${input.status}, summary = ${toJson(input.summary)}, heartbeat_at = now(), finished_at = now()
    where id = ${input.scrapeRunId}
  `;
}

export async function touchScrapeRunHeartbeat(input: {
  scrapeRunId: string;
  patchSummary?: Record<string, unknown> | null;
}): Promise<void> {
  await ensureScrapeRunsHeartbeatColumn();

  if (input.patchSummary && Object.keys(input.patchSummary).length > 0) {
    await sql`
      update scrape_runs
      set heartbeat_at = now(),
          summary = coalesce(summary, '{}'::jsonb) || ${toJson(input.patchSummary)}
      where id = ${input.scrapeRunId} and status = 'running'
    `;
    return;
  }

  await sql`
    update scrape_runs
    set heartbeat_at = now()
    where id = ${input.scrapeRunId} and status = 'running'
  `;
}

export interface ReconciledScrapeRun {
  id: string;
  jobType: JobType;
  runMode: JobRunMode;
  scrapeMode: ScrapeMode;
  startedAt: string;
  heartbeatAt: string | null;
  triggeredBy: string | null;
}

export async function reconcileStaleScrapeRuns(input: {
  staleTtlMinutes: number;
  reason: string;
  jobType?: JobType;
  excludeScrapeRunId?: string;
}): Promise<ReconciledScrapeRun[]> {
  await ensureScrapeRunsHeartbeatColumn();
  const jobTypeFilter = input.jobType ? sql`and job_type = ${input.jobType}` : sql``;
  const excludeRunFilter = input.excludeScrapeRunId ? sql`and id <> ${input.excludeScrapeRunId}` : sql``;

  return sql<ReconciledScrapeRun[]>`
    with stale as (
      select
        id,
        job_type,
        run_mode,
        scrape_mode,
        started_at,
        heartbeat_at,
        triggered_by
      from scrape_runs
      where
        status = 'running'
        ${jobTypeFilter}
        ${excludeRunFilter}
        and (
          (
            coalesce((summary ->> 'heartbeatEnabled')::boolean, false) = true
            and coalesce(heartbeat_at, started_at) <= now() - make_interval(mins => ${input.staleTtlMinutes}::int)
          )
          or (
            coalesce((summary ->> 'heartbeatEnabled')::boolean, false) = false
            and started_at <= now() - make_interval(mins => ${input.staleTtlMinutes}::int)
          )
        )
    ),
    updated as (
      update scrape_runs sr
      set
        status = 'failed',
        finished_at = now(),
        heartbeat_at = now(),
        summary = coalesce(sr.summary, '{}'::jsonb) || jsonb_build_object(
          'staleFailureReason', ${input.reason}::text,
          'staleFailedAt', now(),
          'staleTtlMinutes', ${input.staleTtlMinutes}::int
        )
      from stale
      where sr.id = stale.id
      returning
        stale.id,
        stale.job_type,
        stale.run_mode,
        stale.scrape_mode,
        stale.started_at,
        stale.heartbeat_at,
        stale.triggered_by
    )
    select
      id,
      job_type,
      run_mode,
      scrape_mode,
      started_at,
      heartbeat_at,
      triggered_by
    from updated
    order by started_at asc
  `;
}

export async function recordScrapeEvent(input: {
  scrapeRunId: string;
  vendorId: string | null;
  severity: "info" | "warn" | "error";
  code: string;
  message: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await sql`
    insert into scrape_events (scrape_run_id, vendor_id, severity, code, message, payload)
    values (
      ${input.scrapeRunId},
      ${input.vendorId},
      ${input.severity},
      ${input.code},
      ${input.message},
      ${toJson(input.payload ?? {})}
    )
  `;
}

export interface ScrapeTarget {
  vendorPageId: string;
  vendorId: string;
  vendorName: string;
  websiteUrl: string;
  pageUrl: string;
  allowAggressive: boolean;
}

export async function getActiveScrapeTargets(): Promise<ScrapeTarget[]> {
  return sql<ScrapeTarget[]>`
    select
      vp.id as vendor_page_id,
      v.id as vendor_id,
      v.name as vendor_name,
      v.website_url,
      vp.url as page_url,
      vp.allow_aggressive
    from vendor_pages vp
    inner join vendors v on v.id = vp.vendor_id
    where vp.is_active = true and v.is_active = true
    order by v.name asc
  `;
}

export async function getVendorScrapeTargets(vendorId: string): Promise<ScrapeTarget[]> {
  return sql<ScrapeTarget[]>`
    select
      vp.id as vendor_page_id,
      v.id as vendor_id,
      v.name as vendor_name,
      v.website_url,
      vp.url as page_url,
      vp.allow_aggressive
    from vendor_pages vp
    inner join vendors v on v.id = vp.vendor_id
    where vp.is_active = true and v.is_active = true and v.id = ${vendorId}
    order by vp.url asc
  `;
}

export async function markVendorPageScrape(input: {
  vendorPageId: string;
  status: string;
}): Promise<void> {
  await sql`
    update vendor_pages
    set last_scraped_at = now(), last_status = ${input.status}, updated_at = now()
    where id = ${input.vendorPageId}
  `;
}

export async function createReviewQueueItem(input: {
  type: ReviewQueueType;
  status?: ReviewQueueStatus;
  vendorId?: string | null;
  pageUrl?: string | null;
  rawText?: string | null;
  suggestedCompoundId?: string | null;
  confidence?: number | null;
  payload?: Record<string, unknown>;
}): Promise<string> {
  if (input.type === "alias_match" && input.rawText && input.rawText.trim().length > 0) {
    const existingRows = await sql<
      {
        id: string;
      }[]
    >`
      select id
      from review_queue
      where queue_type = ${input.type}
        and status in ('open', 'in_progress')
        and vendor_id is not distinct from ${input.vendorId ?? null}
        and page_url is not distinct from ${input.pageUrl ?? null}
        and raw_text is not distinct from ${input.rawText ?? null}
      order by created_at asc
      limit 1
    `;

    const existing = existingRows[0];
    if (existing) {
      await sql`
        update review_queue
        set confidence = ${input.confidence ?? null},
            payload = ${toJson(input.payload ?? {})},
            updated_at = now()
        where id = ${existing.id}
      `;

      return existing.id;
    }
  }

  const rows = await sql<
    {
      id: string;
    }[]
  >`
    insert into review_queue (
      queue_type,
      status,
      vendor_id,
      page_url,
      raw_text,
      suggested_compound_id,
      confidence,
      payload
    )
    values (
      ${input.type},
      ${input.status ?? "open"},
      ${input.vendorId ?? null},
      ${input.pageUrl ?? null},
      ${input.rawText ?? null},
      ${input.suggestedCompoundId ?? null},
      ${input.confidence ?? null},
      ${toJson(input.payload ?? {})}
    )
    returning id
  `;

  return rows[0].id;
}

export async function listOpenReviewItems(): Promise<
  {
    id: string;
    queueType: ReviewQueueType;
    status: ReviewQueueStatus;
    vendorName: string | null;
    pageUrl: string | null;
    rawText: string | null;
    confidence: number | null;
    payload: Record<string, unknown>;
    createdAt: string;
  }[]
> {
  return sql`
    select
      rq.id,
      rq.queue_type,
      rq.status,
      v.name as vendor_name,
      rq.page_url,
      rq.raw_text,
      rq.confidence::float8 as confidence,
      rq.payload,
      rq.created_at
    from review_queue rq
    left join vendors v on v.id = rq.vendor_id
    where rq.status in ('open', 'in_progress')
    order by rq.created_at asc
    limit 200
  `;
}

export async function listVendorsForAdmin(): Promise<
  {
    id: string;
    name: string;
    websiteUrl: string;
    isActive: boolean;
    updatedAt: string;
  }[]
> {
  return sql`
    select id, name, website_url, is_active, updated_at
    from vendors
    order by name asc
  `;
}

export async function listVendorSlugOptions(): Promise<{ slug: string }[]> {
  return sql`
    select slug
    from vendors
    where is_active = true
    order by slug asc
  `;
}

export async function listFeaturedCompounds(): Promise<
  {
    compoundId: string;
    compoundName: string;
    compoundSlug: string;
    displayOrder: number;
    source: "auto" | "manual";
    isPinned: boolean;
  }[]
> {
  return sql`
    select
      fc.compound_id,
      c.name as compound_name,
      c.slug as compound_slug,
      fc.display_order,
      fc.source,
      fc.is_pinned
    from featured_compounds fc
    inner join compounds c on c.id = fc.compound_id
    order by fc.display_order asc
  `;
}

export async function listCompoundCatalog(): Promise<
  {
    id: string;
    name: string;
    slug: string;
  }[]
> {
  return sql`
    select id, name, slug
    from compounds
    where is_active = true
    order by name asc
  `;
}

export async function listCategoriesForAdmin(): Promise<
  {
    id: string;
    name: string;
    slug: string;
    mappedCompounds: number;
  }[]
> {
  return sql`
    select
      cat.id,
      cat.name,
      cat.slug,
      count(distinct ccm.compound_id)::int as mapped_compounds
    from categories cat
    left join compound_category_map ccm on ccm.category_id = cat.id
    group by cat.id, cat.name, cat.slug
    order by cat.name asc
  `;
}

export async function listCompoundCategoryAssignmentsForAdmin(): Promise<
  {
    id: string;
    name: string;
    slug: string;
    categoryIds: string[];
    primaryCategoryId: string | null;
    activeOfferCount: number;
  }[]
> {
  return sql`
    select
      c.id,
      c.name,
      c.slug,
      coalesce(category_map.category_ids, '{}'::text[]) as category_ids,
      category_map.primary_category_id,
      coalesce(offer_stats.active_offer_count, 0)::int as active_offer_count
    from compounds c
    left join lateral (
      select
        array_agg(ccm.category_id::text order by ccm.is_primary desc, cat.name asc) as category_ids,
        max(case when ccm.is_primary then ccm.category_id::text else null end) as primary_category_id
      from compound_category_map ccm
      inner join categories cat on cat.id = ccm.category_id
      where ccm.compound_id = c.id
    ) category_map on true
    left join lateral (
      select count(distinct oc.id)::int as active_offer_count
      from compound_variants cv
      inner join offers_current oc on oc.variant_id = cv.id and oc.is_available = true
      where cv.compound_id = c.id and cv.is_active = true
    ) offer_stats on true
    where c.is_active = true
    order by c.name asc
  `;
}

export async function listCompoundsMissingPrimaryCategory(): Promise<
  {
    id: string;
    name: string;
    slug: string;
    variantCount: number;
    activeOfferCount: number;
  }[]
> {
  return sql`
    select
      c.id,
      c.name,
      c.slug,
      count(distinct cv.id)::int as variant_count,
      count(distinct oc.id) filter (where oc.is_available = true)::int as active_offer_count
    from compounds c
    left join compound_category_map ccm on ccm.compound_id = c.id and ccm.is_primary = true
    left join compound_variants cv on cv.compound_id = c.id and cv.is_active = true
    left join offers_current oc on oc.variant_id = cv.id and oc.is_available = true
    where c.is_active = true and ccm.id is null
    group by c.id, c.name, c.slug
    order by c.name asc
  `;
}
