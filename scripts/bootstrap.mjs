import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const toolsDir = join(root, ".tools");
const nodeDir = join(toolsDir, "node");
const npmPath = join(nodeDir, "bin", "npm");

const platformFiles = {
  darwin: {
    arm64: { token: "osx-arm64-tar", archive: "darwin-arm64" },
    x64: { token: "osx-x64-tar", archive: "darwin-x64" },
  },
  linux: {
    arm64: { token: "linux-arm64", archive: "linux-arm64" },
    x64: { token: "linux-x64", archive: "linux-x64" },
  },
};

async function exists(path) {
  try {
    await import("node:fs/promises").then((fs) => fs.access(path));
    return true;
  } catch {
    return false;
  }
}

async function download(url, destination) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }
  await mkdir(dirname(destination), { recursive: true });
  const file = createWriteStream(destination);
  await new Promise((resolveDownload, rejectDownload) => {
    response.body.pipeTo(
      new WritableStream({
        write(chunk) {
          file.write(Buffer.from(chunk));
        },
        close() {
          file.end(resolveDownload);
        },
        abort(error) {
          file.destroy(error);
          rejectDownload(error);
        },
      }),
    );
  });
}

async function main() {
  if (await exists(npmPath)) {
    console.log(`npm already available at ${npmPath}`);
    return;
  }

  const target = platformFiles[process.platform]?.[process.arch];
  if (!target) {
    throw new Error(`Unsupported platform: ${process.platform}/${process.arch}`);
  }

  const indexResponse = await fetch("https://nodejs.org/dist/index.json");
  if (!indexResponse.ok) {
    throw new Error(`Unable to query Node releases: ${indexResponse.status}`);
  }
  const releases = await indexResponse.json();
  const release = releases.find(
    (item) => item.lts && item.files.includes(target.token),
  );
  if (!release) {
    throw new Error(`No current LTS Node build found for ${target.token}`);
  }

  await mkdir(toolsDir, { recursive: true });
  const version = release.version;
  const archiveName = `node-${version}-${target.archive}.tar.xz`;
  const archivePath = join(toolsDir, archiveName);
  const extractedPath = join(toolsDir, `node-${version}-${target.archive}`);
  const archiveURL = `https://nodejs.org/dist/${version}/${archiveName}`;

  console.log(`Downloading ${archiveURL}`);
  await download(archiveURL, archivePath);

  await rm(extractedPath, { recursive: true, force: true });
  const tar = spawnSync("tar", ["-xJf", archivePath, "-C", toolsDir], {
    stdio: "inherit",
  });
  if (tar.status !== 0) {
    throw new Error("Failed to extract Node archive");
  }

  await rm(nodeDir, { recursive: true, force: true });
  await rename(extractedPath, nodeDir);
  await writeFile(
    join(toolsDir, "env"),
    `export PATH="${nodeDir}/bin:$PATH"\n`,
  );

  console.log(`Installed Node/npm under ${nodeDir}`);
  console.log(`Run: export PATH="${nodeDir}/bin:$PATH"`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
