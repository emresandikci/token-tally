import { test, expect } from "bun:test";
import { openaiTokenizer } from "../src/tokenizers/openai.ts";
import { deepseekTokenizer } from "../src/tokenizers/deepseek.ts";

test("openai tokenizer counts deterministically for gpt-4o", async () => {
  const n = await openaiTokenizer.count("hello world", "gpt-4o");
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThan(10);
  expect(openaiTokenizer.approximate).toBe(false);
});

test("openai tokenizer falls back gracefully on unknown model id", async () => {
  const n = await openaiTokenizer.count("hello world", "made-up-model-id");
  expect(n).toBeGreaterThan(0);
});

test("deepseek tokenizer reports approximation note", async () => {
  expect(deepseekTokenizer.approximate).toBe(true);
  expect(deepseekTokenizer.note).toMatch(/cl100k_base/);
  const n = await deepseekTokenizer.count("hello world", "deepseek-chat");
  expect(n).toBeGreaterThan(0);
});
