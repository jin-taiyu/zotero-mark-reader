import { readFile, readdir } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ignored = new Set([
  ".git",
  ".tools",
  "build",
  "dist",
  "node_modules",
  "output",
]);
const extensions = new Set([
  ".js",
  ".mjs",
  ".json",
  ".md",
  ".xhtml",
  ".css",
  ".svg",
]);
const jwtPattern = /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/;
const privateKeyPattern = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
let failures = 0;

async function walk(dir, files = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) {
      continue;
    }
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(path, files);
    } else if (extensions.has(extname(entry.name))) {
      files.push(path);
    }
  }
  return files;
}

for (const file of await walk(root)) {
  const content = await readFile(file, "utf8");
  if (jwtPattern.test(content) || privateKeyPattern.test(content)) {
    console.error(`Potential secret found in ${file}`);
    failures++;
  }
  if (/[ \t]+\n/.test(content)) {
    console.error(`Trailing whitespace found in ${file}`);
    failures++;
  }
}

if (failures) {
  process.exit(1);
}

console.log("Lint checks passed.");
