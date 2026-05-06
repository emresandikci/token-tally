import { Command } from "commander";
import ora from "ora";
import pc from "picocolors";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { tally } from "./core.ts";
import { renderJson, renderText } from "./reporter.ts";
import { loadPriceTable } from "./pricing/loader.ts";

const program = new Command();

program
  .name("token-tally")
  .description("Scan a project, count LLM tokens, and estimate cost.")
  .argument("[path]", "directory to scan", ".")
  .option(
    "-m, --model <name>",
    "model id, e.g. gpt-4o, claude-3-5-sonnet-20241022",
  )
  .option("-i, --include <glob...>", "glob patterns to include")
  .option("-e, --exclude <glob...>", "glob patterns to exclude")
  .option("--no-gitignore", "do not honor .gitignore")
  .option("--max-files <n>", "cap on file count", (v) => parseInt(v, 10))
  .option(
    "--output-tokens <n>",
    "estimated output tokens for total cost (default: 20% of input)",
    (v) => parseInt(v, 10),
  )
  .option(
    "--budget <usd>",
    "fail with exit code 2 if total cost exceeds this USD amount",
    (v) => parseFloat(v),
  )
  .option(
    "--warn-context",
    "warn if total tokens exceed model context window",
    false,
  )
  .option("--json", "emit machine-readable JSON instead of a table", false)
  .option("-v, --verbose", "show per-file token breakdown", false)
  .option("--refresh", "force refresh of remote price table", false)
  .option(
    "--offline",
    "use cached/static prices only; never hit the network",
    false,
  )
  .option("--concurrency <n>", "parallel file workers", (v) => parseInt(v, 10))
  .option(
    "--file-headers",
    "prepend '# file: <path>' to each file before counting (accounts for prompt wrapper tokens)",
    false,
  )
  .option(
    "--anthropic-api-key <key>",
    "use Anthropic count_tokens API for exact Claude counts (env: ANTHROPIC_API_KEY)",
  )
  .option(
    "--gemini-api-key <key>",
    "use Gemini countTokens API for exact counts (env: GOOGLE_API_KEY)",
  )
  .version("0.1.0");

interface PromptOpts {
  model?: string;
  include?: string[];
  exclude?: string[];
  gitignore?: boolean;
  maxFiles?: number;
  outputTokens?: number;
  budget?: number;
  warnContext?: boolean;
  json?: boolean;
  verbose?: boolean;
  refresh?: boolean;
  offline?: boolean;
  concurrency?: number;
  fileHeaders?: boolean;
  anthropicApiKey?: string;
  geminiApiKey?: string;
}

function parseList(input: string): string[] | undefined {
  const items = input
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return items.length ? items : undefined;
}

async function askBoolean(
  ask: (prompt: string) => Promise<string>,
  label: string,
  current: boolean,
): Promise<boolean> {
  while (true) {
    const yPart = current ? pc.green("Y") : "y";
    const nPart = current ? "n" : pc.green("N");
    const answer = (await ask(`${label} [${yPart}/${nPart}]: `))
      .trim()
      .toLowerCase();
    if (!answer) return current;
    if (["y", "yes"].includes(answer)) return true;
    if (["n", "no"].includes(answer)) return false;
    console.error(pc.yellow("Please answer with y or n."));
  }
}

async function askOptionalNumber(
  ask: (prompt: string) => Promise<string>,
  label: string,
  current: number | undefined,
): Promise<number | undefined> {
  while (true) {
    const suffix =
      current === undefined
        ? ` [${pc.dim("none")}]`
        : ` [${pc.green(String(current))}]`;
    const raw = (await ask(`${label}${suffix}: `)).trim();
    if (!raw) return current;
    const n = Number(raw);
    if (!Number.isNaN(n)) return n;
    console.error(pc.yellow("Please enter a valid number."));
  }
}

async function askOptionalText(
  ask: (prompt: string) => Promise<string>,
  label: string,
  current?: string,
): Promise<string | undefined> {
  const suffix = current ? ` [${pc.green(current)}]` : ` [${pc.dim("none")}]`;
  const raw = (await ask(`${label}${suffix}: `)).trim();
  return raw || current;
}

const PAGE_SIZE = 16;

async function pickModel(models: string[], current?: string): Promise<string> {
  const sorted = [...models].sort((a, b) => a.localeCompare(b));
  let filter = "";
  let filtered = sorted;
  let cursor = current ? Math.max(0, sorted.indexOf(current)) : 0;
  let scroll = 0;
  let renderedLines = 0;

  const recompute = () => {
    const tokens = filter.toLowerCase().split(/\s+/).filter(Boolean);
    filtered = tokens.length
      ? sorted.filter((m) => tokens.every((t) => m.toLowerCase().includes(t)))
      : sorted;
    if (cursor >= filtered.length) cursor = Math.max(0, filtered.length - 1);
    if (cursor < scroll) scroll = cursor;
    if (cursor >= scroll + PAGE_SIZE) scroll = cursor - PAGE_SIZE + 1;
  };

  const render = () => {
    if (renderedLines > 0)
      process.stderr.write(`\x1b[${renderedLines}A\x1b[0J`);
    const lines: string[] = [];

    const filterLabel = filter
      ? `${pc.bold("Search:")} ${pc.green(filter)}█`
      : `${pc.bold("Search:")} ${pc.dim("(type to filter)")}`;
    lines.push(`  ${filterLabel}`);
    lines.push("");

    const page = filtered.slice(scroll, scroll + PAGE_SIZE);
    for (let i = 0; i < page.length; i++) {
      const m = page[i]!;
      const isActive = scroll + i === cursor;
      const isCurrent = m === current;
      const tag = isCurrent ? pc.dim(" ← default") : "";
      lines.push(
        isActive
          ? `  ${pc.green("›")} ${pc.bold(pc.green(m))}${tag}`
          : `    ${pc.dim(m)}${tag}`,
      );
    }

    if (filtered.length === 0) {
      lines.push(pc.yellow("  No models match."));
    } else if (filtered.length > PAGE_SIZE) {
      lines.push(
        pc.dim(
          `  — ${scroll + 1}–${Math.min(scroll + PAGE_SIZE, filtered.length)} / ${filtered.length} —`,
        ),
      );
    }

    lines.push("");
    lines.push(
      pc.dim("  ↑/↓  navigate   Enter  select   Backspace  delete char"),
    );

    process.stderr.write(lines.join("\n"));
    renderedLines = lines.length;
  };

  return new Promise((resolve) => {
    recompute();
    render();

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onKey);
    };

    const onKey = (key: string) => {
      if (key === "\x03") {
        cleanup();
        process.exit(1);
      }

      if (key === "\r" || key === "\n") {
        const chosen = filtered[cursor];
        if (!chosen) return;
        cleanup();
        process.stderr.write(`\n\n`);
        resolve(chosen);
        return;
      }

      if (key === "\x1b[A") {
        cursor = Math.max(0, cursor - 1);
        if (cursor < scroll) scroll = cursor;
      } else if (key === "\x1b[B") {
        cursor = Math.min(filtered.length - 1, cursor + 1);
        if (cursor >= scroll + PAGE_SIZE) scroll = cursor - PAGE_SIZE + 1;
      } else if (key === "\x7f" || key === "\x08") {
        filter = filter.slice(0, -1);
        cursor = 0;
        scroll = 0;
        recompute();
      } else if (key.length === 1 && key >= " ") {
        filter += key;
        cursor = 0;
        scroll = 0;
        recompute();
      }

      render();
    };

    process.stdin.on("data", onKey);
  });
}

async function collectInteractiveInputs(
  pathArg: string,
  opts: PromptOpts,
  models: string[],
) {
  console.error(pc.cyan("\nInteractive mode: press Enter to keep defaults.\n"));

  console.error(pc.bold("Model — select the LLM to cost-estimate against:"));
  const model = await pickModel(models, opts.model);
  console.error(`  ${pc.green("✓")} ${pc.bold(model)}\n`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (prompt: string) => rl.question(prompt);

  try {
    const enteredPath = (
      await ask(`Path to scan [${pc.green(pathArg || ".")}]: `)
    ).trim();
    const nextPath = enteredPath || pathArg || ".";
    const includeRaw = await askOptionalText(
      ask,
      "Include globs — only scan matching files (comma-separated)",
      opts.include?.join(", "),
    );
    const excludeRaw = await askOptionalText(
      ask,
      "Exclude globs — skip matching files (comma-separated)",
      opts.exclude?.join(", "),
    );

    const gitignore = await askBoolean(
      ask,
      "Respect .gitignore — skip files listed in .gitignore",
      opts.gitignore !== false,
    );
    const maxFiles = await askOptionalNumber(
      ask,
      "Max files — cap on total files scanned",
      opts.maxFiles,
    );
    const outputTokens = await askOptionalNumber(
      ask,
      "Output tokens — estimated output tokens (default: 20% of input)",
      opts.outputTokens,
    );
    const budget = await askOptionalNumber(
      ask,
      "Budget USD — exit with code 2 if cost exceeds this amount",
      opts.budget,
    );
    const warnContext = await askBoolean(
      ask,
      "Warn context — warn if tokens exceed model context window",
      Boolean(opts.warnContext),
    );
    const json = await askBoolean(
      ask,
      "JSON output — emit machine-readable JSON instead of table",
      Boolean(opts.json),
    );
    const verbose = await askBoolean(
      ask,
      "Verbose — show per-file token breakdown",
      Boolean(opts.verbose),
    );
    const refresh = await askBoolean(
      ask,
      "Refresh prices — force refetch of remote price table",
      Boolean(opts.refresh),
    );
    const offline = await askBoolean(
      ask,
      "Offline — use cached/static prices, skip network",
      Boolean(opts.offline),
    );
    const concurrency = await askOptionalNumber(
      ask,
      "Concurrency — parallel file workers",
      opts.concurrency,
    );
    const anthropicApiKey = await askOptionalText(
      ask,
      "Anthropic API key — exact Claude token counts via API",
      opts.anthropicApiKey,
    );
    const geminiApiKey = await askOptionalText(
      ask,
      "Gemini API key — exact Gemini token counts via API",
      opts.geminiApiKey,
    );
    const fileHeaders = await askBoolean(
      ask,
      "File headers — prepend '# file: <path>' to each file (models prompt wrapper tokens)",
      Boolean(opts.fileHeaders),
    );

    return {
      pathArg: nextPath,
      opts: {
        ...opts,
        model,
        include: includeRaw ? parseList(includeRaw) : opts.include,
        exclude: excludeRaw ? parseList(excludeRaw) : opts.exclude,
        gitignore,
        maxFiles,
        outputTokens,
        budget,
        warnContext,
        json,
        verbose,
        refresh,
        offline,
        concurrency,
        fileHeaders,
        anthropicApiKey,
        geminiApiKey,
      } satisfies PromptOpts,
    };
  } finally {
    rl.close();
  }
}

program.parseAsync(process.argv).then(async () => {
  let opts = program.opts<PromptOpts>();
  let [pathArg = "."] = program.args;
  const shouldPrompt =
    process.stdin.isTTY &&
    process.stdout.isTTY &&
    (process.argv.slice(2).length === 0 || !opts.model);

  let isJson = Boolean(opts.json);
  let spinner = isJson ? null : ora({ stream: process.stderr });

  try {
    spinner?.start("Loading model prices...");
    const initialLoad = await loadPriceTable({
      refresh: Boolean(opts.refresh),
      offline: Boolean(opts.offline),
    });

    if (shouldPrompt) {
      spinner?.stop();
      const prompted = await collectInteractiveInputs(
        pathArg,
        opts,
        Object.keys(initialLoad.table),
      );
      pathArg = prompted.pathArg;
      opts = prompted.opts;

      isJson = Boolean(opts.json);
      spinner = isJson ? null : ora({ stream: process.stderr });

      spinner?.start("Loading model prices...");
    }

    const load = await loadPriceTable({
      refresh: Boolean(opts.refresh),
      offline: Boolean(opts.offline),
    });

    if (!opts.model) {
      throw new Error(
        "Model is required. Provide --model <name> or run in interactive mode.",
      );
    }

    spinner?.start("Scanning files...");
    const result = await tally({
      cwd: pathArg,
      model: opts.model,
      include: opts.include,
      exclude: opts.exclude,
      respectGitignore: opts.gitignore !== false,
      maxFiles: opts.maxFiles,
      outputTokens: opts.outputTokens,
      concurrency: opts.concurrency,
      warnContext: Boolean(opts.warnContext),
      fileHeaders: Boolean(opts.fileHeaders),
      anthropicApiKey: opts.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY,
      geminiApiKey:
        opts.geminiApiKey ??
        process.env.GOOGLE_API_KEY ??
        process.env.GEMINI_API_KEY,
      onProgress: (done, total) => {
        if (spinner) spinner.text = `Tokenizing ${done}/${total}...`;
      },
    });
    spinner?.stop();

    result.warnings.unshift(...load.warnings);
    if (load.source === "static")
      result.warnings.push(
        "Price source: bundled static (limited model coverage).",
      );

    if (isJson) {
      console.log(renderJson(result));
    } else {
      renderText(result, { verbose: Boolean(opts.verbose) });
    }

    if (
      typeof opts.budget === "number" &&
      !Number.isNaN(opts.budget) &&
      result.totalCostUsd > opts.budget
    ) {
      console.error(
        pc.red(
          `✗ Cost $${result.totalCostUsd.toFixed(6)} exceeds budget $${opts.budget.toFixed(6)}`,
        ),
      );
      process.exit(2);
    }
  } catch (err) {
    spinner?.stop();
    const msg = err instanceof Error ? err.message : String(err);
    if (isJson) {
      console.log(JSON.stringify({ error: msg }));
    } else {
      console.error(pc.red(`Error: ${msg}`));
    }
    process.exit(1);
  }
});
