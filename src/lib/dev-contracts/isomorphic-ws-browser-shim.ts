// @midnight-ntwrk/midnight-js-indexer-public-data-provider does
// `import * as ws from "isomorphic-ws"` then uses `ws.WebSocket` -- but
// isomorphic-ws's own browser build (isomorphic-ws/browser.js) only exports
// the global WebSocket as its *default* export, not a named one, so bundling
// that module for the browser fails with "Export WebSocket doesn't exist in
// target module". Aliased in for the browser only (see next.config.ts's
// turbopack.resolveAlias) to a version that has both.
export const WebSocket = globalThis.WebSocket;
export default globalThis.WebSocket;
