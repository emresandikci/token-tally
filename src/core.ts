import { readFile } from "node:fs/promises";
import { cpus } from "node:os";
import pLimit from "p-limit";
import { scan, type ScanOptions } from "./scanner.ts";
import { resolveModel } from "./pricing/resolver.ts";
import { resolveTokenizer, type ResolveTokenizerOptions } from "./tokenizers/index.ts";
import type { FileTokenResult, TallyResult } from "./types.ts";

export interface TallyOptions extends ScanOptions, ResolveTokenizerOptions {
  model: string;
  outputTokens?: number;
  concurrency?: number;
  warnContext?: boolean;
  onProgress?: (done: number, total: number) => void;
}

export async function tally(opts: TallyOptions): Promise<TallyResult> {
  const { resolvedModel, pricing } = resolveModel(opts.model);
  const tokenizer = await resolveTokenizer(pricing.provider, opts);
  const files = await scan(opts);

  const concurrency = opts.concurrency ?? Math.max(2, Math.min(8, cpus().length));
  const limit = pLimit(concurrency);
  let done = 0;

  const results: FileTokenResult[] = await Promise.all(
    files.map((f) =>
      limit(async () => {
        const text = await readFile(f.absolutePath, "utf8");
        const tokens = await tokenizer.count(text, resolvedModel);
        done += 1;
        opts.onProgress?.(done, files.length);
        return { path: f.relativePath, bytes: f.bytes, tokens };
      }),
    ),
  );

  const totalTokens = results.reduce((s, r) => s + r.tokens, 0);
  const outputTokens = opts.outputTokens ?? 0;
  const inputCostUsd = totalTokens * pricing.inputCostPerToken;
  const outputCostUsd = outputTokens * pricing.outputCostPerToken;

  const warnings: string[] = [];
  if (tokenizer.approximate && tokenizer.note) {
    warnings.push(tokenizer.note);
  }
  if (opts.warnContext && pricing.maxInputTokens && totalTokens > pricing.maxInputTokens) {
    warnings.push(
      `Total input tokens (${totalTokens.toLocaleString()}) exceed model context window (${pricing.maxInputTokens.toLocaleString()}). Single-call usage is impossible without splitting.`,
    );
  }

  return {
    model: resolvedModel,
    provider: pricing.provider,
    files: results,
    totalTokens,
    outputTokens,
    inputCostUsd,
    outputCostUsd,
    totalCostUsd: inputCostUsd + outputCostUsd,
    pricing,
    warnings,
  };
}
