import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { isLikelyBlendOrStackProduct } from "@/lib/alias/normalize";
import { sql } from "@/lib/db/client";

interface ActiveOfferRow {
  compoundId: string;
  compoundSlug: string;
  compoundName: string;
  vendorId: string;
  vendorSlug: string;
  vendorName: string;
  productName: string;
  productUrl: string;
  listPriceCents: number;
  lastSeenAt: string;
}

interface CandidateOffer {
  productName: string;
  productUrl: string;
  listPriceCents: number;
  lastSeenAt: string;
}

interface CandidateSignals {
  blendOrStackProduct: boolean;
  brandLikeName: boolean;
  peptideLikeName: boolean;
}

type CandidateRecommendation = "review_for_possible_exclusion" | "keep_tracking_until_cross_vendor";

interface CandidateRecord {
  compoundId: string;
  compoundSlug: string;
  compoundName: string;
  vendor: {
    id: string;
    slug: string;
    name: string;
  };
  vendorCount: 1;
  offerCount: number;
  recommendation: CandidateRecommendation;
  signals: CandidateSignals;
  manualDecision: {
    status: "pending";
    decidedBy: null;
    decidedAt: null;
    notes: "";
  };
  offers: CandidateOffer[];
}

interface CompoundBucket {
  compoundId: string;
  compoundSlug: string;
  compoundName: string;
  vendors: Map<string, { id: string; slug: string; name: string }>;
  offerUrls: Set<string>;
  offers: CandidateOffer[];
}

const BRANDED_NAME_PATTERN =
  /\b(clarifyx|folligen|inferno|metaforge|nostridamus|trinity|thermogenix|peak power|radi-?8|illuminate|glow|syn)\b/i;
const PEPTIDE_LIKE_PATTERN =
  /\b(retatrutide|tirzepatide|cagrilintide|cjc|ipamorelin|sermorelin|melanotan|ghk|kpv|foxo4|ll-?37|bpc-?157|tb-?500|mk-\d+|snap-?\d+|nmn|nad|glutathione)\b/i;

function parseArgValue(args: string[], key: string): string | null {
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === `--${key}`) {
      return args[index + 1] ?? null;
    }

    const prefix = `--${key}=`;
    if (token.startsWith(prefix)) {
      return token.slice(prefix.length);
    }
  }

  return null;
}

function timestampSlug(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function hasPeptideLikeSignal(value: string): boolean {
  if (!value) {
    return false;
  }

  if (PEPTIDE_LIKE_PATTERN.test(value)) {
    return true;
  }

  return /\b[a-z]{1,6}-\d{1,4}\b/i.test(value);
}

function collectSignals(compoundName: string, offers: CandidateOffer[]): CandidateSignals {
  const names = [compoundName, ...offers.map((offer) => offer.productName)];

  return {
    blendOrStackProduct: offers.some((offer) => isLikelyBlendOrStackProduct(offer.productName)),
    brandLikeName: names.some((name) => BRANDED_NAME_PATTERN.test(name)),
    peptideLikeName: names.some((name) => hasPeptideLikeSignal(name))
  };
}

function recommendationForSignals(signals: CandidateSignals): CandidateRecommendation {
  if (signals.blendOrStackProduct || (signals.brandLikeName && !signals.peptideLikeName)) {
    return "review_for_possible_exclusion";
  }

  return "keep_tracking_until_cross_vendor";
}

function renderSignals(signals: CandidateSignals): string {
  const enabled: string[] = [];
  if (signals.blendOrStackProduct) {
    enabled.push("blend/stack");
  }
  if (signals.brandLikeName) {
    enabled.push("brand-like");
  }
  if (signals.peptideLikeName) {
    enabled.push("peptide-like");
  }

  return enabled.length > 0 ? enabled.join(", ") : "none";
}

function buildMarkdown(report: {
  generatedAt: string;
  totals: {
    activeOfferCount: number;
    activeCompoundCount: number;
    singleVendorCompoundCount: number;
    singleVendorOfferCount: number;
  };
  candidates: CandidateRecord[];
}): string {
  const lines: string[] = [];
  lines.push("# Single-vendor Exclusion Audit");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push("This is a report-only audit. No exclusions were automatically applied.");
  lines.push("Every candidate remains tracked until a manual decision is recorded.");
  lines.push("");
  lines.push("## Summary");
  lines.push(`- Active offers scanned: ${report.totals.activeOfferCount}`);
  lines.push(`- Active compounds scanned: ${report.totals.activeCompoundCount}`);
  lines.push(`- Single-vendor compounds: ${report.totals.singleVendorCompoundCount}`);
  lines.push(`- Offers tied to single-vendor compounds: ${report.totals.singleVendorOfferCount}`);
  lines.push("");
  lines.push("## Manual Confirmation Gate");
  lines.push("- Confirm at least one independent second-vendor check was performed.");
  lines.push("- Confirm the name is not a valid peptide that is currently poorly named.");
  lines.push("- Record reviewer, timestamp, and rationale before any enforcement.");
  lines.push("");
  lines.push("## Candidate Overview");
  lines.push("| Compound | Vendor | Offers | Signals | Recommendation |");
  lines.push("| --- | --- | ---: | --- | --- |");
  for (const candidate of report.candidates) {
    lines.push(
      `| ${candidate.compoundName} (\`${candidate.compoundSlug}\`) | ${candidate.vendor.name} | ${candidate.offerCount} | ${renderSignals(candidate.signals)} | ${candidate.recommendation} |`
    );
  }
  lines.push("");
  lines.push("## Candidate Details");
  for (const candidate of report.candidates) {
    lines.push(`### ${candidate.compoundName} (\`${candidate.compoundSlug}\`)`);
    lines.push(`- Vendor: ${candidate.vendor.name}`);
    lines.push(`- Recommendation: ${candidate.recommendation}`);
    lines.push(`- Signals: ${renderSignals(candidate.signals)}`);
    lines.push("- Manual decision: `pending`");
    lines.push("- Offers:");
    for (const offer of candidate.offers) {
      lines.push(`  - ${offer.productName} (${formatUsd(offer.listPriceCents)}) - ${offer.productUrl}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function run(): Promise<void> {
  const outDirArg = parseArgValue(process.argv.slice(2), "out-dir");
  const outDir = outDirArg
    ? path.resolve(process.cwd(), outDirArg)
    : path.join(process.cwd(), "reports", "exclusion-audit");

  const rows = await sql<ActiveOfferRow[]>`
    select
      c.id as "compoundId",
      c.slug as "compoundSlug",
      c.name as "compoundName",
      v.id as "vendorId",
      v.slug as "vendorSlug",
      v.name as "vendorName",
      oc.product_name as "productName",
      oc.product_url as "productUrl",
      oc.list_price_cents as "listPriceCents",
      oc.last_seen_at as "lastSeenAt"
    from offers_current oc
    inner join compound_variants cv on cv.id = oc.variant_id
    inner join compounds c on c.id = cv.compound_id
    inner join vendors v on v.id = oc.vendor_id
    where oc.is_available = true
      and cv.is_active = true
      and c.is_active = true
      and v.is_active = true
    order by c.slug asc, v.slug asc, oc.product_name asc
  `;

  const buckets = new Map<string, CompoundBucket>();
  for (const row of rows) {
    const existing = buckets.get(row.compoundId);
    const bucket: CompoundBucket =
      existing ??
      (() => {
        const next: CompoundBucket = {
          compoundId: row.compoundId,
          compoundSlug: row.compoundSlug,
          compoundName: row.compoundName,
          vendors: new Map<string, { id: string; slug: string; name: string }>(),
          offerUrls: new Set<string>(),
          offers: []
        };
        buckets.set(row.compoundId, next);
        return next;
      })();

    if (!bucket.vendors.has(row.vendorId)) {
      bucket.vendors.set(row.vendorId, {
        id: row.vendorId,
        slug: row.vendorSlug,
        name: row.vendorName
      });
    }

    if (!bucket.offerUrls.has(row.productUrl)) {
      bucket.offerUrls.add(row.productUrl);
      bucket.offers.push({
        productName: row.productName,
        productUrl: row.productUrl,
        listPriceCents: row.listPriceCents,
        lastSeenAt: row.lastSeenAt
      });
    }
  }

  const candidates: CandidateRecord[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.vendors.size !== 1) {
      continue;
    }

    const vendor = Array.from(bucket.vendors.values())[0];
    const signals = collectSignals(bucket.compoundName, bucket.offers);
    const recommendation = recommendationForSignals(signals);
    const sortedOffers = [...bucket.offers].sort((left, right) =>
      left.productName.localeCompare(right.productName)
    );

    candidates.push({
      compoundId: bucket.compoundId,
      compoundSlug: bucket.compoundSlug,
      compoundName: bucket.compoundName,
      vendor,
      vendorCount: 1,
      offerCount: sortedOffers.length,
      recommendation,
      signals,
      manualDecision: {
        status: "pending",
        decidedBy: null,
        decidedAt: null,
        notes: ""
      },
      offers: sortedOffers
    });
  }

  candidates.sort((left, right) => {
    if (left.recommendation !== right.recommendation) {
      return left.recommendation === "review_for_possible_exclusion" ? -1 : 1;
    }
    return left.compoundSlug.localeCompare(right.compoundSlug);
  });

  const generatedAt = new Date().toISOString();
  const report = {
    generatedAt,
    totals: {
      activeOfferCount: rows.length,
      activeCompoundCount: buckets.size,
      singleVendorCompoundCount: candidates.length,
      singleVendorOfferCount: candidates.reduce((sum, candidate) => sum + candidate.offerCount, 0)
    },
    enforcement: {
      mode: "report_only",
      automaticEnforcement: false,
      manualConfirmationRequired: true,
      requiredChecks: [
        "second_vendor_check_complete",
        "not_a_valid_peptide_with_noisy_name",
        "reviewer_identity_and_timestamp_recorded"
      ]
    },
    candidates
  };

  await mkdir(outDir, { recursive: true });

  const stamp = timestampSlug(new Date());
  const jsonPath = path.join(outDir, `single-vendor-audit-${stamp}.json`);
  const mdPath = path.join(outDir, `single-vendor-audit-${stamp}.md`);
  const latestJsonPath = path.join(outDir, "single-vendor-audit-latest.json");
  const latestMdPath = path.join(outDir, "single-vendor-audit-latest.md");

  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, `${buildMarkdown(report)}\n`, "utf8");
  await writeFile(latestJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(latestMdPath, `${buildMarkdown(report)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        generatedAt,
        reportMode: "report_only",
        automaticEnforcement: false,
        manualConfirmationRequired: true,
        outDir,
        reportJsonPath: jsonPath,
        reportMarkdownPath: mdPath,
        latestJsonPath,
        latestMarkdownPath: latestMdPath,
        totals: report.totals
      },
      null,
      2
    )
  );
}

async function shutdown(): Promise<void> {
  await sql.end({ timeout: 5 }).catch(() => {});
}

run()
  .then(async () => {
    await shutdown();
  })
  .catch(async (error) => {
    console.error(error);
    await shutdown();
    process.exit(1);
  });
