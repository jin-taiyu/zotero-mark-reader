import { readdir } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const roots = ["addon", "scripts", "src"].map((name) => join(root, name));
const extensions = new Set([".js", ".mjs"]);

async function collect(dir, files = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (["node_modules", ".tools", "build", "dist"].includes(entry.name)) {
      continue;
    }
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collect(path, files);
    } else if (extensions.has(extname(entry.name))) {
      files.push(path);
    }
  }
  return files;
}

for (const dir of roots) {
  const files = await collect(dir);
  for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", file], {
      encoding: "utf8",
    });
    if (result.status !== 0) {
      process.stderr.write(result.stderr);
      process.exit(result.status);
    }
  }
}

console.log("JavaScript syntax checks passed.");
