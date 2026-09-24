# デザイン (トーン & マナー)

正は `src/app/globals.css` の `@theme` と `src/components/chat/styles.ts`。本書はその説明と、判断に迷ったときの基準。機械検査できるものは ast-grep (`npm run lint:design`) が守る。

## 声

製品名は Zee-Kwat Private Agent。README の一文がそのまま声の基準:

> Wise enough to plan the trip. Quiet enough to pay for it.

- **静か**: 太字と強い色を減らし、余白と行間で区切る。点滅・パルス・強い影は使わない (処理中の小さな pulse だけ例外)
- **誠実**: fake で動いている部分、契約が強制していない部分は画面で言う (`FakeNotice`、各パネルの注記)
- **一人称は秘書**: 吹き出しは秘書の口調。UI のラベルは短い名詞

## 文字

| 役 | クラス | 実体 |
| --- | --- | --- |
| 本文・UI | `font-sans` | Geist -> Noto Sans JP |
| 見出し・ブランド | `font-serif` | Noto Serif JP |
| 識別子 (hash, tx, paymentRef) | `font-mono` | Geist Mono |
| 金額 | `font-sans tabular-nums font-semibold` | |

スケールは `text-xs` (12) / `sm` (14) / `base` (16) / `lg` (18) / `xl` (20) / `2xl` (24) / `3xl` (30) / `4xl` (36)。本文は `base`、ラベルは `sm`、`xs` は時刻・注記・pill だけ。任意 px (`text-[13px]`) は禁止。

見出し: ページと区画の h1 / h2 は `font-serif font-medium`、カードの h3 は sans の `font-semibold`。ウェイトは値が `semibold`、ラベルが `medium`。`bold` はヒーローと決め手のボタンだけ。

## 色

トークンは役割で呼ぶ (`accent` / `muted` / `faint` / `ok` / `warn` / `danger` / `note`)。色コードの直書きは禁止。

- **公開 / 非公開**: `public` (琥珀) と `private` (紫) の 2 色は「台帳に載るか」だけに使う。他の意味で使わない
- **候補の種類**: `rail` / `air` / `hotel` / `dining` / `leisure` の 5 色は丸いアイコンの地色だけ
- **状態**: 進行中 `accent-bg`、完了 `ok-bg`、注意 `warn-bg`、失敗 `danger-bg`。文字は同名の濃い色
- コントラストは本文 4.5:1 以上 (`faint` も満たす)

ダークモードは `prefers-color-scheme` に従う (トグルは無い)。すべてのトークンが `globals.css` の 2 か所で定義されているので、コンポーネントに `dark:` を書く必要はない。

## 余白と形

- カード `p-6` (サイドバーは `p-5`)、`rounded-xl`。行カードは `px-6 py-4`
- 吹き出し `px-5 py-4`、`rounded-2xl` + 話し手側の角だけ `rounded-t*-sm`
- ボタン `rounded-lg`、行内の小さいボタンは `rounded-md`。pill は `rounded-full`
- 縦の間隔はカード内 `gap-4`、区画間 `gap-6`。ページの列は `max-w-4xl`
- 任意 px の角丸 (`rounded-[10px]`) は禁止

## 部品

- 見た目の部品 (ボタン、カード、pill、明細) は `src/components/chat/styles.ts` のクラス定数
- 振る舞いの部品 (Dialog / Tabs / Switch / Tooltip) は shadcn (Base UI) 製の `src/components/ui/`。生成物のパレット色はトークンに書き換えてある。`npx shadcn add` で足したら `bg-muted` -> `bg-card-inner`、`bg-accent` (ホバー面) -> `bg-accent-surface` に直す
- shadcn の CSS 変数 (`--primary` 等) は既存トークンの別名として `globals.css` に定義してある。`--muted` と `--accent` は名前が衝突するので shadcn 側を `--muted-surface` / `--accent-surface` にしている

## 画面ごとの要点

- **会話**: 左の列が会話、右のサイドバーが「進み具合」「支払い枠」「お金の居場所」「2 つの台帳」。お金の居場所は あなた -> 秘書 -> 受取先 の順で、支払いごとに未払い / 預かり中 / 受取済み
- **Tasks**: 検知した予定と確定した旅程をタブで分ける。行カードに操作は 1 つ
- **Settings**: フォームは 1 列、区画の h3 と説明文で区切る

## shadcn (Base UI) の変数

生成物が期待する変数は既存トークンの別名として `globals.css` の `:root` に置いてある。`--muted` と `--accent` は意味が衝突する（shadcn は面の色、こちらは文字色とブランド色）ので、shadcn 側を `--muted-surface` / `--accent-surface` に逃がしている。

| shadcn | このリポジトリ |
| --- | --- |
| `--background` / `--foreground` | `--bg` / `--text` |
| `--card` / `--popover` | `--surface` |
| `--primary` | `--accent` |
| `--secondary` | `--neutral-bg` |
| `--muted-surface` / `--muted-foreground` | `--card-inner` / `--muted` |
| `--accent-surface` / `--accent-foreground` | `--accent-bg` / `--accent` |
| `--destructive` | `--danger` |
| `--input` / `--ring` | `--ghost-border` / `--accent` |

## コントラスト

本文とラベルは 4.5:1 以上。`--faint` は白地 4.6、ダークの面で 5.6。`--muted` は 6.0。`--accent` は白地 6.6 で、白文字を載せても 6.6。

## 確認の仕方

`npm run e2e:screenshots` が 6 画面 × en/ja × light/dark × desktop/mobile を撮る (`SCREENSHOT_DIR` で出力先を変える)。見た目に触る変更は before / after を並べて見る。
