import { getEncoding, type Tiktoken } from "js-tiktoken";
import type { Tokenizer } from "../types.ts";

let enc: Tiktoken | null = null;

export const deepseekTokenizer: Tokenizer = {
  approximate: true,
  note: "DeepSeek count uses cl100k_base BPE (GPT-4 family) — close approximation, not the official DeepSeek tokenizer.",
  count(text) {
    if (!enc) enc = getEncoding("cl100k_base");
    return enc.encode(text).length;
  },
};
