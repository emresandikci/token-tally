import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { ModelPricing } from "../types.ts";

export const CACHE_DIR = path.join(homedir(), ".cache", "token-tally");
export const CACHE_FILE = path.join(CACHE_DIR, "prices.json");
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface CachedPrices {
  fetchedAt: number;
  source: string;
  table: Record<string, ModelPricing>;
}

export async function readCache(): Promise<CachedPrices | null> {
  try {
    const buf = await readFile(CACHE_FILE, "utf8");
    const parsed = JSON.parse(buf) as CachedPrices;
    if (!parsed?.table || typeof parsed.fetchedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeCache(table: Record<string, ModelPricing>, source: string): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  const payload: CachedPrices = { fetchedAt: Date.now(), source, table };
  await writeFile(CACHE_FILE, JSON.stringify(payload), "utf8");
}

export function isFresh(cache: CachedPrices, ttlMs = CACHE_TTL_MS): boolean {
  return Date.now() - cache.fetchedAt < ttlMs;
}

export async function cacheExists(): Promise<boolean> {
  try {
    await stat(CACHE_FILE);
    return true;
  } catch {
    return false;
  }
}
