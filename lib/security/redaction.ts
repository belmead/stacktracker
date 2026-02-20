const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|token|secret|password|api[_-]?key|access[_-]?key|session|credential)/i;

const SENSITIVE_VALUE_PATTERNS: Array<{ regex: RegExp; replacement: string }> = [
  {
    regex: /\bBearer\s+[A-Za-z0-9._-]{8,}\b/gi,
    replacement: "Bearer [REDACTED]"
  },
  {
    regex: /\b(sk|rk)-[A-Za-z0-9]{10,}\b/g,
    replacement: "[REDACTED]"
  },
  {
    regex: /([?&](?:token|key|api_key|apikey|access_token|auth)=)[^&#\s]+/gi,
    replacement: "$1[REDACTED]"
  }
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function redactSensitiveString(value: string): string {
  let redacted = value;
  for (const pattern of SENSITIVE_VALUE_PATTERNS) {
    redacted = redacted.replace(pattern.regex, pattern.replacement);
  }

  return redacted;
}

function sanitizeValue(value: unknown, key: string | null, seen: WeakSet<object>): unknown {
  if (typeof value === "string") {
    if (key && SENSITIVE_KEY_PATTERN.test(key)) {
      return "[REDACTED]";
    }

    return redactSensitiveString(value);
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (seen.has(value)) {
    return "[REDACTED]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, key, seen));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(entryKey)) {
      output[entryKey] = "[REDACTED]";
      continue;
    }

    output[entryKey] = sanitizeValue(entryValue, entryKey, seen);
  }

  return output;
}

export function redactSensitiveData<T>(value: T): T {
  return sanitizeValue(value, null, new WeakSet()) as T;
}
