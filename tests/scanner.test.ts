import { test, expect } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { scan } from "../src/scanner.ts";

async function makeFixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "tt-scan-"));
  await mkdir(path.join(dir, "src"), { recursive: true });
  await mkdir(path.join(dir, "node_modules", "lib"), { recursive: true });
  await writeFile(path.join(dir, "src", "index.ts"), "export const x = 1;\n");
  await writeFile(path.join(dir, "src", "helper.py"), "x = 1\n");
  await writeFile(path.join(dir, "src", "skip.bin"), "binary");
  await writeFile(
    path.join(dir, "node_modules", "lib", "dep.js"),
    "module.exports = 1;",
  );
  await writeFile(path.join(dir, ".gitignore"), "secret.ts\n");
  await writeFile(path.join(dir, "secret.ts"), "leak");
  return dir;
}

test("scan picks code files, ignores node_modules and .gitignore", async () => {
  const dir = await makeFixture();
  try {
    const files = await scan({ cwd: dir });
    const names = files.map((f) => f.relativePath).sort();
    expect(names).toContain("src/index.ts");
    expect(names).toContain("src/helper.py");
    expect(names).not.toContain("src/skip.bin");
    expect(names.find((n) => n.includes("node_modules"))).toBeUndefined();
    expect(names).not.toContain("secret.ts");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("scan honors include + exclude globs", async () => {
  const dir = await makeFixture();
  try {
    const files = await scan({
      cwd: dir,
      include: ["src/**/*.ts"],
      exclude: ["**/helper.*"],
    });
    const names = files.map((f) => f.relativePath);
    expect(names).toEqual(["src/index.ts"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
