import { sql } from "@/lib/db/client";
import type { JSONValue } from "postgres";
import type { CompoundResolution, ExtractedOffer, MetricPriceMap, ResolutionStatus } from "@/lib/types";

const toJson = (value: unknown) => sql.json(value as JSONValue);

interface VariantUpsertInput {
  compoundId: string;
  formulationCode: string;
  displaySizeLabel: string;
  strengthValue: number | null;
  strengthUnit: string | null;
  packageQuantity: number | null;
  packageUnit: string | null;
  totalMassMg: number | null;
  totalVolumeMl: number | null;
  totalCountUnits: number | null;
}

interface OfferUpsertInput {
  scrapeRunId: string;
  vendorId: string;
  variantId: string;
  productUrl: string;
  productName: string;
  currencyCode: string;
  listPriceCents: number;
  metricPrices: MetricPriceMap;
  available: boolean;
  rawPayload: Record<string, unknown>;
}

function normalizeAlias(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const COMPOUND_RULES: Array<{ pattern: RegExp; canonical: string; confidence: number }> = [
  { pattern: /\bbpc\s*157\b/, canonical: "bpc-157", confidence: 0.99 },
  { pattern: /\bretatrutide\b|\bglp\s*3\b|\ber\s*-?\s*rt\b|\b[a-z]?\s*-?rt\b/, canonical: "retatrutide", confidence: 0.9 },
  { pattern: /\bcjc\s*1295\b/, canonical: "cjc-1295", confidence: 0.99 },
  { pattern: /\bipamorelin\b/, canonical: "ipamorelin", confidence: 0.99 }
];

export async function resolveCompoundAlias(rawName: string): Promise<CompoundResolution> {
  const aliasNormalized = normalizeAlias(rawName);

  const aliasRows = await sql<
    {
      compoundId: string | null;
      confidence: number;
      status: ResolutionStatus;
    }[]
  >`
    select compound_id, confidence, status
    from compound_aliases
    where alias_normalized = ${aliasNormalized}
    order by created_at desc
    limit 1
  `;

  const alias = aliasRows[0];
  if (alias && alias.compoundId) {
    return {
      compoundId: alias.compoundId,
      confidence: alias.confidence,
      status: alias.status,
      aliasNormalized,
      reason: "existing_alias"
    };
  }

  const directMatch = await sql<
    {
      id: string;
      slug: string;
      name: string;
    }[]
  >`
    select id, slug, name
    from compounds
    where lower(name) = ${rawName.toLowerCase()} or slug = ${rawName.toLowerCase()}
    limit 1
  `;

  if (directMatch[0]) {
    await sql`
      insert into compound_aliases (compound_id, alias, alias_normalized, source, confidence, status)
      values (${directMatch[0].id}, ${rawName}, ${aliasNormalized}, 'scraped', 1.0, 'auto_matched')
      on conflict (alias_normalized) do update
      set compound_id = excluded.compound_id,
          confidence = excluded.confidence,
          status = excluded.status,
          updated_at = now()
    `;

    return {
      compoundId: directMatch[0].id,
      confidence: 1,
      status: "auto_matched",
      aliasNormalized,
      reason: "direct_compound_match"
    };
  }

  for (const rule of COMPOUND_RULES) {
    if (rule.pattern.test(aliasNormalized)) {
      const compoundRows = await sql<
        {
          id: string;
        }[]
      >`
        select id
        from compounds
        where slug = ${rule.canonical}
        limit 1
      `;

      if (compoundRows[0]) {
        await sql`
          insert into compound_aliases (compound_id, alias, alias_normalized, source, confidence, status)
          values (${compoundRows[0].id}, ${rawName}, ${aliasNormalized}, 'rules', ${rule.confidence}, 'auto_matched')
          on conflict (alias_normalized) do update
          set compound_id = excluded.compound_id,
              confidence = excluded.confidence,
              status = excluded.status,
              updated_at = now()
        `;

        return {
          compoundId: compoundRows[0].id,
          confidence: rule.confidence,
          status: "auto_matched",
          aliasNormalized,
          reason: "rule_match"
        };
      }
    }
  }

  await sql`
    insert into compound_aliases (compound_id, alias, alias_normalized, source, confidence, status)
    values (null, ${rawName}, ${aliasNormalized}, 'scraped', 0.0, 'needs_review')
    on conflict (alias_normalized) do update
    set updated_at = now(), status = 'needs_review'
  `;

  return {
    compoundId: null,
    confidence: 0,
    status: "needs_review",
    aliasNormalized,
    reason: "unknown_alias"
  };
}

export async function ensureFormulation(code: string, displayName: string): Promise<void> {
  await sql`
    insert into formulations (code, display_name)
    values (${code}, ${displayName})
    on conflict (code) do update
    set display_name = excluded.display_name,
        updated_at = now()
  `;
}

export async function upsertCompoundVariant(input: VariantUpsertInput): Promise<string> {
  const rows = await sql<
    {
      id: string;
    }[]
  >`
    insert into compound_variants (
      compound_id,
      formulation_code,
      display_size_label,
      strength_value,
      strength_unit,
      package_quantity,
      package_unit,
      total_mass_mg,
      total_volume_ml,
      total_count_units
    )
    values (
      ${input.compoundId},
      ${input.formulationCode},
      ${input.displaySizeLabel},
      ${input.strengthValue},
      ${input.strengthUnit},
      ${input.packageQuantity},
      ${input.packageUnit},
      ${input.totalMassMg},
      ${input.totalVolumeMl},
      ${input.totalCountUnits}
    )
    on conflict (compound_id, formulation_code, display_size_label) do update
    set
      strength_value = excluded.strength_value,
      strength_unit = excluded.strength_unit,
      package_quantity = excluded.package_quantity,
      package_unit = excluded.package_unit,
      total_mass_mg = excluded.total_mass_mg,
      total_volume_ml = excluded.total_volume_ml,
      total_count_units = excluded.total_count_units,
      updated_at = now()
    returning id
  `;

  return rows[0].id;
}

export async function upsertOfferCurrent(input: OfferUpsertInput): Promise<"created" | "updated" | "unchanged"> {
  const current = await sql<
    {
      id: string;
      listPriceCents: number;
      pricePerMgCents: number | null;
      pricePerMlCents: number | null;
      pricePerVialCents: number | null;
      pricePerUnitCents: number | null;
      isAvailable: boolean;
    }[]
  >`
    select
      id,
      list_price_cents,
      price_per_mg_cents::float8 as price_per_mg_cents,
      price_per_ml_cents::float8 as price_per_ml_cents,
      price_per_vial_cents::float8 as price_per_vial_cents,
      price_per_unit_cents::float8 as price_per_unit_cents,
      is_available
    from offers_current
    where vendor_id = ${input.vendorId}
      and variant_id = ${input.variantId}
      and product_url = ${input.productUrl}
    limit 1
  `;

  const existing = current[0];

  if (!existing) {
    const inserted = await sql<
      {
        id: string;
      }[]
    >`
      insert into offers_current (
        vendor_id,
        variant_id,
        product_url,
        product_name,
        currency_code,
        list_price_cents,
        price_per_mg_cents,
        price_per_ml_cents,
        price_per_vial_cents,
        price_per_unit_cents,
        is_available,
        last_scraped_at,
        last_seen_at,
        raw_payload
      )
      values (
        ${input.vendorId},
        ${input.variantId},
        ${input.productUrl},
        ${input.productName},
        ${input.currencyCode},
        ${input.listPriceCents},
        ${input.metricPrices.price_per_mg},
        ${input.metricPrices.price_per_ml},
        ${input.metricPrices.price_per_vial},
        ${input.metricPrices.price_per_unit},
        ${input.available},
        now(),
        now(),
        ${toJson(input.rawPayload)}
      )
      returning id
    `;

    await sql`
      insert into offer_history (
        offer_current_id,
        scrape_run_id,
        vendor_id,
        variant_id,
        product_url,
        currency_code,
        list_price_cents,
        price_per_mg_cents,
        price_per_ml_cents,
        price_per_vial_cents,
        price_per_unit_cents,
        is_available,
        effective_from,
        raw_payload
      )
      values (
        ${inserted[0].id},
        ${input.scrapeRunId},
        ${input.vendorId},
        ${input.variantId},
        ${input.productUrl},
        ${input.currencyCode},
        ${input.listPriceCents},
        ${input.metricPrices.price_per_mg},
        ${input.metricPrices.price_per_ml},
        ${input.metricPrices.price_per_vial},
        ${input.metricPrices.price_per_unit},
        ${input.available},
        now(),
        ${toJson(input.rawPayload)}
      )
    `;

    return "created";
  }

  const unchanged =
    existing.listPriceCents === input.listPriceCents &&
    existing.pricePerMgCents === input.metricPrices.price_per_mg &&
    existing.pricePerMlCents === input.metricPrices.price_per_ml &&
    existing.pricePerVialCents === input.metricPrices.price_per_vial &&
    existing.pricePerUnitCents === input.metricPrices.price_per_unit &&
    existing.isAvailable === input.available;

  if (unchanged) {
    await sql`
      update offers_current
      set last_scraped_at = now(),
          last_seen_at = now(),
          raw_payload = ${toJson(input.rawPayload)},
          updated_at = now()
      where id = ${existing.id}
    `;

    return "unchanged";
  }

  await sql.begin(async (tx) => {
    const q = tx as unknown as typeof sql;
    await q`
      update offer_history
      set effective_to = now()
      where offer_current_id = ${existing.id} and effective_to is null
    `;

    await q`
      update offers_current
      set
        product_name = ${input.productName},
        currency_code = ${input.currencyCode},
        list_price_cents = ${input.listPriceCents},
        price_per_mg_cents = ${input.metricPrices.price_per_mg},
        price_per_ml_cents = ${input.metricPrices.price_per_ml},
        price_per_vial_cents = ${input.metricPrices.price_per_vial},
        price_per_unit_cents = ${input.metricPrices.price_per_unit},
        is_available = ${input.available},
        last_scraped_at = now(),
        last_seen_at = now(),
        raw_payload = ${toJson(input.rawPayload)},
        updated_at = now()
      where id = ${existing.id}
    `;

    await q`
      insert into offer_history (
        offer_current_id,
        scrape_run_id,
        vendor_id,
        variant_id,
        product_url,
        currency_code,
        list_price_cents,
        price_per_mg_cents,
        price_per_ml_cents,
        price_per_vial_cents,
        price_per_unit_cents,
        is_available,
        effective_from,
        raw_payload
      )
      values (
        ${existing.id},
        ${input.scrapeRunId},
        ${input.vendorId},
        ${input.variantId},
        ${input.productUrl},
        ${input.currencyCode},
        ${input.listPriceCents},
        ${input.metricPrices.price_per_mg},
        ${input.metricPrices.price_per_ml},
        ${input.metricPrices.price_per_vial},
        ${input.metricPrices.price_per_unit},
        ${input.available},
        now(),
        ${toJson(input.rawPayload)}
      )
    `;
  });

  return "updated";
}

export async function setReviewResolution(input: {
  reviewId: string;
  status: "resolved" | "ignored";
  resolvedBy: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await sql`
    update review_queue
    set
      status = ${input.status},
      resolved_at = now(),
      resolved_by = ${input.resolvedBy},
      payload = coalesce(payload, '{}'::jsonb) || ${toJson(input.payload ?? {})}
    where id = ${input.reviewId}
  `;
}

export async function updateFeaturedCompounds(input: {
  orderedCompoundIds: string[];
  source: "auto" | "manual";
  pinned: boolean;
  actorEmail: string;
}): Promise<void> {
  await sql.begin(async (tx) => {
    const q = tx as unknown as typeof sql;
    await q`delete from featured_compounds`;

    for (let index = 0; index < input.orderedCompoundIds.length; index += 1) {
      const compoundId = input.orderedCompoundIds[index];
      await q`
        insert into featured_compounds (compound_id, display_order, source, is_pinned)
        values (${compoundId}, ${index + 1}, ${input.source}, ${input.pinned})
      `;
    }

    await q`
      insert into admin_audit_log (actor_email, action, target_type, target_id, after_payload)
      values (${input.actorEmail}, 'update_featured', 'featured_compounds', null, ${toJson({ orderedCompoundIds: input.orderedCompoundIds })})
    `;
  });
}

export async function queueManualRescrape(input: {
  vendorId: string;
  actorEmail: string;
}): Promise<void> {
  await sql.begin(async (tx) => {
    const q = tx as unknown as typeof sql;
    await q`
      insert into scrape_requests (vendor_id, requested_by, scrape_mode, status)
      values (${input.vendorId}, ${input.actorEmail}, 'aggressive_manual', 'pending')
    `;

    await q`
      insert into admin_audit_log (actor_email, action, target_type, target_id)
      values (${input.actorEmail}, 'queue_aggressive_rescrape', 'vendor', ${input.vendorId})
    `;
  });
}

export async function pullPendingScrapeRequests(limit = 20): Promise<
  {
    id: string;
    vendor_id: string;
    scrape_mode: "safe" | "aggressive_manual";
    requested_by: string;
  }[]
> {
  return sql`
    select id, vendor_id, scrape_mode, requested_by
    from scrape_requests
    where status = 'pending'
    order by created_at asc
    limit ${limit}
  `;
}

export async function markScrapeRequestStatus(input: { id: string; status: "processing" | "completed" | "failed" }): Promise<void> {
  await sql`
    update scrape_requests
    set status = ${input.status}, updated_at = now()
    where id = ${input.id}
  `;
}

export async function upsertFinnrickRating(input: {
  vendorId: string;
  rating: number | null;
  ratingLabel: string | null;
  sourceUrl: string;
  scrapeRunId: string;
}): Promise<void> {
  await sql.begin(async (tx) => {
    const q = tx as unknown as typeof sql;
    await q`
      insert into finnrick_ratings (vendor_id, rating, rating_label, rated_at, source_url)
      values (${input.vendorId}, ${input.rating}, ${input.ratingLabel}, now(), ${input.sourceUrl})
    `;

    await q`
      insert into finnrick_rating_history (vendor_id, rating, rating_label, captured_at, scrape_run_id, source_url)
      values (${input.vendorId}, ${input.rating}, ${input.ratingLabel}, now(), ${input.scrapeRunId}, ${input.sourceUrl})
    `;
  });
}

export async function ensureCompoundByName(input: { name: string; slug: string }): Promise<string> {
  const rows = await sql<
    {
      id: string;
    }[]
  >`
    insert into compounds (name, slug)
    values (${input.name}, ${input.slug})
    on conflict (slug) do update
    set name = excluded.name,
        updated_at = now()
    returning id
  `;

  return rows[0].id;
}

export async function writeAdminAudit(input: {
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string | null;
  beforePayload?: Record<string, unknown>;
  afterPayload?: Record<string, unknown>;
}): Promise<void> {
  await sql`
    insert into admin_audit_log (actor_email, action, target_type, target_id, before_payload, after_payload)
    values (
      ${input.actorEmail},
      ${input.action},
      ${input.targetType},
      ${input.targetId},
      ${toJson(input.beforePayload ?? {})},
      ${toJson(input.afterPayload ?? {})}
    )
  `;
}

export async function markReviewResolvedWithCompound(input: {
  reviewId: string;
  compoundId: string;
  actorEmail: string;
}): Promise<void> {
  await sql.begin(async (tx) => {
    const q = tx as unknown as typeof sql;
    const queueRows = await q<
      {
        rawText: string | null;
      }[]
    >`
      select raw_text
      from review_queue
      where id = ${input.reviewId}
      limit 1
    `;

    const alias = queueRows[0]?.rawText;
    if (alias) {
      const aliasNormalized = alias
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");

      await q`
        insert into compound_aliases (compound_id, alias, alias_normalized, source, confidence, status)
        values (${input.compoundId}, ${alias}, ${aliasNormalized}, 'admin', 1.0, 'resolved')
        on conflict (alias_normalized) do update
        set compound_id = excluded.compound_id,
            source = excluded.source,
            confidence = excluded.confidence,
            status = excluded.status,
            updated_at = now()
      `;
    }

    await q`
      update review_queue
      set status = 'resolved', resolved_at = now(), resolved_by = ${input.actorEmail}
      where id = ${input.reviewId}
    `;

    await q`
      insert into admin_audit_log (actor_email, action, target_type, target_id)
      values (${input.actorEmail}, 'resolve_review', 'review_queue', ${input.reviewId})
    `;
  });
}

export async function markReviewIgnored(input: {
  reviewId: string;
  actorEmail: string;
}): Promise<void> {
  await sql.begin(async (tx) => {
    const q = tx as unknown as typeof sql;
    await q`
      update review_queue
      set status = 'ignored', resolved_at = now(), resolved_by = ${input.actorEmail}
      where id = ${input.reviewId}
    `;

    await q`
      insert into admin_audit_log (actor_email, action, target_type, target_id)
      values (${input.actorEmail}, 'ignore_review', 'review_queue', ${input.reviewId})
    `;
  });
}

export async function getPendingManualScrapes(): Promise<
  {
    id: string;
    vendorId: string;
    scrapeMode: "safe" | "aggressive_manual";
    requestedBy: string;
  }[]
> {
  return sql`
    select id, vendor_id as "vendorId", scrape_mode as "scrapeMode", requested_by as "requestedBy"
    from scrape_requests
    where status = 'pending'
    order by created_at asc
  `;
}

export async function markScrapeRequestComplete(input: { id: string; status: "completed" | "failed" }): Promise<void> {
  await sql`
    update scrape_requests
    set status = ${input.status}, updated_at = now()
    where id = ${input.id}
  `;
}

export async function getVendorByName(name: string): Promise<{ id: string } | null> {
  const rows = await sql<{ id: string }[]>`
    select id
    from vendors
    where lower(name) = ${name.toLowerCase()}
    limit 1
  `;

  return rows[0] ?? null;
}

export async function listVendorsForRatingSync(): Promise<
  {
    id: string;
    name: string;
  }[]
> {
  return sql`
    select id, name
    from vendors
    where is_active = true
  `;
}

export async function upsertVendor(input: {
  name: string;
  slug: string;
  websiteUrl: string;
}): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    insert into vendors (name, slug, website_url)
    values (${input.name}, ${input.slug}, ${input.websiteUrl})
    on conflict (slug) do update
    set name = excluded.name,
        website_url = excluded.website_url,
        updated_at = now()
    returning id
  `;

  return rows[0].id;
}

export async function upsertVendorPage(input: {
  vendorId: string;
  url: string;
  pageType: "catalog" | "product" | "search" | "custom";
}): Promise<void> {
  await sql`
    insert into vendor_pages (vendor_id, url, page_type)
    values (${input.vendorId}, ${input.url}, ${input.pageType})
    on conflict (vendor_id, url) do update
    set page_type = excluded.page_type,
        updated_at = now()
  `;
}

export async function setAppSettings(input: { headline: string; subhead: string }): Promise<void> {
  await sql`
    insert into app_settings (id, key_headline, key_subhead)
    values (1, ${input.headline}, ${input.subhead})
    on conflict (id) do update
    set key_headline = excluded.key_headline,
        key_subhead = excluded.key_subhead,
        updated_at = now()
  `;
}

export async function ensureCategory(name: string, slug: string): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    insert into categories (name, slug)
    values (${name}, ${slug})
    on conflict (slug) do update
    set name = excluded.name,
        updated_at = now()
    returning id
  `;

  return rows[0].id;
}

export async function setPrimaryCategory(input: { compoundId: string; categoryId: string }): Promise<void> {
  await sql.begin(async (tx) => {
    const q = tx as unknown as typeof sql;
    await q`
      update compound_category_map
      set is_primary = false
      where compound_id = ${input.compoundId}
    `;

    await q`
      insert into compound_category_map (compound_id, category_id, is_primary)
      values (${input.compoundId}, ${input.categoryId}, true)
      on conflict (compound_id, category_id) do update
      set is_primary = true,
          updated_at = now()
    `;
  });
}

export async function touchVendorPageStatus(input: {
  vendorPageId: string;
  status: string;
}): Promise<void> {
  await sql`
    update vendor_pages
    set last_scraped_at = now(), last_status = ${input.status}, updated_at = now()
    where id = ${input.vendorPageId}
  `;
}

export function toSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export async function createCompoundFromReview(input: {
  reviewId: string;
  compoundName: string;
  actorEmail: string;
}): Promise<string> {
  const slug = toSlug(input.compoundName);
  const compoundId = await ensureCompoundByName({ name: input.compoundName, slug });

  await markReviewResolvedWithCompound({
    reviewId: input.reviewId,
    compoundId,
    actorEmail: input.actorEmail
  });

  return compoundId;
}

export async function setReviewInProgress(input: { reviewId: string; actorEmail: string }): Promise<void> {
  await sql.begin(async (tx) => {
    const q = tx as unknown as typeof sql;
    await q`
      update review_queue
      set status = 'in_progress'
      where id = ${input.reviewId} and status = 'open'
    `;

    await q`
      insert into admin_audit_log (actor_email, action, target_type, target_id)
      values (${input.actorEmail}, 'start_review', 'review_queue', ${input.reviewId})
    `;
  });
}

export async function saveScrapeRequestFailure(input: {
  requestId: string;
  message: string;
}): Promise<void> {
  await sql`
    update scrape_requests
    set status = 'failed',
        failure_message = ${input.message},
        updated_at = now()
    where id = ${input.requestId}
  `;
}

export async function saveScrapeRequestCompletion(input: {
  requestId: string;
  scrapeRunId: string;
}): Promise<void> {
  await sql`
    update scrape_requests
    set status = 'completed',
        linked_scrape_run_id = ${input.scrapeRunId},
        updated_at = now()
    where id = ${input.requestId}
  `;
}

export async function updateVendorLastSeen(vendorId: string): Promise<void> {
  await sql`
    update vendors
    set updated_at = now()
    where id = ${vendorId}
  `;
}

export async function updateOfferFromExtracted(input: {
  scrapeRunId: string;
  extracted: ExtractedOffer;
  variantId: string;
  metricPrices: MetricPriceMap;
}): Promise<"created" | "updated" | "unchanged"> {
  return upsertOfferCurrent({
    scrapeRunId: input.scrapeRunId,
    vendorId: input.extracted.vendorId,
    variantId: input.variantId,
    productUrl: input.extracted.productUrl,
    productName: input.extracted.productName,
    currencyCode: input.extracted.currencyCode,
    listPriceCents: input.extracted.listPriceCents,
    metricPrices: input.metricPrices,
    available: input.extracted.available,
    rawPayload: input.extracted.rawPayload
  });
}

export async function createAiAgentTask(input: {
  vendorId: string | null;
  pageUrl: string;
  reason: string;
  scrapeRunId: string | null;
  requestedBy: string | null;
}): Promise<string> {
  const rows = await sql<
    {
      id: string;
    }[]
  >`
    insert into ai_agent_tasks (vendor_id, page_url, reason, scrape_run_id, requested_by, status)
    values (${input.vendorId}, ${input.pageUrl}, ${input.reason}, ${input.scrapeRunId}, ${input.requestedBy}, 'pending')
    returning id
  `;

  return rows[0].id;
}

export async function updateAiAgentTask(input: {
  taskId: string;
  status: "running" | "completed" | "failed";
  outputPayload?: Record<string, unknown>;
  errorMessage?: string | null;
}): Promise<void> {
  await sql`
    update ai_agent_tasks
    set
      status = ${input.status},
      attempt_count = case when ${input.status} = 'running' then attempt_count + 1 else attempt_count end,
      output_payload = coalesce(output_payload, '{}'::jsonb) || ${toJson(input.outputPayload ?? {})},
      error_message = ${input.errorMessage ?? null},
      updated_at = now()
    where id = ${input.taskId}
  `;
}
