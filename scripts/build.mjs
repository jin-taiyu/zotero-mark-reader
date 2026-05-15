import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const buildDir = join(root, "build");
const addonBuildDir = join(buildDir, "addon");
const distDir = join(root, "dist");
const xpiName = `${pkg.name}-${pkg.version}.xpi`;

async function main() {
  await rm(buildDir, { recursive: true, force: true });
  await mkdir(addonBuildDir, { recursive: true });
  await mkdir(distDir, { recursive: true });
  await cp(join(root, "addon"), addonBuildDir, { recursive: true });
  await cp(
    join(root, "src", "zotero-mark-reader.js"),
    join(addonBuildDir, "content", "scripts", "zotero-mark-reader.js"),
  );
  await copyKaTeX();

  const manifestPath = join(addonBuildDir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.version = pkg.version;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const xpiPath = join(distDir, xpiName);
  await rm(xpiPath, { force: true });
  const zip = spawnSync("zip", ["-qr", xpiPath, "."], {
    cwd: addonBuildDir,
    stdio: "inherit",
  });
  if (zip.status !== 0) {
    throw new Error("zip failed");
  }
  console.log(`Built ${xpiPath}`);
}

async function copyKaTeX() {
  const katexDist = join(root, "node_modules", "katex", "dist");
  const vendorDir = join(addonBuildDir, "vendor", "katex");
  await mkdir(vendorDir, { recursive: true });
  await cp(join(katexDist, "katex.min.js"), join(vendorDir, "katex.min.js"));
  await cp(join(katexDist, "katex.min.css"), join(vendorDir, "katex.min.css"));
  await cp(join(katexDist, "fonts"), join(vendorDir, "fonts"), {
    recursive: true,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
