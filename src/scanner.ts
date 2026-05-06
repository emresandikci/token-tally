import { globby } from "globby";
import { stat } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_EXTENSIONS = [
  "ts", "tsx", "js", "jsx", "mjs", "cjs",
  "py", "rb", "php", "go", "rs", "java", "kt", "scala", "swift",
  "c", "cc", "cpp", "h", "hh", "hpp", "cs",
  "html", "css", "scss", "sass", "less",
  "md", "mdx", "rst", "txt",
  "json", "yaml", "yml", "toml", "xml",
  "sh", "bash", "zsh", "fish",
  "sql", "graphql", "gql",
  "vue", "svelte", "astro",
];

export interface ScanOptions {
  cwd: string;
  include?: string[];
  exclude?: string[];
  respectGitignore?: boolean;
  extensions?: string[];
  maxFiles?: number;
}

export interface ScannedFile {
  absolutePath: string;
  relativePath: string;
  bytes: number;
}

export async function scan(opts: ScanOptions): Promise<ScannedFile[]> {
  const cwd = path.resolve(opts.cwd);
  const exts = opts.extensions ?? DEFAULT_EXTENSIONS;

  const patterns = opts.include && opts.include.length > 0
    ? opts.include
    : [`**/*.{${exts.join(",")}}`];

  const ignore = [
    "**/node_modules/**",
    "**/.git/**",
    "**/dist/**",
    "**/build/**",
    "**/.next/**",
    "**/.turbo/**",
    "**/coverage/**",
    "**/*.min.js",
    "**/*.min.css",
    "**/*.lock",
    "**/bun.lockb",
    "**/package-lock.json",
    "**/yarn.lock",
    "**/pnpm-lock.yaml",
    ...(opts.exclude ?? []),
  ];

  const paths = await globby(patterns, {
    cwd,
    absolute: true,
    gitignore: opts.respectGitignore !== false,
    ignore,
    dot: false,
    onlyFiles: true,
  });

  const limited = opts.maxFiles ? paths.slice(0, opts.maxFiles) : paths;

  const results: ScannedFile[] = [];
  for (const abs of limited) {
    const s = await stat(abs);
    results.push({
      absolutePath: abs,
      relativePath: path.relative(cwd, abs),
      bytes: s.size,
    });
  }
  return results;
}
