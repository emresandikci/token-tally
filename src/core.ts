import { readFile } from "node:fs/promises";
import { cpus } from "node:os";
import pLimit from "p-limit";
import { scan, type ScanOptions } from "./scanner.ts";
import { resolveModel } from "./pricing/resolver.ts";
import {
  resolveTokenizer,
  type ResolveTokenizerOptions,
} from "./tokenizers/index.ts";
import type { FileTokenResult, TallyResult } from "./types.ts";

export interface TallyOptions extends ScanOptions, ResolveTokenizerOptions {
  model: string;
  outputTokens?: number;
  concurrency?: number;
  warnContext?: boolean;
  fileHeaders?: boolean;
  onProgress?: (done: number, total: number) => void;
}

export async function tally(opts: TallyOptions): Promise<TallyResult> {
  const { resolvedModel, pricing } = resolveModel(opts.model);
  const tokenizer = await resolveTokenizer(pricing.provider, opts);
  const files = await scan(opts);

  const concurrency =
    opts.concurrency ?? Math.max(2, Math.min(8, cpus().length));
  const limit = pLimit(concurrency);
  let done = 0;

  const results: FileTokenResult[] = await Promise.all(
    files.map((f) =>
      limit(async () => {
        let text: string;
        try {
          text = await readFile(f.absolutePath, "utf8");
        } catch {
          // unreadable or binary — skip silently
          done += 1;
          opts.onProgress?.(done, files.length);
          return { path: f.relativePath, bytes: f.bytes, tokens: 0 };
        }
        // heuristic binary check: null bytes indicate non-text content
        if (text.includes("\0")) {
          done += 1;
          opts.onProgress?.(done, files.length);
          return { path: f.relativePath, bytes: f.bytes, tokens: 0 };
        }
        const content = opts.fileHeaders
          ? `# file: ${f.relativePath}\n${text}`
          : text;
        const tokens = await tokenizer.count(content, resolvedModel);
        done += 1;
        opts.onProgress?.(done, files.length);
        return { path: f.relativePath, bytes: f.bytes, tokens };
      }),
    ),
  );

  const totalTokens = results.reduce((s, r) => s + r.tokens, 0);
  // Default output tokens: 20% of input when not specified.
  // Typical LLM responses are 10–30% the size of the input context.
  const outputTokens =
    opts.outputTokens !== undefined
      ? opts.outputTokens
      : Math.round(totalTokens * 0.2);
  const inputCostUsd = totalTokens * pricing.inputCostPerToken;
  const outputCostUsd = outputTokens * pricing.outputCostPerToken;

  const warnings: string[] = [];
  if (tokenizer.approximate && tokenizer.note) {
    warnings.push(tokenizer.note);
  }
  if (
    opts.warnContext &&
    pricing.maxInputTokens &&
    totalTokens > pricing.maxInputTokens
  ) {
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
