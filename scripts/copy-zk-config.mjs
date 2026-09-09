// Copies age-verification's compiled ZK artifacts (keys/ + zkir/, produced by
// `compact compile` inside contract/) into public/ so the browser can fetch
// them at runtime via @midnight-ntwrk/midnight-js-fetch-zk-config-provider.
// Re-run this (`npm run copy-zk-config`) whenever age-verification.compact
// changes and gets recompiled.
import { cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const SOURCE = path.join(repoRoot, "contract/src/managed/age-verification");
const DEST = path.join(repoRoot, "public/zk-config/age-verification");

if (!existsSync(SOURCE)) {
  console.error(
    `No compiled output at ${SOURCE}. Run \`npm run compile:full\` inside contract/ first.`,
  );
  process.exit(1);
}

rmSync(DEST, { recursive: true, force: true });
cpSync(SOURCE, DEST, { recursive: true });

console.log(`Copied ${SOURCE} -> ${DEST}`);
