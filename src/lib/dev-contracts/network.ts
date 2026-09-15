import "server-only";

/**
 * The faucet routes used to spawn a fresh contract/ CLI script per request
 * (see git history on this file) -- that avoided the instanceof/module-
 * duplication problems of sharing an SDK module graph with this app, but
 * paid a multi-minute wallet-resync cost on every single call since each
 * subprocess started from scratch.
 *
 * contract/src/server.ts is a long-lived replacement: a small HTTP server,
 * started once alongside `npm run dev` (see scripts/start-contract-server.mjs
 * + the root "dev" script), that keeps one WalletFacade synced and connected
 * to both deployed contracts for as long as it runs. This app just talks to
 * it over loopback HTTP -- the wallet-resync cost is paid once at that
 * server's startup, not per request, and there's still no shared module
 * graph with this app's own SDK copies.
 */

const CONTRACT_SERVER_URL =
  process.env.CONTRACT_SERVER_URL ?? "http://127.0.0.1:4900";

async function readErrorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const body = JSON.parse(text);
    if (body && typeof body.error === "string") return body.error;
  } catch {
    // not JSON -- fall through to the raw text
  }
  return text || `Contract server responded ${res.status}`;
}

export async function contractServerGet<T>(path: string): Promise<T> {
  const res = await fetch(`${CONTRACT_SERVER_URL}${path}`);
  if (!res.ok) throw new Error(await readErrorMessage(res));
  return res.json() as Promise<T>;
}

export async function contractServerPost<T>(
  path: string,
  body: Record<string, string>,
): Promise<T> {
  const res = await fetch(`${CONTRACT_SERVER_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res));
  return res.json() as Promise<T>;
}

export type ContractServerHealth =
  | { status: "ready" }
  | { status: "unreachable"; message: string };

/**
 * Never throws -- "unreachable" (server not started yet, still mid wallet
 * sync, or crashed) is an expected, ordinary state here, not a failure of
 * this function. Used to drive a status indicator, not to gate a request.
 */
export async function getContractServerHealth(): Promise<ContractServerHealth> {
  try {
    await contractServerGet<{ ok: boolean }>("/health");
    return { status: "ready" };
  } catch (cause) {
    return {
      status: "unreachable",
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}
