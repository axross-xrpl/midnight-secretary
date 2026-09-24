import { defineConfig, devices } from "@playwright/test";

// 3000 は手元の `npm run dev` と重なりやすいので避ける
const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

// demo モードの dev サインインは NEXTAUTH_URL が localhost のときだけ有効になる
// NEXTAUTH_SECRET は JWT cookie の署名に使うだけなので、使い捨ての固定値でよい
const DEMO_ENV = {
  SECRETARY_MODE: "demo",
  NEXTAUTH_SECRET:
    process.env.NEXTAUTH_SECRET ?? "c2NyZWVuc2hvdC1oYXJuZXNzLWRlbW8tc2VjcmV0",
  NEXTAUTH_URL: BASE_URL,
} as const;

/**
 * スクリーンショット採取用の Playwright 設定
 *
 * demo モードの状態はサーバのメモリに置かれるので、毎回ビルドしたサーバを起動して使い捨てる
 * (会話の手順は 1 度しか進められないため、既存サーバは再利用しない)
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 10 * 60 * 1000,
  expect: { timeout: 60 * 1000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: BASE_URL,
  },
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: BASE_URL,
    timeout: 5 * 60 * 1000,
    reuseExistingServer: false,
    env: DEMO_ENV,
  },
});
