import type { Tokenizer } from "../types.ts";

function approxCount(text: string): number {
  return Math.ceil(text.length / 4);
}

export function createGeminiTokenizer(apiKey?: string): Tokenizer {
  if (!apiKey) {
    return {
      approximate: true,
      note: "Gemini token count is approximated as ceil(chars/4). Pass --gemini-api-key for exact countTokens API results.",
      count(text) {
        return approxCount(text);
      },
    };
  }

  let client: import("@google/generative-ai").GoogleGenerativeAI | null = null;
  return {
    approximate: false,
    note: "Gemini token count via countTokens API.",
    async count(text, model) {
      if (!client) {
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        client = new GoogleGenerativeAI(apiKey);
      }
      try {
        const m = client.getGenerativeModel({ model });
        const res = await m.countTokens(text);
        return res.totalTokens;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(
          `⚠ Gemini API countTokens failed (${msg}); falling back to chars/4.\n`,
        );
        return approxCount(text);
      }
    },
  };
}
