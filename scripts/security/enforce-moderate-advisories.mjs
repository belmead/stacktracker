#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const EXCEPTIONS_PATH = path.resolve(
  process.cwd(),
  "security/moderate-advisory-exceptions.json"
);

function fail(message) {
  console.error(`\n[security-policy] ${message}`);
  process.exit(1);
}

function runAuditJson(args, label) {
  const result = spawnSync("npm", ["audit", "--json", ...args], {
    encoding: "utf8"
  });

  if (result.error) {
    fail(`${label} failed to execute: ${result.error.message}`);
  }

  const rawOutput = (result.stdout || "").trim();
  if (!rawOutput) {
    fail(`${label} returned no JSON output`);
  }

  try {
    return JSON.parse(rawOutput);
  } catch (error) {
    const preview = rawOutput.slice(0, 500);
    fail(`${label} returned non-JSON output. Preview: ${preview}`);
  }
}

function readExceptions() {
  if (!fs.existsSync(EXCEPTIONS_PATH)) {
    fail(`Missing policy file: ${EXCEPTIONS_PATH}`);
  }

  try {
    const raw = fs.readFileSync(EXCEPTIONS_PATH, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    fail(`Unable to parse ${EXCEPTIONS_PATH}: ${error.message}`);
  }
}

function toViaList(via) {
  if (!Array.isArray(via)) {
    return [];
  }

  return via
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      if (item && typeof item === "object" && typeof item.name === "string") {
        return item.name;
      }

      return null;
    })
    .filter(Boolean);
}

function buildModerateList(auditReport) {
  const vulnerabilities = auditReport?.vulnerabilities ?? {};

  return Object.entries(vulnerabilities)
    .filter(([, details]) => details?.severity === "moderate")
    .map(([name, details]) => ({
      name,
      via: toViaList(details?.via),
      isDirect: Boolean(details?.isDirect),
      nodes: Array.isArray(details?.nodes) ? details.nodes : []
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildExceptionIndex(exceptions) {
  const index = new Map();

  for (const exception of exceptions) {
    if (!exception || typeof exception.package !== "string") {
      fail("Each exception entry must include a 'package' string field");
    }

    if (index.has(exception.package)) {
      fail(`Duplicate exception entry for package '${exception.package}'`);
    }

    if (!exception.owner || !exception.ticket || !exception.expiresOn) {
      fail(
        `Exception for '${exception.package}' must include owner, ticket, and expiresOn`
      );
    }

    index.set(exception.package, exception);
  }

  return index;
}

const fullAudit = runAuditJson([], "npm audit --json");
const moderateFindings = buildModerateList(fullAudit);
const exceptionConfig = readExceptions();
const exceptions = Array.isArray(exceptionConfig.exceptions)
  ? exceptionConfig.exceptions
  : [];
const exceptionIndex = buildExceptionIndex(exceptions);

const todayIso = new Date().toISOString().slice(0, 10);
const missingExceptions = [];
const expiredExceptions = [];
const trackedModerates = [];

for (const finding of moderateFindings) {
  const exception = exceptionIndex.get(finding.name);

  if (!exception) {
    missingExceptions.push(finding);
    continue;
  }

  if (exception.expiresOn < todayIso) {
    expiredExceptions.push({ finding, exception });
    continue;
  }

  trackedModerates.push({ finding, exception });
}

const moderateSet = new Set(moderateFindings.map((finding) => finding.name));
const staleExceptions = exceptions.filter(
  (exception) => !moderateSet.has(exception.package)
);

const totalModerate = fullAudit?.metadata?.vulnerabilities?.moderate ?? 0;

console.log("[security-policy] Moderate advisory policy check");
console.log(
  `[security-policy] totals: moderate=${totalModerate}, tracked=${trackedModerates.length}, missing=${missingExceptions.length}, expired=${expiredExceptions.length}`
);

if (trackedModerates.length > 0) {
  console.log("[security-policy] tracked moderates:");
  for (const { finding, exception } of trackedModerates) {
    console.log(
      `  - ${finding.name} (ticket=${exception.ticket}, owner=${exception.owner}, expiresOn=${exception.expiresOn}, scope=${exception.scope})`
    );
  }
}

if (staleExceptions.length > 0) {
  console.log("[security-policy] stale exceptions (safe to remove):");
  for (const exception of staleExceptions) {
    console.log(`  - ${exception.package} (ticket=${exception.ticket})`);
  }
}

if (missingExceptions.length > 0) {
  console.error("[security-policy] missing exception entries:");
  for (const finding of missingExceptions) {
    console.error(
      `  - ${finding.name} (via: ${finding.via.join(", ") || "n/a"}, direct=${finding.isDirect})`
    );
  }
}

if (expiredExceptions.length > 0) {
  console.error("[security-policy] expired exception entries:");
  for (const { finding, exception } of expiredExceptions) {
    console.error(
      `  - ${finding.name} expired on ${exception.expiresOn} (ticket=${exception.ticket}, owner=${exception.owner})`
    );
  }
}

if (missingExceptions.length > 0 || expiredExceptions.length > 0) {
  process.exit(1);
}

console.log("[security-policy] moderate advisory exceptions are valid");
