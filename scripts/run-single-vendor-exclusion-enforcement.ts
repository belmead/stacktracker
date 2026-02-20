import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { markVendorOffersUnavailableByUrls } from "@/lib/db/mutations";
import { sql } from "@/lib/db/client";

const manualDecisionSchema = z.object({
  status: z.string().min(1),
  decidedBy: z.string().nullable(),
  decidedAt: z.string().nullable(),
  notes: z.string().default("")
});

const candidateSchema = z.object({
  compoundSlug: z.string().min(1),
  compoundName: z.string().min(1),
  vendor: z.object({
    slug: z.string().min(1),
    name: z.string().min(1)
  }),
  recommendation: z.string().min(1),
  manualDecision: manualDecisionSchema,
  offers: z.array(
    z.object({
      productName: z.string().min(1),
      productUrl: z.string().url()
    })
  )
});

const reportSchema = z.object({
  generatedAt: z.string().datetime(),
  candidates: z.array(candidateSchema)
});

interface CompiledExclusionRule {
  productUrl: string;
  productName: string;
  compoundSlug: string;
  compoundName: string;
  vendorSlug: string;
  vendorName: string;
  reason: string;
  decidedBy: string;
  decidedAt: string;
  notes: string;
  isActive: boolean;
}

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

function hasFlag(args: string[], key: string): boolean {
  return args.includes(`--${key}`);
}

function resolvePath(inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.join(process.cwd(), inputPath);
}

function requireIsoTimestamp(value: string, label: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} must be a valid ISO timestamp; received "${value}"`);
  }

  return parsed.toISOString();
}

function buildReason(candidate: z.infer<typeof candidateSchema>): string {
  const note = candidate.manualDecision.notes.trim();
  if (note.length > 0) {
    return `manual_single_vendor_exclusion: ${note}`;
  }

  return `manual_single_vendor_exclusion: ${candidate.recommendation}`;
}

async function run(): Promise<void> {
  const args = process.argv.slice(2);
  const reportPath = resolvePath(
    parseArgValue(args, "report") ?? "reports/exclusion-audit/single-vendor-audit-latest.json"
  );
  const outputPath = resolvePath(
    parseArgValue(args, "output") ?? "config/manual-offer-exclusions.json"
  );
  const applyDb = hasFlag(args, "apply-db");
  const dryRun = hasFlag(args, "dry-run");

  const reportRaw = await readFile(reportPath, "utf8");
  const reportParsed = reportSchema.parse(JSON.parse(reportRaw));

  const approvedCandidates = reportParsed.candidates.filter(
    (candidate) => candidate.manualDecision.status === "approved_exclusion"
  );

  const rulesByUrl = new Map<string, CompiledExclusionRule>();
  for (const candidate of approvedCandidates) {
    if (!candidate.manualDecision.decidedBy || !candidate.manualDecision.decidedBy.trim()) {
      throw new Error(
        `Candidate "${candidate.compoundSlug}" is approved but missing manualDecision.decidedBy`
      );
    }

    if (!candidate.manualDecision.decidedAt || !candidate.manualDecision.decidedAt.trim()) {
      throw new Error(
        `Candidate "${candidate.compoundSlug}" is approved but missing manualDecision.decidedAt`
      );
    }

    const decidedAtIso = requireIsoTimestamp(
      candidate.manualDecision.decidedAt,
      `manualDecision.decidedAt for ${candidate.compoundSlug}`
    );
    const decidedBy = candidate.manualDecision.decidedBy.trim();
    const reason = buildReason(candidate);
    const notes = candidate.manualDecision.notes.trim();

    for (const offer of candidate.offers) {
      const existing = rulesByUrl.get(offer.productUrl);
      if (existing) {
        continue;
      }

      rulesByUrl.set(offer.productUrl, {
        productUrl: offer.productUrl,
        productName: offer.productName,
        compoundSlug: candidate.compoundSlug,
        compoundName: candidate.compoundName,
        vendorSlug: candidate.vendor.slug,
        vendorName: candidate.vendor.name,
        reason,
        decidedBy,
        decidedAt: decidedAtIso,
        notes,
        isActive: true
      });
    }
  }

  const rules = Array.from(rulesByUrl.values()).sort((left, right) => {
    if (left.vendorSlug !== right.vendorSlug) {
      return left.vendorSlug.localeCompare(right.vendorSlug);
    }

    if (left.compoundSlug !== right.compoundSlug) {
      return left.compoundSlug.localeCompare(right.compoundSlug);
    }

    return left.productUrl.localeCompare(right.productUrl);
  });

  const outputPayload = {
    updatedAt: new Date().toISOString(),
    sourceReportPath: reportPath,
    sourceReportGeneratedAt: reportParsed.generatedAt,
    exclusions: rules
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(outputPayload, null, 2)}\n`, "utf8");

  let deactivated = 0;
  let dbGroups = 0;
  const missingVendorSlugs: string[] = [];

  if (applyDb && rules.length > 0) {
    const vendorSlugs = Array.from(new Set(rules.map((rule) => rule.vendorSlug)));
    const vendorRows = await sql<{ id: string; slug: string }[]>`
      select id, slug
      from vendors
      where slug = any(${sql.array(vendorSlugs)}::text[])
    `;
    const vendorIdBySlug = new Map(vendorRows.map((row) => [row.slug, row.id]));

    const rulesByVendorSlug = new Map<string, string[]>();
    for (const rule of rules) {
      const list = rulesByVendorSlug.get(rule.vendorSlug) ?? [];
      list.push(rule.productUrl);
      rulesByVendorSlug.set(rule.vendorSlug, list);
    }

    for (const [vendorSlug, productUrls] of rulesByVendorSlug) {
      const vendorId = vendorIdBySlug.get(vendorSlug);
      if (!vendorId) {
        missingVendorSlugs.push(vendorSlug);
        continue;
      }

      dbGroups += 1;
      if (dryRun) {
        continue;
      }

      const count = await markVendorOffersUnavailableByUrls({
        vendorId,
        productUrls
      });
      deactivated += count;
    }
  }

  console.log(
    JSON.stringify(
      {
        reportPath,
        outputPath,
        approvedCandidateCount: approvedCandidates.length,
        compiledRuleCount: rules.length,
        applyDb,
        dryRun,
        dbGroups,
        deactivated,
        missingVendorSlugs
      },
      null,
      2
    )
  );
}

run()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 5 }).catch(() => {});
  });
