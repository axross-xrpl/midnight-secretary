// 予定一覧のタブ行の Tailwind のクラス文字列 (このページだけが使う)
// 参考実装のタスクリストのタブから移したもの

/**
 * タブを横に並べる行 (下の線で中身と区切る。中身との間は枠の gap に任せる)
 */
export const tabRowClass = "flex items-center gap-1 border-b border-border";

const tabClass = "border-b-2 px-4 py-2.5 text-[13px] font-semibold";

/**
 * 表示中のタブ (アクセント色の下線)
 */
export const activeTabClass = `${tabClass} border-accent text-accent`;

/**
 * 表示していないタブ
 */
export const idleTabClass = `${tabClass} border-transparent text-muted`;
