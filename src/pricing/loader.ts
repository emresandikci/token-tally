import type { ModelPricing } from "../types.ts";
import { setPriceTable } from "./resolver.ts";
import { fetchLiteLLMPrices } from "./fetcher.ts";
import { readCache, writeCache, isFresh } from "./cache.ts";
import staticPrices from "./static.json" with { type: "json" };

export interface LoadOptions {
  refresh?: boolean;
  offline?: boolean;
}

export type PriceTable = Record<string, ModelPricing>;

export interface LoadResult {
  table: PriceTable;
  source: "remote" | "cache-fresh" | "cache-stale" | "static";
  warnings: string[];
}

let memo: LoadResult | null = null;

function loadStaticTable(): PriceTable {
  const out: PriceTable = {};
  for (const [k, v] of Object.entries(staticPrices)) {
    if (k.startsWith("_")) continue;
    out[k] = v as ModelPricing;
  }
  return out;
}

function mergeStatic(table: PriceTable): PriceTable {
  const fallback = loadStaticTable();
  return { ...fallback, ...table };
}

export async function loadPriceTable(opts: LoadOptions = {}): Promise<LoadResult> {
  if (memo && !opts.refresh) return memo;

  const warnings: string[] = [];
  const cache = await readCache();

  if (opts.offline) {
    if (cache) {
      const result: LoadResult = {
        table: mergeStatic(cache.table),
        source: isFresh(cache) ? "cache-fresh" : "cache-stale",
        warnings: isFresh(cache) ? [] : ["Using stale cached prices (--offline)."],
      };
      apply(result);
      return result;
    }
    const result: LoadResult = {
      table: loadStaticTable(),
      source: "static",
      warnings: ["No price cache; falling back to bundled static prices (--offline)."],
    };
    apply(result);
    return result;
  }

  if (!opts.refresh && cache && isFresh(cache)) {
    const result: LoadResult = {
      table: mergeStatic(cache.table),
      source: "cache-fresh",
      warnings: [],
    };
    apply(result);
    return result;
  }

  try {
    const remote = await fetchLiteLLMPrices();
    await writeCache(remote, "litellm");
    const result: LoadResult = {
      table: mergeStatic(remote),
      source: "remote",
      warnings,
    };
    apply(result);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (cache) {
      const result: LoadResult = {
        table: mergeStatic(cache.table),
        source: "cache-stale",
        warnings: [`Remote price fetch failed (${msg}); using cached prices.`],
      };
      apply(result);
      return result;
    }
    const result: LoadResult = {
      table: loadStaticTable(),
      source: "static",
      warnings: [`Remote price fetch failed (${msg}); using bundled static prices.`],
    };
    apply(result);
    return result;
  }
}

function apply(result: LoadResult) {
  memo = result;
  setPriceTable(result.table);
}

export function resetLoaderForTests() {
  memo = null;
}
