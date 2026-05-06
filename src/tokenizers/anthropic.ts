import { countTokens as legacyCountTokens } from "@anthropic-ai/tokenizer";
import type { Tokenizer } from "../types.ts";

export function createAnthropicTokenizer(apiKey?: string): Tokenizer {
  if (!apiKey) {
    return {
      approximate: true,
      note: "Anthropic token count is approximate (Claude 2 BPE). Pass --anthropic-api-key for exact Claude 3+ counts.",
      count(text) {
        return legacyCountTokens(text);
      },
    };
  }

  let client: import("@anthropic-ai/sdk").default | null = null;
  return {
    approximate: false,
    note: "Anthropic token count via messages.count_tokens API.",
    async count(text, model) {
      if (!client) {
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        client = new Anthropic({ apiKey });
      }
      const res = await client.beta.messages.countTokens({
        model,
        messages: [{ role: "user", content: text }],
      });
      return res.input_tokens;
    },
  };
}
