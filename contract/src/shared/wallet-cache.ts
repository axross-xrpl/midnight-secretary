import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(__dirname, "../../.wallet-cache");

export type WalletCache = {
  shielded?: string;
  unshielded?: string;
  dust?: string;
};

// Keyed by a hash of the seed, never the seed itself -- .wallet-cache/ is
// gitignored, but this keeps a leaked cache file from also leaking a seed.
function cachePath(networkId: string, seedHex: string): string {
  const fingerprint = createHash("sha256")
    .update(seedHex)
    .digest("hex")
    .slice(0, 16);
  return path.join(CACHE_DIR, `${networkId}-${fingerprint}.json`);
}

/**
 * Resumable sync state per (networkId, seed), persisted locally so CLI
 * scripts don't replay shielded/unshielded/dust from genesis on every cold
 * run the way they otherwise always would -- browser wallets (Lace, 1AM)
 * get this for free from their own local storage; a one-shot CLI script
 * has nowhere to keep it unless it saves one itself. See sync.ts's comment
 * on why that replay is slow on preview/preprod
 * (https://github.com/midnightntwrk/midnight-wallet/issues/425).
 */
export function readWalletCache(
  networkId: string,
  seedHex: string,
): WalletCache | undefined {
  const file = cachePath(networkId, seedHex);
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

/**
 * Snapshots each sub-wallet's current sync state and writes it to disk.
 * Safe to call after a failed or timed-out sync too -- serializeState()
 * reflects whatever has actually been replayed so far, not just a fully
 * "isStrictlyComplete" state, so even a partial run leaves the next run
 * further ahead than starting cold again would.
 */
type CacheableFacade = {
  shielded: { serializeState(): Promise<string> };
  unshielded: { serializeState(): Promise<string> };
  dust: { serializeState(): Promise<string> };
  stop(): Promise<void>;
};

export async function saveWalletCache(
  networkId: string,
  seedHex: string,
  wallets: CacheableFacade,
): Promise<void> {
  const [shielded, unshielded, dust] = await Promise.all([
    wallets.shielded.serializeState(),
    wallets.unshielded.serializeState(),
    wallets.dust.serializeState(),
  ]);
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(
    cachePath(networkId, seedHex),
    JSON.stringify({ shielded, unshielded, dust }),
  );
}

/**
 * Registers SIGINT/SIGTERM handlers so Ctrl+C (or a kill) during a long
 * preview/preprod sync still saves progress instead of losing it -- without
 * this, the default Node behavior on a signal is to terminate immediately,
 * before a script's own `finally` block gets a chance to run.
 *
 * Returns a `cleanup` function; call it from your own `finally` block
 * instead of calling saveWalletCache/facade.stop() directly, so a normal
 * exit and a signal-triggered exit go through the same code path and never
 * run twice (the second call, from whichever path loses the race, is a
 * no-op).
 */
export function installShutdownHandler(
  networkId: string,
  seedHex: string,
  facade: CacheableFacade,
): () => Promise<void> {
  let done = false;

  const cleanup = async () => {
    if (done) return;
    done = true;
    await saveWalletCache(networkId, seedHex, facade);
    await facade.stop();
  };

  const onSignal = (signal: "SIGINT" | "SIGTERM") => {
    console.log(`\nReceived ${signal} -- saving sync progress before exit...`);
    cleanup()
      .catch((err) => {
        console.error("Failed to save sync cache:", err);
      })
      .finally(() => {
        process.exit(signal === "SIGINT" ? 130 : 143);
      });
  };

  process.on("SIGINT", () => onSignal("SIGINT"));
  process.on("SIGTERM", () => onSignal("SIGTERM"));

  return cleanup;
}
