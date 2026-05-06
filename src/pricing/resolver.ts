import type { ModelPricing, Provider } from "../types.ts";
import staticPrices from "./static.json" with { type: "json" };

type RawEntry = {
  inputCostPerToken: number;
  outputCostPerToken: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  provider: Provider;
};

type PriceTable = Record<string, ModelPricing>;

function loadStatic(): PriceTable {
  const out: PriceTable = {};
  for (const [k, v] of Object.entries(staticPrices)) {
    if (k.startsWith("_")) continue;
    out[k] = v as RawEntry;
  }
  return out;
}

let runtimeTable: PriceTable | null = null;

export function setPriceTable(table: PriceTable) {
  runtimeTable = table;
}

export function getPriceTable(): PriceTable {
  return runtimeTable ?? loadStatic();
}

export function resolveModel(modelInput: string): {
  resolvedModel: string;
  pricing: ModelPricing;
} {
  const table = getPriceTable();

  if (table[modelInput]) {
    return { resolvedModel: modelInput, pricing: table[modelInput] };
  }

  const lower = modelInput.toLowerCase();
  for (const key of Object.keys(table)) {
    if (key.toLowerCase() === lower) {
      return { resolvedModel: key, pricing: table[key]! };
    }
  }

  const stripped = modelInput.replace(
    /^(openai|anthropic|google|gemini|deepseek)\//i,
    "",
  );
  if (table[stripped]) {
    return { resolvedModel: stripped, pricing: table[stripped] };
  }

  const candidates = Object.keys(table).filter(
    (k) => k.startsWith(stripped) || stripped.startsWith(k),
  );
  if (candidates.length > 0) {
    candidates.sort((a, b) => b.length - a.length);
    const best = candidates[0]!;
    return { resolvedModel: best, pricing: table[best]! };
  }

  throw new Error(
    `Unknown model "${modelInput}". Try one of: ${Object.keys(table).slice(0, 8).join(", ")}, ...`,
  );
}
