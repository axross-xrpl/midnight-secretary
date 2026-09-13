// Starts contract/'s long-lived faucet server (src/server.ts) for local dev.
// contract/'s toolchain (tsx's esbuild binary) is WSL-only, so on Windows
// this is routed through `wsl.exe` into a login+interactive shell (so PATH
// picks up WSL's own npm/node, e.g. via mise/nvm) rather than invoked
// directly. Run alongside `next dev` via `concurrently` -- see the root
// "dev" script.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTRACT_DIR = path.resolve(__dirname, "../contract");

function toWslPath(windowsPath) {
  // C:\Users\foo\bar -> /mnt/c/Users/foo/bar
  const match = /^([A-Za-z]):[\\/](.*)$/.exec(windowsPath);
  if (!match) {
    throw new Error(`Could not convert to a WSL path: ${windowsPath}`);
  }
  const [, drive, rest] = match;
  return `/mnt/${drive.toLowerCase()}/${rest.replace(/\\/g, "/")}`;
}

let child;
if (process.platform === "win32") {
  const wslDir = toWslPath(CONTRACT_DIR);
  const command = `cd '${wslDir}' && npm run server`;
  child = spawn("wsl.exe", ["bash", "-lic", command], { stdio: "inherit" });
} else {
  child = spawn("npm", ["run", "server"], {
    cwd: CONTRACT_DIR,
    stdio: "inherit",
  });
}

child.on("exit", (code) => process.exit(code ?? 0));

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
