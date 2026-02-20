import { describe, expect, it } from "vitest";

import { redactSensitiveData } from "@/lib/security/redaction";

describe("redactSensitiveData", () => {
  it("redacts sensitive keys recursively", () => {
    const payload = {
      safeModeBlockError: "HTTP 403",
      authorization: "Bearer abc.def.ghi",
      nested: {
        apiKey: "sk-test-secret-value",
        cookie: "session=abc123"
      }
    };

    const redacted = redactSensitiveData(payload);

    expect(redacted).toMatchObject({
      safeModeBlockError: "HTTP 403",
      authorization: "[REDACTED]",
      nested: {
        apiKey: "[REDACTED]",
        cookie: "[REDACTED]"
      }
    });
  });

  it("redacts sensitive token values embedded in strings", () => {
    const payload = {
      error:
        "fetch failed with Authorization: Bearer abcdef123456 and retry https://example.test/path?token=secret-token-value"
    };

    const redacted = redactSensitiveData(payload);

    expect(redacted.error).toContain("Bearer [REDACTED]");
    expect(redacted.error).toContain("token=[REDACTED]");
    expect(redacted.error).not.toContain("abcdef123456");
    expect(redacted.error).not.toContain("secret-token-value");
  });
});
