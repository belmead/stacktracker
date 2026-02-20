export const SAFE_MODE_ACCESS_BLOCKED_MARKER = "safe_mode_access_blocked";
export const LEGACY_CLOUDFLARE_CHALLENGE_MARKER = "cloudflare_challenge_safe_mode";

export interface SafeModeAccessBlockDetails {
  provider: string;
  statusCode: number | null;
  cfRay: string | null;
}

interface SafeModeAccessBlockDetectionInput {
  statusCode: number;
  serverHeader: string;
  bodyText: string;
  cfRay: string | null;
}

function includesAny(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern));
}

function isCloudflareChallengeResponse(input: {
  serverHeader: string;
  bodyText: string;
  cfRay: string | null;
}): boolean {
  return (
    Boolean(input.cfRay) ||
    input.serverHeader.includes("cloudflare") ||
    includesAny(input.bodyText, [
      "/cdn-cgi/",
      "/cdn-cgi/challenge-platform/",
      "attention required",
      "just a moment",
      "cloudflare ray id"
    ])
  );
}

function isImpervaChallengeResponse(input: {
  serverHeader: string;
  bodyText: string;
}): boolean {
  return (
    input.serverHeader.includes("imperva") ||
    includesAny(input.bodyText, [
      "imperva",
      "incapsula",
      "_incapsula_resource",
      "request unsuccessful. incapsula incident id"
    ])
  );
}

function isAkamaiChallengeResponse(input: {
  serverHeader: string;
  bodyText: string;
}): boolean {
  return (
    input.serverHeader.includes("akamai") ||
    includesAny(input.bodyText, ["akamai", "reference #", "access denied"])
  );
}

function isDataDomeChallengeResponse(input: {
  serverHeader: string;
  bodyText: string;
}): boolean {
  return input.serverHeader.includes("datadome") || includesAny(input.bodyText, ["datadome"]);
}

export function detectSafeModeAccessBlockedResponse(
  input: SafeModeAccessBlockDetectionInput
): SafeModeAccessBlockDetails | null {
  const serverHeader = input.serverHeader.toLowerCase();
  const bodyText = input.bodyText.toLowerCase();
  const statusCode = input.statusCode;

  if (![401, 403, 429, 503].includes(statusCode)) {
    return null;
  }

  if (
    isCloudflareChallengeResponse({
      serverHeader,
      bodyText,
      cfRay: input.cfRay
    })
  ) {
    return {
      provider: "cloudflare",
      statusCode,
      cfRay: input.cfRay
    };
  }

  if (
    isImpervaChallengeResponse({
      serverHeader,
      bodyText
    })
  ) {
    return {
      provider: "imperva",
      statusCode,
      cfRay: input.cfRay
    };
  }

  if (
    isAkamaiChallengeResponse({
      serverHeader,
      bodyText
    })
  ) {
    return {
      provider: "akamai",
      statusCode,
      cfRay: input.cfRay
    };
  }

  if (
    isDataDomeChallengeResponse({
      serverHeader,
      bodyText
    })
  ) {
    return {
      provider: "datadome",
      statusCode,
      cfRay: input.cfRay
    };
  }

  if (statusCode === 401 || statusCode === 403) {
    return {
      provider: "unknown",
      statusCode,
      cfRay: input.cfRay
    };
  }

  return null;
}

export function formatSafeModeAccessBlockedError(input: {
  provider: string;
  statusCode: number;
  cfRay: string | null;
}): string {
  const parts = [SAFE_MODE_ACCESS_BLOCKED_MARKER, `provider=${input.provider}`, `status=${input.statusCode}`];

  if (input.provider === "cloudflare") {
    parts.push(LEGACY_CLOUDFLARE_CHALLENGE_MARKER);
  }

  if (input.cfRay) {
    parts.push(`cf-ray=${input.cfRay}`);
  }

  return `HTTP ${input.statusCode} (${parts.join("; ")})`;
}

export function parseSafeModeAccessBlockedError(errorMessage: string): SafeModeAccessBlockDetails | null {
  const message = errorMessage.toLowerCase();
  const hasNormalizedMarker = message.includes(SAFE_MODE_ACCESS_BLOCKED_MARKER);
  const hasLegacyCloudflareMarker = message.includes(LEGACY_CLOUDFLARE_CHALLENGE_MARKER);

  if (!hasNormalizedMarker && !hasLegacyCloudflareMarker) {
    return null;
  }

  const providerMatch = errorMessage.match(/provider=([a-z0-9_-]+)/i);
  let provider = providerMatch?.[1]?.toLowerCase() ?? "unknown";
  if (hasLegacyCloudflareMarker || message.includes("cloudflare")) {
    provider = "cloudflare";
  }

  const statusMatch = errorMessage.match(/status=(\d{3})/i) ?? errorMessage.match(/HTTP\s+(\d{3})/i);
  const parsedStatus = statusMatch ? Number.parseInt(statusMatch[1], 10) : Number.NaN;
  const cfRayMatch = errorMessage.match(/cf-ray=([a-z0-9-]+)/i);

  return {
    provider,
    statusCode: Number.isFinite(parsedStatus) ? parsedStatus : null,
    cfRay: cfRayMatch?.[1] ?? null
  };
}

export function formatSafeModeProviderLabel(provider: string | null): string {
  if (!provider) {
    return "unknown provider";
  }

  if (provider === "cloudflare") {
    return "Cloudflare";
  }

  return provider;
}
