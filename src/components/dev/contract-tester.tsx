"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ConnectedAPI,
  InitialAPI,
} from "@midnight-ntwrk/dapp-connector-api";
import {
  registerAge,
  proveAdult,
} from "@/lib/dev-contracts/age-verification-client";

const NETWORK_ID = process.env.NEXT_PUBLIC_NETWORK_ID ?? "undeployed";

declare global {
  interface Window {
    midnight?: Record<string, InitialAPI>;
  }
}

type AsyncState<T> =
  | { status: "idle" | "loading" | "error"; error?: string }
  | { status: "done"; data: T };

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-neutral-300 p-4 space-y-3">
      <h2 className="font-semibold text-lg">{title}</h2>
      {children}
    </section>
  );
}

function ResultBox({ label, value }: { label: string; value: unknown }) {
  if (value === undefined) return null;
  return (
    <pre className="text-xs bg-neutral-100 rounded p-2 overflow-x-auto">
      {label}:{" "}
      {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function ContractTester() {
  const [wallets, setWallets] = useState<InitialAPI[]>([]);
  const [connectedApi, setConnectedApi] = useState<ConnectedAPI | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [unshieldedAddress, setUnshieldedAddress] = useState<string | null>(
    null,
  );
  const [shieldedCoinPublicKey, setShieldedCoinPublicKey] = useState<
    string | null
  >(null);

  useEffect(() => {
    setWallets(Object.values(window.midnight ?? {}));
  }, []);

  const connect = useCallback(async (wallet: InitialAPI) => {
    setConnectError(null);
    try {
      const api = await wallet.connect(NETWORK_ID);
      setConnectedApi(api);
      const [unshielded, shielded] = await Promise.all([
        api.getUnshieldedAddress(),
        api.getShieldedAddresses(),
      ]);
      setUnshieldedAddress(unshielded.unshieldedAddress);
      setShieldedCoinPublicKey(shielded.shieldedCoinPublicKey);
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">/dev/contracts</h1>
      <p className="text-sm text-neutral-600">
        End-user testing only -- no deploy, no owner actions. Contract addresses
        come from NEXT_PUBLIC_TOKEN_ADDRESS / NEXT_PUBLIC_SHIELDED_TOKEN_ADDRESS
        / NEXT_PUBLIC_AGE_VERIFICATION_ADDRESS.
      </p>

      <Panel title="Wallet connection">
        {!connectedApi ? (
          wallets.length === 0 ? (
            <p className="text-sm text-neutral-600">
              No Midnight wallet extension detected (window.midnight is empty).
            </p>
          ) : (
            <div className="flex gap-2">
              {wallets.map((w) => (
                <button
                  key={w.name}
                  type="button"
                  onClick={() => connect(w)}
                  className="px-3 py-1.5 rounded bg-black text-white text-sm"
                >
                  Connect {w.name}
                </button>
              ))}
            </div>
          )
        ) : (
          <div className="text-sm space-y-1">
            <p>Connected.</p>
            <ResultBox label="Unshielded address" value={unshieldedAddress} />
            <ResultBox
              label="Shielded coin public key"
              value={shieldedCoinPublicKey}
            />
          </div>
        )}
        {connectError && <p className="text-sm text-red-600">{connectError}</p>}
      </Panel>

      <TokenPanel unshieldedAddress={unshieldedAddress} />
      <ShieldedTokenPanel shieldedCoinPublicKey={shieldedCoinPublicKey} />
      <AgeVerificationPanel connectedApi={connectedApi} />
    </div>
  );
}

function TokenPanel({
  unshieldedAddress,
}: {
  unshieldedAddress: string | null;
}) {
  const [state, setState] = useState<AsyncState<unknown>>({ status: "idle" });
  const [request, setRequest] = useState<AsyncState<unknown>>({
    status: "idle",
  });

  const loadState = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/dev/contracts/token/state");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setState({ status: "done", data });
    } catch (err) {
      setState({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  const requestTokens = useCallback(async () => {
    if (!unshieldedAddress) return;
    setRequest({ status: "loading" });
    try {
      const res = await fetch("/api/dev/contracts/token/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: unshieldedAddress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setRequest({ status: "done", data });
      loadState();
    } catch (err) {
      setRequest({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, [unshieldedAddress, loadState]);

  return (
    <Panel title="Token (unshielded)">
      {state.status === "done" && (
        <ResultBox label="State" value={state.data} />
      )}
      {state.status === "error" && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
      <button
        type="button"
        onClick={requestTokens}
        disabled={!unshieldedAddress || request.status === "loading"}
        className="px-3 py-1.5 rounded bg-black text-white text-sm disabled:opacity-40"
      >
        {request.status === "loading" ? "Requesting..." : "Request tokens"}
      </button>
      {!unshieldedAddress && (
        <p className="text-xs text-neutral-500">Connect a wallet first.</p>
      )}
      {request.status === "done" && (
        <ResultBox label="Result" value={request.data} />
      )}
      {request.status === "error" && (
        <p className="text-sm text-red-600">{request.error}</p>
      )}
    </Panel>
  );
}

function ShieldedTokenPanel({
  shieldedCoinPublicKey,
}: {
  shieldedCoinPublicKey: string | null;
}) {
  const [state, setState] = useState<AsyncState<unknown>>({ status: "idle" });
  const [request, setRequest] = useState<AsyncState<unknown>>({
    status: "idle",
  });

  const loadState = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/dev/contracts/shielded-token/state");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setState({ status: "done", data });
    } catch (err) {
      setState({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  const requestTokens = useCallback(async () => {
    if (!shieldedCoinPublicKey) return;
    setRequest({ status: "loading" });
    try {
      const res = await fetch("/api/dev/contracts/shielded-token/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coinPublicKeyHex: shieldedCoinPublicKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setRequest({ status: "done", data });
      loadState();
    } catch (err) {
      setRequest({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, [shieldedCoinPublicKey, loadState]);

  return (
    <Panel title="Shielded token">
      {state.status === "done" && (
        <ResultBox label="State" value={state.data} />
      )}
      {state.status === "error" && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}
      <button
        type="button"
        onClick={requestTokens}
        disabled={!shieldedCoinPublicKey || request.status === "loading"}
        className="px-3 py-1.5 rounded bg-black text-white text-sm disabled:opacity-40"
      >
        {request.status === "loading" ? "Requesting..." : "Request tokens"}
      </button>
      {!shieldedCoinPublicKey && (
        <p className="text-xs text-neutral-500">Connect a wallet first.</p>
      )}
      {request.status === "done" && (
        <ResultBox label="Result" value={request.data} />
      )}
      {request.status === "error" && (
        <p className="text-sm text-red-600">{request.error}</p>
      )}
    </Panel>
  );
}

function AgeVerificationPanel({
  connectedApi,
}: {
  connectedApi: ConnectedAPI | null;
}) {
  const [dob, setDob] = useState("");
  const [cutoff, setCutoff] = useState("");
  const [registerState, setRegisterState] = useState<AsyncState<unknown>>({
    status: "idle",
  });
  const [proveState, setProveState] = useState<AsyncState<unknown>>({
    status: "idle",
  });

  const doRegister = useCallback(async () => {
    if (!connectedApi || !/^\d{8}$/.test(dob)) return;
    setRegisterState({ status: "loading" });
    try {
      const data = await registerAge(connectedApi, BigInt(dob));
      setRegisterState({ status: "done", data });
    } catch (err) {
      setRegisterState({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, [connectedApi, dob]);

  const doProve = useCallback(async () => {
    if (!connectedApi || !/^\d{8}$/.test(cutoff)) return;
    setProveState({ status: "loading" });
    try {
      const data = await proveAdult(connectedApi, BigInt(cutoff));
      setProveState({ status: "done", data });
    } catch (err) {
      setProveState({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, [connectedApi, cutoff]);

  return (
    <Panel title="Age verification">
      {!connectedApi && (
        <p className="text-xs text-neutral-500">Connect a wallet first.</p>
      )}
      <div className="space-y-2">
        <label className="block text-sm">
          Date of birth (YYYYMMDD)
          <input
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            placeholder="19900215"
            className="ml-2 border rounded px-2 py-1 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={doRegister}
          disabled={!connectedApi || registerState.status === "loading"}
          className="px-3 py-1.5 rounded bg-black text-white text-sm disabled:opacity-40"
        >
          {registerState.status === "loading" ? "Registering..." : "Register"}
        </button>
        {registerState.status === "done" && (
          <ResultBox label="Registered" value={registerState.data} />
        )}
        {registerState.status === "error" && (
          <p className="text-sm text-red-600">{registerState.error}</p>
        )}
      </div>
      <div className="space-y-2">
        <label className="block text-sm">
          Cutoff date (YYYYMMDD -- e.g. today minus 20 years)
          <input
            value={cutoff}
            onChange={(e) => setCutoff(e.target.value)}
            placeholder="20060909"
            className="ml-2 border rounded px-2 py-1 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={doProve}
          disabled={!connectedApi || proveState.status === "loading"}
          className="px-3 py-1.5 rounded bg-black text-white text-sm disabled:opacity-40"
        >
          {proveState.status === "loading" ? "Proving..." : "Prove Adult"}
        </button>
        {proveState.status === "done" && (
          <ResultBox label="Result" value={proveState.data} />
        )}
        {proveState.status === "error" && (
          <p className="text-sm text-red-600">{proveState.error}</p>
        )}
      </div>
    </Panel>
  );
}
