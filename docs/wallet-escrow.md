# 支払いの預かりと「お金の居場所」

支払い 1 件が、旅行者の支払い枠から秘書を経て受取先へ渡るまでをどう表すか。Wave 2 で入れたもの。

## いまの形

支払いは承認と同時に送金される（`token.compact` の `sendToken` は所有者確認・予算確認・減算・送金を 1 つの circuit で行う）。その上に、受け取りの確認という段を**アプリの状態として**足した。

```ts
/** 預かりの状態: 支払いで預かり、受け取りの確認で受取先へ解放する */
export type Escrow =
  | { status: "held"; heldAt: IsoDateTime }
  | {
      status: "released";
      heldAt: IsoDateTime;
      releasedAt: IsoDateTime;
      releaseRef: string;
    };
```

`Authorization` が `escrow` を必ず持ち、`authorizePayment` は `held` で返す。`MandatePort.releaseEscrow(mandateId, paymentRef, now)` が `released` に進める。判定は `src/domain/mandate-ledger.ts` の `releaseIn` に純粋関数として置き、fake と real が同じものを使う。

**real でもチェーンは呼ばない。** トークンは支払いの時点ですでに受取先へ渡っているので、受け取りの確認が動かすのはラベルだけ。README の "What we don't claim" に同じことを書いてある。

## 使い方 (use case)

`confirmReceipt(userId, tripId, paymentRef, now, deps)`:

1. 出張を読む。`paid` / `written` 以外は `flow.notPaid`
2. その出張の `authorizations` に `paymentRef` が無ければ `mandate.notFound`（他の出張の支払いをこの経路で解放させないため）
3. `deps.mandate.releaseEscrow` -> 済んでいれば `mandate.notHeld`
4. 該当行を差し替えて `store.putTrip`

API は `POST /api/secretary/trips/{tripId}/payments/{paymentRef}/confirm`（body なし、200 で差し替え後の出張、409 が `notPaid` / `notHeld`）。`paymentRef` は `trip:<tripId>:<offerId>` なので、クライアントは `encodeURIComponent` する。

## 画面

- **明細の行**（`authorization-list.tsx`）: 預かりの状態を pill で出し、`held` の行に「受け取りました」ボタン。押すと差し替え後の出張が返り、`tripUpdated` で会話の状態に流れる（`router.refresh()` だけでは、会話が直近の応答を優先するため追いつかない）
- **サイドバー**（`money-flow-panel.tsx`）: あなた -> 秘書 -> 受取先 の順に縦に並べ、受取先の行ごとに 未払い / 預かり中 / 受取済み。秘書の「預かり中」と受取先の「受取済みの合計」が対になる
- 導出は `money-flow.ts` の `moneyFlowOf(trip)`（純粋関数）。行の順は計画の行（時系列）と同じ

## 次 (Wave 3)

- 預かりを回路に移す: 予約で `deposit`、確認で `release`。受取先の署名をどう扱うかが設計の中心
- 期限つきの自動解放。`kernel` のブロック時刻は Compact 0.31.1 に無いので、ledger 9 が Preview に来てから
- カタログの payee を本物の Preview アドレスにする（いまは全額が `MANDATE_SETTLEMENT_RECIPIENT` へ行く）
