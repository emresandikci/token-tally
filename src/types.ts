export type Provider =
  | "openai"
  | "anthropic"
  | "gemini"
  | "deepseek"
  | "unknown";

export interface ModelPricing {
  inputCostPerToken: number;
  outputCostPerToken: number;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  provider: Provider;
}

export interface FileTokenResult {
  path: string;
  bytes: number;
  tokens: number;
}

export interface TallyResult {
  model: string;
  provider: Provider;
  files: FileTokenResult[];
  totalTokens: number;
  outputTokens: number;
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  pricing: ModelPricing;
  warnings: string[];
}

export interface Tokenizer {
  count(text: string, model: string): Promise<number> | number;
  readonly approximate: boolean;
  readonly note?: string;
}
