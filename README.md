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

- **Live pricing** — pulls the latest `model_prices_and_context_window.json` from [LiteLLM](https://github.com/BerriAI/litellm) on every run, cached locally for 24 h.
- **Provider-specific tokenizers** — exact counts for OpenAI (`js-tiktoken`), Anthropic (legacy BPE or `messages.count_tokens` API), and Gemini (`countTokens` API). DeepSeek uses `cl100k_base` as a close approximation.
- **`.gitignore`-aware scan** with sensible code-file defaults; opt-in `--include` / `--exclude` globs.
- **CI-friendly** — `--json` output, `--budget` exit code 2, `--offline` for hermetic runs.
- **Context-window guard** — `--warn-context` flags scans that exceed the model's `max_input_tokens`.

## Install

Run on demand:

```bash
npx token-tally <path> --model <model>
```

Or install globally:

```bash
npm i -g token-tally
token-tally . --model claude-3-5-sonnet-20241022
```

## Usage

```
token-tally [path] -m <model> [options]
```

Interactive wizard — lists all available models with ↑/↓ navigation and live search, then prompts for every option:

```bash
bun run src/cli.ts
```

### Options

| Flag | Default | Açıklama |
|---|---|---|
| `[path]` | `.` | Taranacak dizin. Belirtilmezse çalışma dizini (`.`) kullanılır. |
| `-m, --model <name>` | — | Kullanılacak LLM model kimliği. Fiyat ve tokenizer bu değere göre seçilir. Örn: `gpt-4o`, `claude-3-5-sonnet-20241022`. |
| `-i, --include <glob...>` | _(tüm kod dosyaları)_ | Yalnızca belirtilen glob kalıplarıyla eşleşen dosyaları tara. Birden fazla kalıp boşlukla ayrılarak verilebilir: `--include "src/**" "lib/**"`. |
| `-e, --exclude <glob...>` | _(varsayılan dışlamalar)_ | Belirtilen glob kalıplarıyla eşleşen dosyaları atla. Örn: `--exclude "**/*.test.ts"`. |
| `--no-gitignore` | _(gitignore aktif)_ | `.gitignore` dosyasındaki kurallar yok sayılır; normalde `.gitignore`'da listelenen dosyalar taramaya dahil edilmez. |
| `--max-files <n>` | _(sınırsız)_ | Taranan toplam dosya sayısını `n` ile sınırlar. Büyük projelerde hızlı ön tahmin için kullanışlıdır. |
| `--output-tokens <n>` | `0` | Modelin üreteceği tahmini çıktı token sayısı. Sıfır bırakılırsa yalnızca girdi maliyeti hesaplanır; tam bir istek maliyeti görmek için beklenen çıktı uzunluğunu girin. |
| `--budget <usd>` | _(kontrol yok)_ | Toplam maliyet bu USD eşiğini aşarsa program **exit code 2** ile çıkar. CI/CD pipeline'larında maliyet kapısı olarak kullanılır. |
| `--warn-context` | `false` | Toplam token sayısı modelin bağlam penceresini (`max_input_tokens`) aşıyorsa uyarı basar; tek API çağrısıyla göndermenin mümkün olmadığını gösterir. |
| `--json` | `false` | Tablo yerine makine tarafından okunabilir JSON çıktısı verir. CI entegrasyonları ve downstream araçlar için kullanışlıdır. |
| `-v, --verbose` | `false` | Her dosya için ayrı token sayısı ve boyut bilgisi içeren detaylı tabloyu gösterir. |
| `--refresh` | `false` | Uzak fiyat tablosunu (`LiteLLM`) zorunlu olarak yeniden indirir; 24 saatlik önbelleği atlar. |
| `--offline` | `false` | Ağa hiç çıkmadan yalnızca yerel önbellek veya paket içindeki statik fiyat tablosunu kullanır. Hava geçirmez derleme ortamları için uygundur. |
| `--concurrency <n>` | `min(8, cpu)` | Paralel dosya işçisi sayısı. Varsayılan, CPU çekirdeği sayısı ile 8'in küçüğüdür. Disk G/Ç darboğazlarında düşürmek faydalı olabilir. |
| `--anthropic-api-key <key>` | `$ANTHROPIC_API_KEY` | Anthropic `messages.count_tokens` API'sini kullanarak Claude 3+ için tam (yaklaşık değil) token sayısı alır. Anahtar belirtilmezse ortam değişkeninden okunur. |
| `--gemini-api-key <key>` | `$GOOGLE_API_KEY` | Google `countTokens` API'sini kullanarak Gemini modelleri için tam token sayısı alır. Anahtar belirtilmezse `GOOGLE_API_KEY` veya `GEMINI_API_KEY` ortam değişkeninden okunur. |

### Examples

Per-file breakdown:
```bash
npx token-tally src --model gpt-4o -v
```

CI gate (fail if total > 5 cents):
```bash
npx token-tally . --model gpt-4o --budget 0.05 --json
```

Force fresh prices and warn if the scan won't fit in one call:
```bash
npx token-tally . --model claude-3-5-sonnet-20241022 --refresh --warn-context
```

Hermetic build environment:
```bash
npx token-tally . --model gpt-4o --offline
```

Exact Claude counts (Claude 3+ uses a tokenizer not shipped offline):
```bash
ANTHROPIC_API_KEY=sk-... npx token-tally . --model claude-3-5-sonnet-20241022
```

### GitHub Actions snippet

```yaml
- name: Estimate LLM cost
  run: |
    npx token-tally . \
      --model gpt-4o \
      --budget 1.00 \
      --json > tally.json
    cat tally.json | jq '.totals'
```

## Accuracy

| Provider | Default | Exact mode | Notes |
|---|---|---|---|
| OpenAI | exact (`js-tiktoken`) | — | `o200k_base` for GPT-4o/o1/o3/o4/4.1/5; `cl100k_base` for older. |
| Anthropic | approx (Claude 2 BPE) | `--anthropic-api-key` | Legacy tokenizer drifts ~5–10% on Claude 3+; API call is exact. |
| Gemini | approx (`ceil(chars/4)`) | `--gemini-api-key` | No offline tokenizer ships from Google. |
| DeepSeek | approx (`cl100k_base`) | — | Official tokenizer is GPT-4-class; close but not identical. |

A warning prints whenever the count is approximate.

## How pricing works

On every run, `token-tally` fetches LiteLLM's community-maintained model price table and caches it at `~/.cache/token-tally/prices.json` for 24 hours. `--refresh` forces a refetch. `--offline` uses the cache (or a small bundled fallback) without hitting the network. If the network fetch fails, stale cache is used with a warning.

Costs are computed as `input_tokens × input_cost_per_token + output_tokens × output_cost_per_token`. Output tokens default to `0` (the most common use case is "how big is my prompt"). Pass `--output-tokens <n>` to model a complete request.

## Development

```bash
bun install
bun run src/cli.ts . --model gpt-4o
bun test
bun run build
```

## License

MIT
