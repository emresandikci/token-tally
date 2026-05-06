import type { ModelPricing, Provider } from "../types.ts";

export const LITELLM_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

interface RawLiteLLMEntry {
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  max_input_tokens?: number;
  max_output_tokens?: number;
  max_tokens?: number;
  litellm_provider?: string;
  mode?: string;
}

function mapProvider(raw: string | undefined): Provider {
  if (!raw) return "unknown";
  const r = raw.toLowerCase();
  if (
    r.includes("openai") ||
    r === "azure" ||
    r.includes("azure_openai") ||
    r.includes("text-completion-openai")
  )
    return "openai";
  if (r.includes("anthropic")) return "anthropic";
  if (r.includes("gemini") || r.includes("vertex")) return "gemini";
  if (r.includes("deepseek")) return "deepseek";
  if (r.includes("bedrock")) return "anthropic";
  return "unknown";
}

export function transformLiteLLM(
  raw: Record<string, unknown>,
): Record<string, ModelPricing> {
  const out: Record<string, ModelPricing> = {};
  for (const [name, entryRaw] of Object.entries(raw)) {
    if (name === "sample_spec" || !entryRaw || typeof entryRaw !== "object")
      continue;
    const e = entryRaw as RawLiteLLMEntry;
    if (
      typeof e.input_cost_per_token !== "number" ||
      typeof e.output_cost_per_token !== "number"
    ) {
      continue;
    }
    if (e.mode && !["chat", "completion", "responses"].includes(e.mode))
      continue;
    out[name] = {
      inputCostPerToken: e.input_cost_per_token,
      outputCostPerToken: e.output_cost_per_token,
      maxInputTokens: e.max_input_tokens,
      maxOutputTokens: e.max_output_tokens ?? e.max_tokens,
      provider: mapProvider(e.litellm_provider),
    };
  }
  return out;
}

export async function fetchLiteLLMPrices(
  timeoutMs = 10_000,
): Promise<Record<string, ModelPricing>> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(LITELLM_URL, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`LiteLLM fetch failed: HTTP ${res.status}`);
    const json = (await res.json()) as Record<string, unknown>;
    return transformLiteLLM(json);
  } finally {
    clearTimeout(t);
  }
}
