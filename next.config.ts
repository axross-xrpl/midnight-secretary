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

      // contract/ and this Next.js project are two separate npm installs on
      // purpose (contract/'s tsx/compact toolchain is WSL-only; this app
      // runs from Windows). Every package below exists as two physically
      // different copies on disk even at the same declared version --
      // src/lib/dev-contracts/*.ts (this app's own copies) and the
      // generated contract/src/managed/*/contract/index.js (contract/'s
      // copies) both construct/check instances of classes from these
      // packages (StateValue, ChargedState, etc.). Across two separate
      // module instantiations, `instanceof` fails even for identical data
      // ("expected instance of StateValue"). Aliasing every overlapping
      // package to contract/'s copy makes the whole dependency graph
      // resolve to ONE physical instance. contract/package.json also pins
      // an `overrides` entry for @midnight-ntwrk/onchain-runtime-v3 so that
      // single copy is itself internally consistent (compact-runtime and
      // midnight-js-contracts/midnight-js-protocol don't silently split
      // into two onchain-runtime-v3 versions on a fresh install).
      "@midnight-ntwrk/compact-js":
        "./contract/node_modules/@midnight-ntwrk/compact-js",
      "@midnight-ntwrk/compact-runtime":
        "./contract/node_modules/@midnight-ntwrk/compact-runtime",
      "@midnight-ntwrk/ledger-v8":
        "./contract/node_modules/@midnight-ntwrk/ledger-v8",
      "@midnight-ntwrk/midnight-js-contracts":
        "./contract/node_modules/@midnight-ntwrk/midnight-js-contracts",
      "@midnight-ntwrk/midnight-js-http-client-proof-provider":
        "./contract/node_modules/@midnight-ntwrk/midnight-js-http-client-proof-provider",
      "@midnight-ntwrk/midnight-js-indexer-public-data-provider":
        "./contract/node_modules/@midnight-ntwrk/midnight-js-indexer-public-data-provider",
      "@midnight-ntwrk/midnight-js-level-private-state-provider":
        "./contract/node_modules/@midnight-ntwrk/midnight-js-level-private-state-provider",
      "@midnight-ntwrk/midnight-js-network-id":
        "./contract/node_modules/@midnight-ntwrk/midnight-js-network-id",
      "@midnight-ntwrk/midnight-js-node-zk-config-provider":
        "./contract/node_modules/@midnight-ntwrk/midnight-js-node-zk-config-provider",
      "@midnight-ntwrk/midnight-js-protocol":
        "./contract/node_modules/@midnight-ntwrk/midnight-js-protocol",
      "@midnight-ntwrk/midnight-js-types":
        "./contract/node_modules/@midnight-ntwrk/midnight-js-types",
      "@midnight-ntwrk/midnight-js-utils":
        "./contract/node_modules/@midnight-ntwrk/midnight-js-utils",
      "@midnight-ntwrk/onchain-runtime-v3":
        "./contract/node_modules/@midnight-ntwrk/onchain-runtime-v3",
      "@midnight-ntwrk/platform-js":
        "./contract/node_modules/@midnight-ntwrk/platform-js",
      "@midnight-ntwrk/wallet-sdk-abstractions":
        "./contract/node_modules/@midnight-ntwrk/wallet-sdk-abstractions",
      "@midnight-ntwrk/wallet-sdk-address-format":
        "./contract/node_modules/@midnight-ntwrk/wallet-sdk-address-format",
      "@midnight-ntwrk/wallet-sdk-capabilities":
        "./contract/node_modules/@midnight-ntwrk/wallet-sdk-capabilities",
      "@midnight-ntwrk/wallet-sdk-dust-wallet":
        "./contract/node_modules/@midnight-ntwrk/wallet-sdk-dust-wallet",
      "@midnight-ntwrk/wallet-sdk-facade":
        "./contract/node_modules/@midnight-ntwrk/wallet-sdk-facade",
      "@midnight-ntwrk/wallet-sdk-hd":
        "./contract/node_modules/@midnight-ntwrk/wallet-sdk-hd",
      "@midnight-ntwrk/wallet-sdk-indexer-client":
        "./contract/node_modules/@midnight-ntwrk/wallet-sdk-indexer-client",
      "@midnight-ntwrk/wallet-sdk-node-client":
        "./contract/node_modules/@midnight-ntwrk/wallet-sdk-node-client",
      "@midnight-ntwrk/wallet-sdk-prover-client":
        "./contract/node_modules/@midnight-ntwrk/wallet-sdk-prover-client",
      "@midnight-ntwrk/wallet-sdk-runtime":
        "./contract/node_modules/@midnight-ntwrk/wallet-sdk-runtime",
      "@midnight-ntwrk/wallet-sdk-shielded":
        "./contract/node_modules/@midnight-ntwrk/wallet-sdk-shielded",
      "@midnight-ntwrk/wallet-sdk-unshielded-wallet":
        "./contract/node_modules/@midnight-ntwrk/wallet-sdk-unshielded-wallet",
      "@midnight-ntwrk/wallet-sdk-utilities":
        "./contract/node_modules/@midnight-ntwrk/wallet-sdk-utilities",
      "@midnight-ntwrk/zkir-v2":
        "./contract/node_modules/@midnight-ntwrk/zkir-v2",
      effect: "./contract/node_modules/effect",
      rxjs: "./contract/node_modules/rxjs",
      ws: "./contract/node_modules/ws",
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
