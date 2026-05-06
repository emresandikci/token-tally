# token-tally

Scan a project, count LLM tokens, and estimate cost — before you ship the call.

```bash
npx token-tally . --model gpt-4o
```

```
┌─────────────────────────┬─────────────────┐
│ Metric                  │           Value │
├─────────────────────────┼─────────────────┤
│ Model                   │ gpt-4o (openai) │
│ Files scanned           │              42 │
│ Total input tokens      │          18,204 │
│ Estimated output tokens │               0 │
│ Input price / 1M tok    │         $2.5000 │
│ Output price / 1M tok   │        $10.0000 │
│ Input cost              │         $0.0455 │
│ Output cost             │       $0.000000 │
│ Total cost              │         $0.0455 │
└─────────────────────────┴─────────────────┘
```

## Features

- **Live pricing** — fetches the latest model prices from [LiteLLM](https://github.com/BerriAI/litellm) on every run, cached locally for 24 hours.
- **Provider-aware tokenizers** — exact counts for OpenAI (`js-tiktoken`) and optionally for Anthropic and Gemini via their APIs. DeepSeek uses `cl100k_base` as a close approximation.
- **Interactive model picker** — run without arguments to launch a wizard with ↑/↓ navigation, live fuzzy search across all available models, and prompts for every option.
- **`.gitignore`-aware scanner** — skips ignored files by default; supports `--include` / `--exclude` globs across 40+ file extensions.
- **CI-friendly** — `--json` output, `--budget` exit code 2, `--offline` for hermetic builds.
- **Context window guard** — `--warn-context` flags when total tokens exceed the model's limit.

## Install

Run on demand (no install required):

```bash
npx token-tally . --model gpt-4o
```

Install globally:

```bash
npm i -g @emstack/token-tally
```

## Usage

### Non-interactive

```bash
token-tally [path] --model <model> [options]
```

### Interactive wizard

Run without a model to launch the interactive picker:

```bash
token-tally
# or during development:
bun run src/cli.ts
```

The wizard lists all available models with ↑/↓ navigation and live search, then prompts for every option — press Enter to accept the shown default.

## Options

| Flag | Default | Description |
|---|---|---|
| `[path]` | `.` | Directory to scan. Defaults to the current working directory. |
| `-m, --model <name>` | — | LLM model ID used for tokenization and pricing. e.g. `gpt-4o`, `claude-3-5-sonnet-20241022`. |
| `-i, --include <glob...>` | all code files | Glob patterns for files to include. Multiple patterns are space-separated. |
| `-e, --exclude <glob...>` | — | Glob patterns for files to skip. |
| `--no-gitignore` | gitignore respected | Disables `.gitignore` filtering. |
| `--max-files <n>` | unlimited | Caps the total number of files scanned. |
| `--output-tokens <n>` | 20% of input | Estimated output tokens to include in the total cost calculation. See [Output tokens](#output-tokens) below. |
| `--budget <usd>` | — | Exit with code `2` if total cost exceeds this USD amount. |
| `--warn-context` | `false` | Warn when total tokens exceed the model's `max_input_tokens`. |
| `--json` | `false` | Emit machine-readable JSON instead of a table. |
| `-v, --verbose` | `false` | Show a per-file token and cost breakdown. |
| `--refresh` | `false` | Force re-fetch of the remote price table, bypassing the 24-hour cache. |
| `--offline` | `false` | Use only the local cache or bundled static prices; never hit the network. |
| `--concurrency <n>` | `min(8, cpus)` | Number of parallel file workers. |
| `--anthropic-api-key <key>` | `$ANTHROPIC_API_KEY` | Use the Anthropic `messages.count_tokens` API for exact Claude 3+ counts. |
| `--gemini-api-key <key>` | `$GOOGLE_API_KEY` | Use the Google `countTokens` API for exact Gemini counts. |

### Output tokens

LLM APIs charge for both the tokens you send (input) and the tokens the model returns (output).
Because token-tally scans your source files statically, it cannot know how long the model's response will be.

When `--output-tokens` is not set, token-tally uses **20% of the total input token count** as a default estimate.
This is a conservative heuristic based on the observation that typical LLM responses are 10–30% the size of the input context.

Override it whenever you know your expected response length:

| Scenario | Suggested value |
|---|---|
| Quick summary or classification | `500–1 000` |
| Moderate answer with explanation | `2 000–4 000` |
| Long code generation / detailed analysis | `8 000–16 000` |
| Full context-window response | up to `max_output_tokens` of the model |

```bash
# use a fixed output token count
token-tally . --model claude-opus-4 --output-tokens 4000

# disable the output cost estimate entirely
token-tally . --model claude-opus-4 --output-tokens 0
```

## Examples

Per-file breakdown:

```bash
token-tally src --model gpt-4o -v
```

CI cost gate (fail if total exceeds $0.05):

```bash
token-tally . --model gpt-4o --budget 0.05 --json
```

Warn if the project won't fit in a single context window:

```bash
token-tally . --model claude-3-5-sonnet-20241022 --warn-context
```

Force-refresh prices and stay offline after:

```bash
token-tally . --model gpt-4o --refresh
token-tally . --model gpt-4o --offline
```

Exact token counts for Claude 3+ via API:

```bash
ANTHROPIC_API_KEY=sk-... token-tally . --model claude-3-5-sonnet-20241022
```

### GitHub Actions

```yaml
- name: Check token cost
  run: npx token-tally . --model gpt-4o --budget 1.00 --json > tally.json
```

## How it works

### 1 — Token counting

Each provider uses a different tokenization strategy.
The tool picks the right one automatically based on the model name.

**OpenAI** — exact via [`js-tiktoken`](https://github.com/dqbd/tiktoken)

The same BPE library OpenAI uses internally. The encoder is selected per model family:

| Model family | Encoder |
|---|---|
| `gpt-4o`, `o1`, `o3`, `o4`, `gpt-4.1`, `gpt-5` | `o200k_base` |
| `gpt-4`, `gpt-3.5`, older | `cl100k_base` |

Result matches the API token counter to the token.

**Anthropic** — approximate by default, exact with API key

Without a key, the legacy Claude 2 BPE tokenizer (`@anthropic-ai/tokenizer`) is used offline.
It was accurate for Claude 2, but drifts **~5–10%** on Claude 3+ because Anthropic updated their tokenizer.

```bash
# enable exact counting via the official API
ANTHROPIC_API_KEY=sk-... token-tally . --model claude-3-5-sonnet-20241022
```

**Gemini** — rough approximation by default, exact with API key

Google does not publish an offline tokenizer. The fallback formula is:

```
tokens ≈ ceil(characters / 4)
```

This holds reasonably for average English text (~4 chars/token) but can diverge by **±20–40%** on code, non-Latin scripts, or very short strings.

```bash
# enable exact counting via the Generative Language API
GOOGLE_API_KEY=... token-tally . --model gemini-1.5-pro
```

**DeepSeek** — close approximation

Uses `cl100k_base` (GPT-4 family BPE). DeepSeek's tokenizer is derived from the same family and produces near-identical results in practice, but it is not identical — expect **~2–5% drift**.

No API-based exact mode is available for DeepSeek.

A warning is printed in the output whenever counts are approximate.

### 2 — Pricing

On every run, token-tally fetches LiteLLM's community-maintained price table and caches it at `~/.cache/token-tally/prices.json` for 24 hours.

- `--refresh` forces a re-fetch.
- `--offline` skips the network entirely, using the cache or the bundled static fallback.
- If the network fetch fails, the stale cache is used with a warning.

Prices are taken directly from the `input_cost_per_token` and `output_cost_per_token` fields in the LiteLLM table — no rounding or transformation is applied.

### 3 — Cost formula

```
total = (input_tokens  × input_cost_per_token)
      + (output_tokens × output_cost_per_token)
```

Output tokens default to `0`. Pass `--output-tokens <n>` to include an expected response length in the estimate.

> **Note:** The formula does not account for system prompts billed separately, API call overhead, caching discounts, or streaming surcharges. Use it as a planning estimate, not a billing guarantee.

### Accuracy summary

| Provider | Token accuracy | How to get exact counts |
|---|---|---|
| OpenAI | **100% — exact** | Built-in, no key needed |
| Anthropic | **~90–95%** without key | Pass `--anthropic-api-key` |
| Gemini | **~60–80%** without key | Pass `--gemini-api-key` |
| DeepSeek | **~95–98%** | No exact mode available |

Pricing accuracy depends on LiteLLM's community table being up to date. Major models are typically current; niche or very new models may lag by a few days.

## Development

```bash
bun install          # install dependencies
bun run dev          # run CLI locally
bun test             # run tests
bun run typecheck    # TypeScript check
bun run lint         # ESLint
bun run build        # build dist/cli.js
```

## Community

- [CONTRIBUTING.md](CONTRIBUTING.md) — how to contribute
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — community standards
- [SECURITY.md](SECURITY.md) — reporting vulnerabilities
- [CHANGELOG.md](CHANGELOG.md) — release history

## License

MIT
