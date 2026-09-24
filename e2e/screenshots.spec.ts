import { mkdir } from "node:fs/promises";
import path from "node:path";
import type {
  Browser,
  BrowserContextOptions,
  Locator,
  Page,
} from "@playwright/test";
import { expect, test } from "@playwright/test";

type Locale = "en" | "ja";
type Scheme = "light" | "dark";
type Viewport = "desktop" | "mobile";

type Combo = {
  locale: Locale;
  scheme: Scheme;
  viewport: Viewport;
};

type Size = {
  width: number;
  height: number;
};

// 画面の文言 (messages/{en,ja}.json から、待ち合わせと操作に使うものだけ)
type Labels = {
  signIn: string;
  signOut: string;
  home: string;
  scan: string;
  chat: string;
  propose: string;
  approve: string;
  sendProof: string;
  pay: string;
  writeBack: string;
  written: string;
  failed: string;
  profile: string;
  services: string;
};

type ReadyLocator = (page: Page, labels: Labels) => Locator;

// 1 枚の対象 (ロケール抜きのパスと、描画が終わったと見なす要素)
type Shot = {
  name: string;
  path: string;
  ready: ReadyLocator;
};

type StorageState = BrowserContextOptions["storageState"];

// 会話の 1 手 (押す返答と、その手が終わった印。承認は年齢証明の同意を挟むことがある)
type ConversationStep = {
  name: string;
  reply: keyof Labels;
  consent?: keyof Labels;
  done: ReadyLocator;
};

type StepOutcome = {
  name: string;
  ok: boolean;
};

const OUTPUT_DIR = path.resolve(
  process.env.SCREENSHOT_DIR ?? ".local/screenshots/before",
);

// demo の planner と mandate は速いが、初回の描画やビルド直後は遅いことがある
const STEP_TIMEOUT_MS = 120 * 1000;

const OSAKA_TRIP_TITLE = "大阪出張 (取引先訪問)";

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const satisfies Record<Viewport, Size>;

const LABELS = {
  en: {
    signIn: "Sign in as demo user",
    signOut: "Sign out",
    home: "Home",
    scan: "Scan the calendar",
    chat: "Ask the secretary",
    propose: "Propose a plan",
    approve: "Approve the plan",
    sendProof: "Send the proof",
    pay: "Pay from the allowance",
    writeBack: "Add to calendar",
    written: "The trip is on your calendar.",
    failed: "Sorry, that did not go through.",
    profile: "Profile",
    services: "Service management",
  },
  ja: {
    signIn: "デモユーザーでサインイン",
    signOut: "サインアウト",
    home: "ホーム",
    scan: "カレンダーをスキャン",
    chat: "秘書に相談",
    propose: "計画を提案して",
    approve: "計画を承認する",
    sendProof: "証明を送る",
    pay: "支払い枠で支払う",
    writeBack: "カレンダーに登録",
    written: "出張をカレンダーに登録しました。",
    failed: "すみません、うまくいきませんでした。",
    profile: "プロフィール",
    services: "サービス管理",
  },
} as const satisfies Record<Locale, Labels>;

const LOCALES = ["en", "ja"] as const satisfies readonly Locale[];
const SCHEMES = ["light", "dark"] as const satisfies readonly Scheme[];
const VIEWPORT_NAMES = [
  "desktop",
  "mobile",
] as const satisfies readonly Viewport[];

const COMBOS: readonly Combo[] = LOCALES.flatMap((locale) =>
  SCHEMES.flatMap((scheme) =>
    VIEWPORT_NAMES.map((viewport) => ({ locale, scheme, viewport })),
  ),
);

const button = (page: Page, name: string): Locator => {
  return page.getByRole("button", { name, exact: true });
};

const heading = (page: Page, name: string): Locator => {
  return page.getByRole("heading", { name, exact: true });
};

const fileOf = (name: string, combo: Combo): string => {
  return path.join(
    OUTPUT_DIR,
    `${name}--${combo.locale}--${combo.scheme}--${combo.viewport}.png`,
  );
};

// ヒーローの文言は英語固定 (landing-sign-in.tsx) なので、ja でも英語のボタンを待つ
const LANDING: Shot = {
  name: "landing",
  path: "/",
  ready: (page) => button(page, LABELS.en.signIn),
};

const HOME: Shot = {
  name: "home",
  path: "/",
  ready: (page, labels) => heading(page, labels.home),
};

const TASKS: Shot = {
  name: "tasks",
  path: "/tasks?scan=1",
  ready: (page, labels) =>
    page.getByRole("link", { name: labels.chat, exact: true }).first(),
};

const PROFILE: Shot = {
  name: "settings-profile",
  path: "/settings/profile",
  ready: (page, labels) => heading(page, labels.profile),
};

const SERVICES: Shot = {
  name: "settings-services",
  path: "/settings/services",
  ready: (page, labels) => heading(page, labels.services),
};

const CONVERSATION_STEPS = [
  {
    name: "step-1-proposal",
    reply: "propose",
    done: (page, labels) => button(page, labels.approve),
  },

  {
    name: "step-2-approved",
    reply: "approve",
    consent: "sendProof",
    done: (page, labels) => button(page, labels.pay),
  },

  {
    name: "step-3-paid",
    reply: "pay",
    done: (page, labels) => button(page, labels.writeBack),
  },

  {
    name: "step-4-written",
    reply: "writeBack",
    done: (page, labels) => page.getByText(labels.written, { exact: true }),
  },
] as const satisfies readonly ConversationStep[];

// 描画が落ち着くまで待つ (fetch が止み、フォントが読め、目印の要素が見えている)
const settle = async (page: Page, ready: Locator): Promise<void> => {
  await page.waitForLoadState("networkidle");
  await expect(ready).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
};

const contextOptions = (
  combo: Combo,
  storageState: StorageState,
): BrowserContextOptions => {
  return {
    colorScheme: combo.scheme,
    viewport: VIEWPORTS[combo.viewport],
    ...(storageState === undefined ? {} : { storageState }),
  };
};

// 1 枚撮る (組み合わせごとに新しい context で開くので、状態はサーバ側のものだけが写る)
const capture = async (
  browser: Browser,
  shot: Shot,
  combo: Combo,
  storageState: StorageState,
): Promise<void> => {
  const context = await browser.newContext(contextOptions(combo, storageState));
  const page = await context.newPage();
  await page.goto(`/${combo.locale}${shot.path}`);
  await settle(page, shot.ready(page, LABELS[combo.locale]));
  await page.screenshot({
    path: fileOf(shot.name, combo),
    fullPage: true,
    animations: "disabled",
  });
  await context.close();
};

// ロケール x 配色 x 画面幅 の全組み合わせを撮る
const captureAll = async (
  browser: Browser,
  shot: Shot,
  storageState: StorageState,
): Promise<void> => {
  await Promise.all(
    COMBOS.map((combo) => capture(browser, shot, combo, storageState)),
  );
};

// ヒーローの dev サインインを押し、cookie を他の context に渡せる形で返す
const signIn = async (browser: Browser): Promise<StorageState> => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/en");
  await button(page, LABELS.en.signIn).click();
  await expect(button(page, LABELS.en.signOut)).toBeVisible();
  const storageState = await context.storageState();
  await context.close();

  return storageState;
};

// 返答を押し、次の手の印か失敗の吹き出しが出るまで待つ (同意を求められたら送る)
const advance = async (
  page: Page,
  labels: Labels,
  step: ConversationStep,
): Promise<boolean> => {
  const done = step.done(page, labels);
  const failed = page.getByText(labels.failed, { exact: true });
  const consent =
    step.consent === undefined ? undefined : button(page, labels[step.consent]);

  await button(page, labels[step.reply]).click();
  await expect(
    consent === undefined ? done.or(failed) : done.or(failed).or(consent),
  ).toBeVisible({ timeout: STEP_TIMEOUT_MS });

  if (consent !== undefined && (await consent.isVisible())) {
    await consent.click();
    await expect(done.or(failed)).toBeVisible({ timeout: STEP_TIMEOUT_MS });
  }

  return !(await failed.isVisible());
};

// 大阪出張の会話を返答ボタンで進め、手ごとに全組み合わせを撮る
// 失敗した手は運転席の画面だけを撮って打ち切る (失敗の吹き出しはクライアントの状態なので、開き直すと消える)
const driveConversation = async (
  browser: Browser,
  driver: Page,
  chatPath: string,
  storageState: StorageState,
): Promise<readonly StepOutcome[]> => {
  const labels = LABELS.en;
  // 局所ミューテーション: 手は前の手の結果に依存するので順に進め、結果はこの関数の外から観測されない
  const outcomes: StepOutcome[] = [];

  for (const step of CONVERSATION_STEPS) {
    const ok = await advance(driver, labels, step);
    outcomes.push({ name: step.name, ok });

    if (!ok) {
      await driver.screenshot({
        path: path.join(OUTPUT_DIR, `conversation-${step.name}-failed.png`),
        fullPage: true,
        animations: "disabled",
      });

      return outcomes;
    }

    await captureAll(
      browser,
      { name: `conversation-${step.name}`, path: chatPath, ready: step.done },
      storageState,
    );
  }

  return outcomes;
};

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await mkdir(OUTPUT_DIR, { recursive: true });
});

test("landing, signed out", async ({ browser }) => {
  await captureAll(browser, LANDING, undefined);
});

test("home, signed in", async ({ browser }) => {
  const storageState = await signIn(browser);
  await captureAll(browser, HOME, storageState);
});

test("tasks after scanning the calendar", async ({ browser }) => {
  const storageState = await signIn(browser);
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  await page.goto("/en/tasks");
  await button(page, LABELS.en.scan).click();
  await expect(TASKS.ready(page, LABELS.en)).toBeVisible({
    timeout: STEP_TIMEOUT_MS,
  });
  await context.close();
  await captureAll(browser, TASKS, storageState);
});

test("conversation for the Osaka trip", async ({ browser }) => {
  const storageState = await signIn(browser);
  const context = await browser.newContext({
    storageState,
    colorScheme: "light",
    viewport: VIEWPORTS.desktop,
  });
  const driver = await context.newPage();
  await driver.goto("/en/tasks?scan=1");
  await driver
    .getByRole("listitem")
    .filter({ hasText: OSAKA_TRIP_TITLE })
    .getByRole("link", { name: LABELS.en.chat, exact: true })
    .click();
  await driver.waitForURL(/\/en\/tasks\/[^/?]+/);
  await settle(driver, button(driver, LABELS.en.propose));

  // 開き直すときのパス (ロケール抜き。`tab=detect` はそのまま引き継ぐ)
  const url = new URL(driver.url());
  const chatPath = `${url.pathname.replace(/^\/en/, "")}${url.search}`;

  const outcomes = await driveConversation(
    browser,
    driver,
    chatPath,
    storageState,
  );
  await context.close();

  const summary = outcomes
    .map((outcome) => `${outcome.name}: ${outcome.ok ? "ok" : "failed"}`)
    .join(", ");
  test.info().annotations.push({ type: "conversation", description: summary });
  console.log(`conversation steps -> ${summary}`);
  expect(
    outcomes.every((outcome) => outcome.ok),
    summary,
  ).toBe(true);
});

// 設定の 2 画面も demo モードでは Fake (メモリの seed) を読むので、DATABASE_URL 無しで撮れる
test("settings", async ({ browser }) => {
  const storageState = await signIn(browser);
  await captureAll(browser, PROFILE, storageState);
  await captureAll(browser, SERVICES, storageState);
});
