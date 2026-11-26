import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Artifact verification.
 *
 * Proves, without ever printing a credential value, that:
 * - `.env` is not tracked and no tracked file contains the App Check debug token;
 * - build output and archives are untracked;
 * - development archives are clearly labelled and are refused as publishable;
 * - release archives contain no debug token.
 *
 * Exit codes: 0 = safe state, 1 = a token leaked into a tracked/releasable place.
 */

const root = process.cwd();
const envPath = path.join(root, ".env");
const distPath = path.join(root, "dist");
const artifactsPath = path.join(root, "artifacts");
const findings = [];
const checks = [];

function sh(command, args, options = {}) {
  return execFileSync(command, args, { cwd: root, encoding: "utf8", ...options });
}

function readToken() {
  if (!existsSync(envPath)) return null;
  const text = readFileSync(envPath, "utf8");
  const match = /^VITE_APPCHECK_DEBUG_TOKEN\s*=\s*(.+)$/m.exec(text);
  const value = match?.[1]?.trim().replace(/^["']|["']$/g, "");
  return value && value.length >= 8 ? value : null;
}

async function walkFiles(dir, base = dir) {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walkFiles(full, base)));
    else files.push(full);
  }
  return files;
}

function looksTextual(buffer) {
  return !buffer.subarray(0, 4096).includes(0);
}

const token = readToken();
const buildMarker = path.join(distPath, "clearcue-build.json");
const isRelease = existsSync(buildMarker) && JSON.parse(readFileSync(buildMarker, "utf8")).channel === "release";
checks.push({ name: "debug token present in local .env", pass: token !== null, detail: token ? "present" : "not configured" });

// 1. Tracked files must never contain the token or the .env file.
let trackedFiles = [];
try {
  const output = sh("git", ["ls-files", "-z"]);
  trackedFiles = output.split("\0").filter(Boolean);
} catch {
  findings.push("git ls-files failed; tracked-file scan could not run.");
}
const envTracked = trackedFiles.some((file) => file === ".env" || file.endsWith("/.env"));
checks.push({ name: ".env is not tracked by git", pass: !envTracked, detail: `${trackedFiles.length} tracked files scanned` });
if (envTracked) findings.push(".env is tracked by git.");

let trackedTokenFiles = [];
if (token) {
  for (const file of trackedFiles) {
    const full = path.join(root, file);
    if (!existsSync(full)) continue;
    const info = await stat(full);
    if (!info.isFile() || info.size > 4_000_000) continue;
    const buffer = await readFile(full);
    if (!looksTextual(buffer)) continue;
    if (buffer.includes(token)) trackedTokenFiles.push(file);
  }
}
checks.push({
  name: "no tracked file contains the debug token",
  pass: trackedTokenFiles.length === 0,
  detail: trackedTokenFiles.length === 0 ? "clean" : `${trackedTokenFiles.length} file(s) contain it`,
});
if (trackedTokenFiles.length > 0) findings.push(`Tracked files contain the debug token: ${trackedTokenFiles.join(", ")}`);

// 2. Build output and archives must be ignored and untracked.
const ignoreTargets = [".env", "dist/", "artifacts/", ".playwright-smoke-profile/", "dist-test/"];
for (const target of ignoreTargets) {
  let ignored = false;
  try {
    sh("git", ["check-ignore", "-q", target]);
    ignored = true;
  } catch {
    ignored = false;
  }
  checks.push({ name: `${target} is gitignored`, pass: ignored, detail: ignored ? "ignored" : "NOT ignored" });
  if (!ignored) findings.push(`${target} is not gitignored.`);
}

const trackedBuildFiles = trackedFiles.filter(
  (file) => file.startsWith("dist/") || file.startsWith("dist-test/") || file.startsWith("artifacts/") || file.startsWith(".playwright-smoke-profile/"),
);
checks.push({
  name: "build output is untracked",
  pass: trackedBuildFiles.length === 0,
  detail: trackedBuildFiles.length === 0 ? "clean" : trackedBuildFiles.join(", "),
});
if (trackedBuildFiles.length > 0) findings.push(`Build output is tracked: ${trackedBuildFiles.join(", ")}`);

// 3. Development dist: the token may legitimately be inlined, but the build is dev-only.
let distTokenFiles = [];
for (const file of await walkFiles(distPath)) {
  const buffer = await readFile(file);
  if (!looksTextual(buffer)) continue;
  if (token && buffer.includes(token)) {
    distTokenFiles.push(path.relative(root, file));
  }
}
checks.push({
  name: "dist debug token is confined to a development build",
  pass: !isRelease || distTokenFiles.length === 0,
  detail: distTokenFiles.length === 0 ? "dist contains no match for the configured debug token" : `${distTokenFiles.length} dev file(s) contain it: ${distTokenFiles.join(", ")}`,
});
if (isRelease && distTokenFiles.length > 0) findings.push("The release build contains the configured debug token.");
const distChannel = isRelease ? "release" : "development";

// 4. Archives: classify dev vs publishable, and inspect contents.
const archives = existsSync(artifactsPath)
  ? (await readdir(artifactsPath)).filter((name) => name.endsWith(".zip"))
  : [];
const archiveResults = [];

for (const name of archives) {
  const archivePath = path.join(artifactsPath, name);
  const labelIsDev = /-dev\.zip$/.test(name);
  const useTar = process.platform === "win32";
  const archiveTool = useTar ? "tar.exe" : "unzip";
  let entries = [];
  try {
    entries = sh(archiveTool, [useTar ? "-tf" : "-Z1", archivePath], {
      stdio: ["ignore", "pipe", "ignore"],
    }).split(/\r?\n/).filter(Boolean);
  } catch {
    archiveResults.push({ name, entries: 0, tokenEntries: [], classification: "unverified", reason: "archive listing failed" });
    findings.push(`${name} could not be listed.`);
    continue;
  }

  const tokenEntries = [];
  const required = ["manifest.json", "content.js", "background.js", "panel.html", "diagnostics.html", "practice.html", "LICENSE", "THIRD_PARTY_NOTICES.txt"];
  const entryPaths = new Set(entries.map((entry) => entry.replace(/\\/g, "/").replace(/^\.\//, "")));
  if (!labelIsDev && required.some((file) => !entryPaths.has(file))) findings.push(name + " is missing required release members.");
  for (const entry of entries) {
    const normalized = entry.replace(/\\/g, "/").replace(/^\.\//, "");
    if (!labelIsDev && (/^(?:\/|[A-Za-z]:)/.test(normalized) ||
      normalized.split("/").some((part) => part === ".." || /^\.(env|git)(\.|$)/i.test(part)) ||
      /\.(pem|p12|pfx|key)$/i.test(normalized))) {
      findings.push(name + " contains a prohibited archive path.");
    }
    if (entry.endsWith("/")) continue;
    let content;
    try {
      content = sh(archiveTool, useTar ? ["-xOf", archivePath, "--", entry] : ["-p", archivePath, entry], { encoding: "buffer", maxBuffer: 16 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      findings.push(name + " contains an unreadable archive member.");
      continue;
    }
    if (token && content.includes(token)) tokenEntries.push(entry.replace(/\\/g, "/"));
  }

  let classification;
  if (tokenEntries.length > 0) classification = "dev-only";
  else if (labelIsDev) classification = "dev-only";
  else classification = "publishable-candidate";
  archiveResults.push({ name, entries: entries.length, tokenEntries: tokenEntries.map((entry) => path.basename(entry)), classification });
  if (classification !== "publishable-candidate" && !labelIsDev) findings.push(`${name} contains a debug token but lacks the -dev suffix.`);
}

checks.push({
  name: "artifacts are classified and no publishable archive contains a token",
  pass: !findings.some((finding) => finding.includes(".zip")),
  detail: archiveResults.length === 0 ? "no archives present" : archiveResults.map((archive) => `${archive.name}=${archive.classification}`).join("; "),
});

const report = {
  verifiedAt: new Date().toISOString(),
  distChannel,
  tokenValue: "never printed or stored",
  checks,
  archives: archiveResults,
  findings,
  verdict: findings.length === 0 ? "safe-local-only" : "action-required",
  releaseNote:
    "Release packaging still needs VITE_APPCHECK_CUSTOM_TOKEN_URL with a deployed custom token endpoint; until then no archive is releasable.",
};

await mkdir(artifactsPath, { recursive: true });
await writeFile(path.join(artifactsPath, "artifact-verification.json"), JSON.stringify(report, null, 2));

for (const check of checks) console.log(`${check.pass ? "PASS" : "FAIL"}  ${check.name} — ${check.detail}`);
for (const finding of findings) console.log(`NOTE  ${finding}`);
console.log(`Verdict: ${report.verdict} (dist channel: ${report.distChannel})`);

process.exit(findings.length === 0 ? 0 : 1);
