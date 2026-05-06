import Table from "cli-table3";
import pc from "picocolors";
import type { TallyResult } from "./types.ts";

const usd = (n: number) => `$${n.toFixed(n < 0.01 ? 6 : 4)}`;
const num = (n: number) => n.toLocaleString("en-US");

export function renderText(result: TallyResult, opts: { verbose: boolean }) {
  const { files, totalTokens, outputTokens, inputCostUsd, outputCostUsd, totalCostUsd, model, provider, pricing, warnings } = result;

  if (opts.verbose && files.length > 0) {
    const table = new Table({
      head: [pc.bold("File"), pc.bold("Bytes"), pc.bold("Tokens"), pc.bold("Input cost")],
      colAligns: ["left", "right", "right", "right"],
      style: { head: [], border: [] },
    });
    const sorted = [...files].sort((a, b) => b.tokens - a.tokens);
    for (const f of sorted) {
      table.push([f.path, num(f.bytes), num(f.tokens), usd(f.tokens * pricing.inputCostPerToken)]);
    }
    console.log(table.toString());
  }

  const summary = new Table({
    head: [pc.bold("Metric"), pc.bold("Value")],
    colAligns: ["left", "right"],
    style: { head: [], border: [] },
  });
  summary.push(
    ["Model", `${model} (${provider})`],
    ["Files scanned", num(files.length)],
    ["Total input tokens", num(totalTokens)],
    ["Estimated output tokens", num(outputTokens)],
    ["Input price / 1M tok", usd(pricing.inputCostPerToken * 1_000_000)],
    ["Output price / 1M tok", usd(pricing.outputCostPerToken * 1_000_000)],
    [pc.cyan("Input cost"), pc.cyan(usd(inputCostUsd))],
    [pc.cyan("Output cost"), pc.cyan(usd(outputCostUsd))],
    [pc.bold(pc.green("Total cost")), pc.bold(pc.green(usd(totalCostUsd)))],
  );
  console.log(summary.toString());

  for (const w of warnings) {
    console.error(pc.yellow(`⚠ ${w}`));
  }
}

export function renderJson(result: TallyResult): string {
  return JSON.stringify({
    model: result.model,
    provider: result.provider,
    files: result.files,
    totals: {
      files: result.files.length,
      inputTokens: result.totalTokens,
      outputTokens: result.outputTokens,
      inputCostUsd: result.inputCostUsd,
      outputCostUsd: result.outputCostUsd,
      totalCostUsd: result.totalCostUsd,
    },
    pricing: result.pricing,
    warnings: result.warnings,
  }, null, 2);
}
