import type { Provider, Tokenizer } from "../types.ts";
import { openaiTokenizer } from "./openai.ts";

export interface ResolveTokenizerOptions {
  anthropicApiKey?: string;
  geminiApiKey?: string;
}

export async function resolveTokenizer(
  provider: Provider,
  opts: ResolveTokenizerOptions = {},
): Promise<Tokenizer> {
  switch (provider) {
    case "openai":
      return openaiTokenizer;
    case "deepseek": {
      const { deepseekTokenizer } = await import("./deepseek.ts");
      return deepseekTokenizer;
    }
    case "anthropic": {
      const { createAnthropicTokenizer } = await import("./anthropic.ts");
      return createAnthropicTokenizer(opts.anthropicApiKey);
    }
    case "gemini": {
      const { createGeminiTokenizer } = await import("./gemini.ts");
      return createGeminiTokenizer(opts.geminiApiKey);
    }
    default:
      return openaiTokenizer;
  }
}
