import { test, expect } from "bun:test";
import { transformLiteLLM } from "../src/pricing/fetcher.ts";
import { resolveModel, setPriceTable } from "../src/pricing/resolver.ts";

test("transformLiteLLM strips sample_spec and maps fields", () => {
  const raw = {
    sample_spec: { foo: "bar" },
    "gpt-4o": {
      input_cost_per_token: 2.5e-6,
      output_cost_per_token: 1e-5,
      max_input_tokens: 128000,
      max_output_tokens: 16384,
      max_tokens: 16384,
      litellm_provider: "openai",
      mode: "chat",
    },
    "embedding-only": {
      input_cost_per_token: 1e-7,
      output_cost_per_token: 0,
      mode: "embedding",
    },
  };
  const out = transformLiteLLM(raw);
  expect(out["sample_spec"]).toBeUndefined();
  expect(out["gpt-4o"]).toBeDefined();
  expect(out["gpt-4o"]?.inputCostPerToken).toBe(2.5e-6);
  expect(out["gpt-4o"]?.provider).toBe("openai");
  expect(out["embedding-only"]).toBeUndefined();
});

test("resolver finds exact match", () => {
  setPriceTable({
    "gpt-4o": {
      inputCostPerToken: 2.5e-6,
      outputCostPerToken: 1e-5,
      provider: "openai",
    },
  });
  const r = resolveModel("gpt-4o");
  expect(r.resolvedModel).toBe("gpt-4o");
  expect(r.pricing.provider).toBe("openai");
});

test("resolver strips provider prefix", () => {
  setPriceTable({
    "claude-3-5-sonnet-20241022": {
      inputCostPerToken: 3e-6,
      outputCostPerToken: 1.5e-5,
      provider: "anthropic",
    },
  });
  const r = resolveModel("anthropic/claude-3-5-sonnet-20241022");
  expect(r.resolvedModel).toBe("claude-3-5-sonnet-20241022");
});

test("resolver throws on unknown model", () => {
  setPriceTable({
    "gpt-4o": {
      inputCostPerToken: 1e-6,
      outputCostPerToken: 1e-6,
      provider: "openai",
    },
  });
  expect(() => resolveModel("totally-nonexistent-zzz")).toThrow(
    /Unknown model/,
  );
});
