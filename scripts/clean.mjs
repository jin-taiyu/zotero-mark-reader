import { rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

await rm(join(root, "build"), { recursive: true, force: true });
await rm(join(root, "dist"), { recursive: true, force: true });
console.log("Cleaned build outputs.");
