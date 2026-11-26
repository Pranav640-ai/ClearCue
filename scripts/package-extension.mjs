import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Package the built extension (`dist/`) into a zip for manual loading.
 *
 * Development builds may inline a debug token from Vite's environment. Only
 * the dedicated release build marks its output as eligible for a release name.
 */
const require = createRequire(import.meta.url);
const { version } = require("../package.json");

const distUrl = new URL("../dist/", import.meta.url);
const artifactsUrl = new URL("../artifacts/", import.meta.url);
const distPath = path.resolve(fileURLToPath(distUrl));
const outDir = path.resolve(fileURLToPath(artifactsUrl));

const buildMarker = new URL("../dist/clearcue-build.json", import.meta.url);
const isRelease = existsSync(buildMarker) && JSON.parse(readFileSync(buildMarker, "utf8")).channel === "release";
const zipPath = `${outDir}/clearcue-${version}${isRelease ? "" : "-dev"}.zip`;

if (!existsSync(`${distPath}/manifest.json`) || !existsSync(`${distPath}/content.js`)) {
  console.error("The extension build is incomplete. Run `npm run build` first.");
  process.exit(1);
}

await mkdir(outDir, { recursive: true });
if (existsSync(zipPath)) await rm(zipPath);

function archiveWithZip() {
  execFileSync("zip", ["-r", "-q", zipPath, "."], { cwd: distPath });
}

function archiveWithBsdtar() {
  if (process.platform !== "win32") return false;
  const tarExe = String.raw`C:\Windows\System32\tar.exe`;
  if (!existsSync(tarExe)) return false;
  // bsdtar writes forward-slash entry names, unlike Compress-Archive.
  execFileSync(tarExe, ["-a", "-c", "-f", zipPath, "-C", distPath, "."]);
  return true;
}

function archiveWithPowerShell() {
  const ps = [
    "-NoProfile",
    "-Command",
    `Compress-Archive -Path '${distPath.replace(/\//g, "\\")}\\*' -DestinationPath '${zipPath.replace(/\//g, "\\")}' -Force`,
  ];
  execFileSync("powershell", ps, { stdio: "inherit" });
  console.warn("[ClearCue] This host's archive tool may store backslash paths; verify:artifacts reports it.");
}

try {
  archiveWithZip();
} catch {
  let archived = false;
  try {
    archived = archiveWithBsdtar();
  } catch {
    archived = false;
  }
  if (!archived) archiveWithPowerShell();
}

console.log(`Created ${zipPath}`);
if (!isRelease) {
  console.log("[ClearCue] Development archive: may contain a build-time App Check debug token. Do not publish it.");
}
