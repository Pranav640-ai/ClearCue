import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Override every dotenv layer before Vite can substitute a debug credential.
// Use the ordinary build so the release also includes the content script.
const npmCli = process.env.npm_execpath;
if (!npmCli) {
  console.error("Run the release build with npm run build:release.");
  process.exit(1);
}

const result = spawnSync(process.execPath, [npmCli, "run", "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    VITE_BUILD_CHANNEL: "release",
    VITE_APPCHECK_DEBUG: "false",
    VITE_APPCHECK_DEBUG_TOKEN: "",
    VITE_APPCHECK_CUSTOM_TOKEN_URL: "",
    VITE_FIREBASE_API_KEY: "",
    VITE_FIREBASE_AUTH_DOMAIN: "",
    VITE_FIREBASE_PROJECT_ID: "",
    VITE_FIREBASE_STORAGE_BUCKET: "",
    VITE_FIREBASE_MESSAGING_SENDER_ID: "",
    VITE_FIREBASE_APP_ID: "",
    VITE_CLOUD_MODEL: "",
  },
});

if (result.status !== 0) process.exit(result.status ?? 1);
writeFileSync("dist/clearcue-build.json", JSON.stringify({ channel: "release" }) + "\n");

copyFileSync("LICENSE", "dist/LICENSE");
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const sections = [readFileSync("THIRD_PARTY_NOTICES.md", "utf8"), "Installed production dependency inventory"];
for (const [directory, metadata] of Object.entries(lock.packages)) {
  if (!directory.startsWith("node_modules/") || metadata.dev || !existsSync(directory)) continue;
  const notices = readdirSync(directory, { withFileTypes: true }).filter((entry) =>
    entry.isFile() && /^(licen[cs]e|copying|notice)([.\-_].*)?$/i.test(entry.name));
  sections.push(directory.replace(/^node_modules\//, "") + "@" + metadata.version + " · " + (metadata.license ?? "check upstream package"));
  for (const notice of notices) sections.push(readFileSync(path.join(directory, notice.name), "utf8"));
}
writeFileSync("dist/THIRD_PARTY_NOTICES.txt", sections.join("\n\n") + "\n");
