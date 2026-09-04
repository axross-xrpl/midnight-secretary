/**
 * ja.json を en.json と比較し、en にしか無いキー (英語にフォールバックする) と en に無いキー (typo の可能性) を一覧する
 *
 * 情報表示のみで、終了コードは常に 0
 * `npm run i18n:report` で実行する
 */
import en from "../messages/en.json" with { type: "json" };
import ja from "../messages/ja.json" with { type: "json" };
import { diffCatalogs, flattenMessages } from "../src/i18n/messages.ts";

const formatList = (label: string, paths: readonly string[]): string => {
  const head = `  ${label}: ${paths.length}`;

  return paths.length === 0
    ? head
    : [head, ...paths.map((path) => `    - ${path}`)].join("\n");
};

const diff = diffCatalogs(flattenMessages(en), flattenMessages(ja));

console.log(
  [
    "ja vs en (base)",
    formatList("missing (falls back to English)", diff.missing),
    formatList("extra (not in en, check for typos)", diff.extra),
  ].join("\n"),
);
