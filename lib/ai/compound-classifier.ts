import { z } from "zod";

import { env } from "@/lib/env";

export interface CompoundCandidate {
  id: string;
  slug: string;
  name: string;
}

export interface CompoundClassificationInput {
  rawName: string;
  productName: string;
  productUrl: string;
  vendorName: string;
  compounds: CompoundCandidate[];
}

export interface CompoundClassificationResult {
  decision: "match" | "skip" | "review";
  canonicalSlug: string | null;
  alias: string;
  confidence: number;
  reason: string;
}

const classificationSchema = z.object({
  decision: z.enum(["match", "skip", "review"]),
  canonical_slug: z.string().nullable(),
  alias: z.string().min(1),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1).max(200)
});

function buildPrompt(input: CompoundClassificationInput): string {
  const compounds = input.compounds.map((compound) => ({
    slug: compound.slug,
    name: compound.name
  }));

  return JSON.stringify(
    {
      task: "Classify a scraped product listing for a peptide price tracker.",
      rules: [
        "If this is clearly not a peptide product we track (site chrome/CTA text, accessories, bundles not representing a single compound), set decision='skip'.",
        "If it matches one tracked single-compound peptide, set decision='match' and canonical_slug to an allowed slug.",
        "If ambiguous, blended, stacked, or uncertain, set decision='review'.",
        "Alias should be a concise cleaned product phrase humans recognize.",
        "canonical_slug must be null unless decision='match'.",
        "Never invent slugs outside allowed_compounds."
      ],
      input: {
        raw_name: input.rawName,
        product_name: input.productName,
        product_url: input.productUrl,
        vendor_name: input.vendorName
      },
      allowed_compounds: compounds
    },
    null,
    2
  );
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }

  return text.trim();
}

function readMessageContent(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const choices = (payload as { choices?: unknown[] }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return null;
  }

  const message = choices[0] as { message?: { content?: unknown } };
  const content = message.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    for (const part of content) {
      if (part && typeof part === "object") {
        const text = (part as { text?: unknown }).text;
        if (typeof text === "string" && text.trim().length > 0) {
          return text;
        }
      }
    }
  }

  return null;
}

function readResponsesContent(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const outputText = (payload as { output_text?: unknown }).output_text;
  if (typeof outputText === "string" && outputText.trim().length > 0) {
    return outputText;
  }

  const output = (payload as { output?: unknown[] }).output;
  if (!Array.isArray(output)) {
    return null;
  }

  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const content = (item as { content?: unknown[] }).content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const part of content) {
      if (!part || typeof part !== "object") {
        continue;
      }

      const text = (part as { text?: unknown }).text;
      if (typeof text === "string" && text.trim().length > 0) {
        return text;
      }
    }
  }

  return null;
}

function classificationJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      decision: {
        type: "string",
        enum: ["match", "skip", "review"]
      },
      canonical_slug: {
        type: ["string", "null"]
      },
      alias: {
        type: "string"
      },
      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1
      },
      reason: {
        type: "string"
      }
    },
    required: ["decision", "canonical_slug", "alias", "confidence", "reason"]
  };
}

async function requestResponsesApi(input: CompoundClassificationInput, signal: AbortSignal): Promise<string | null> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: "You are a strict data-classification model. Output only valid JSON matching the schema." }]
        },
        {
          role: "user",
          content: [{ type: "input_text", text: buildPrompt(input) }]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "compound_classification",
          strict: true,
          schema: classificationJsonSchema()
        }
      }
    }),
    signal
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as unknown;
  return readResponsesContent(payload);
}

async function requestChatCompletionsApi(input: CompoundClassificationInput, signal: AbortSignal): Promise<string | null> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: "You are a strict data-classification model. Output only valid JSON matching the schema."
        },
        {
          role: "user",
          content: buildPrompt(input)
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "compound_classification",
          strict: true,
          schema: classificationJsonSchema()
        }
      }
    }),
    signal
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as unknown;
  return readMessageContent(payload);
}

export async function classifyCompoundAliasWithAi(input: CompoundClassificationInput): Promise<CompoundClassificationResult | null> {
  if (!env.OPENAI_API_KEY) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const rawContent = (await requestResponsesApi(input, controller.signal)) ?? (await requestChatCompletionsApi(input, controller.signal));
    if (!rawContent) {
      return null;
    }

    const parsedJson = JSON.parse(extractJson(rawContent)) as unknown;
    const parsed = classificationSchema.parse(parsedJson);

    return {
      decision: parsed.decision,
      canonicalSlug: parsed.canonical_slug,
      alias: parsed.alias.trim().slice(0, 120),
      confidence: parsed.confidence,
      reason: parsed.reason.trim()
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
