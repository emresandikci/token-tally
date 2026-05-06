import {
  encodingForModel,
  getEncoding,
  type Tiktoken,
  type TiktokenModel,
} from "js-tiktoken";
import type { Tokenizer } from "../types.ts";

const cache = new Map<string, Tiktoken>();

function getEncoder(model: string): Tiktoken {
  const cached = cache.get(model);
  if (cached) return cached;
  let enc: Tiktoken;
  try {
    enc = encodingForModel(model as TiktokenModel);
  } catch {
    enc = getEncoding(
      model.startsWith("gpt-4o") ||
        model.startsWith("o1") ||
        model.startsWith("o3") ||
        model.startsWith("o4") ||
        model.startsWith("gpt-4.1") ||
        model.startsWith("gpt-5")
        ? "o200k_base"
        : "cl100k_base",
    );
  }
  cache.set(model, enc);
  return enc;
}

export const openaiTokenizer: Tokenizer = {
  approximate: false,
  count(text, model) {
    return getEncoder(model).encode(text).length;
  },
};
