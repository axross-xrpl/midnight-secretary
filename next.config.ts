import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // `next dev` uses Turbopack here -- it has native .wasm support, so
  // @midnight-ntwrk/ledger-v8's WASM build needs no special config under it.
  turbopack: {
    resolveAlias: {
      // midnight-js-indexer-public-data-provider does
      // `import * as ws from "isomorphic-ws"` and uses `ws.WebSocket` --
      // isomorphic-ws's own browser build only has a default export, not a
      // named one, so the browser bundle fails without this.
      // Turbopack's resolveAlias rejects Windows-style backslash paths
      // ("windows imports are not implemented yet"), so this must stay
      // POSIX-style even on Windows.
      "isomorphic-ws": {
        browser: "./src/lib/dev-contracts/isomorphic-ws-browser-shim.ts",
      },
    },
  },
  // Fallback in case a production build ever falls back to webpack instead
  // of Turbopack -- webpack (unlike Turbopack) needs asyncWebAssembly
  // enabled explicitly to handle ledger-v8's `import * as wasm from
  // "./midnight_ledger_wasm_bg.wasm"`.
  webpack: (config) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    return config;
  },
};

const nextIntlPlugin = createNextIntlPlugin();

export default nextIntlPlugin(nextConfig);
