import type { AbstractIntlMessages } from "next-intl";

/**
 * ドットパス (例: "NavBar.home") から文言へのカタログ
 *
 * next-intl はキーにドットを許さないので、ドットパスは 1 つの文言を一意に指す
 * 未翻訳キーの比較にはこの平らな形を使い、next-intl へ渡す時は入れ子の形のまま扱う
 */
export type MessageCatalog = Readonly<Record<string, string>>;

type MessageNode = string | AbstractIntlMessages;

type CatalogEntry = readonly [string, string];

const joinPath = (prefix: string | undefined, key: string): string => {
  return prefix === undefined ? key : `${prefix}.${key}`;
};

const flattenNode = (
  path: string,
  node: MessageNode,
): readonly CatalogEntry[] => {
  return typeof node === "string" ? [[path, node]] : flattenEntries(node, path);
};

const flattenEntries = (
  messages: AbstractIntlMessages,
  prefix?: string,
): readonly CatalogEntry[] => {
  return Object.entries(messages).flatMap(([key, node]) =>
    flattenNode(joinPath(prefix, key), node),
  );
};

/**
 * 入れ子のメッセージを、定義順のドットパスをキーにしたカタログにする
 */
export const flattenMessages = (
  messages: AbstractIntlMessages,
): MessageCatalog => {
  return Object.fromEntries(flattenEntries(messages));
};

const completeNode = (
  japanese: MessageNode | undefined,
  english: MessageNode,
): MessageNode => {
  if (typeof english === "string") {
    return typeof japanese === "string" ? japanese : english;
  }

  return completeWithEnglish(
    typeof japanese === "object" ? japanese : {},
    english,
  );
};

/**
 * 日本語のメッセージを英語の形に沿って補完する
 *
 * 英語にあるキーをすべて持ち、日本語に文言があればそれを、無ければ英語の文言を使う
 * 英語に無い日本語のキーは捨てる (型の上でも参照できないため)
 * 新しいオブジェクトを返し、入力は変更しない
 */
export const completeWithEnglish = (
  japanese: AbstractIntlMessages,
  english: AbstractIntlMessages,
): AbstractIntlMessages => {
  return Object.fromEntries(
    Object.entries(english).map(
      ([key, node]) => [key, completeNode(japanese[key], node)] as const,
    ),
  );
};

/**
 * 日本語のカタログを英語のカタログと比較した結果
 */
export type MessageKeyDiff = {
  /** 英語にあって日本語に無いドットパス (英語の文言にフォールバックする) */
  missing: readonly string[];

  /** 日本語にだけあるドットパス (typo か古いキーの可能性が高い) */
  extra: readonly string[];
};

/**
 * 英語と日本語のカタログのキーを比較する
 *
 * 英語にあって日本語に無いキーを missing、日本語にだけあるキーを extra に分けて返す
 */
export const diffCatalogs = (
  english: MessageCatalog,
  japanese: MessageCatalog,
): MessageKeyDiff => {
  // Set は差集合を取るためだけに関数内で使う
  const englishKeys = new Set(Object.keys(english));
  const japaneseKeys = new Set(Object.keys(japanese));

  return {
    missing: [...englishKeys.difference(japaneseKeys)],
    extra: [...japaneseKeys.difference(englishKeys)],
  };
};
