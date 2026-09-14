import { describe, expect, test } from "vitest";
import { tripIdAt } from "@/testing/ids";
import type { ScanEvent } from "@/lib/calendar-scan-response";
import type {
  AuthorizationResponse,
  MoneyResponse,
  PaymentVisibilityResponse,
  TripPlanResponse,
  TripResponse,
} from "@/lib/secretary-response";
import type { Bubble, ChatState } from "./conversation";
import { conversationOf } from "./conversation";
import type { Activity, RequestFailure, Step } from "./types";

const TRIP_ID = tripIdAt(1);

const NETWORK_FAILURE: RequestFailure = { code: "network" };

const OSAKA: ScanEvent = {
  id: "seed-2",
  title: "大阪出張 (取引先訪問)",
  when: {
    kind: "timed",
    start: "2026-09-15T10:00:00+09:00",
    end: "2026-09-15T17:00:00+09:00",
  },
  location: "大阪市北区",
};

const mst = (amount: number): MoneyResponse => {
  return { amount, currency: "MST" };
};

const CAP = mst(200000);

const RAIL = {
  id: "rail-tokyo-osaka",
  mode: "rail",
  vendor: "デモ鉄道",
  payee: "wallet-rail",
  origin: "東京",
  destination: "新大阪",
  departAt: "2026-09-15T09:00:00+09:00",
  arriveAt: "2026-09-15T11:30:00+09:00",
  price: mst(14720),
} as const;

const PLAN: TripPlanResponse = {
  intent: {
    destination: "大阪",
    departOn: "2026-09-15",
    returnOn: "2026-09-15",
    purpose: "取引先訪問",
  },
  outbound: RAIL,
  inbound: { ...RAIL, id: "rail-osaka-tokyo" },
  total: mst(29440),
  rationale: "日帰りで往復できる",
};

const AUTHORIZATION: AuthorizationResponse = {
  mandateId: "mandate-1",
  paymentRef: `trip:${TRIP_ID}:rail-tokyo-osaka`,
  amount: mst(14720),
  authorizedAt: "2026-09-10T00:02:00Z",
  publicHash: "hash:mandate-1:rail-tokyo-osaka",
  settlement: {
    kind: "tokenTransfer",
    transactionId: "tx-1",
    recipient: "wallet-rail",
  },
};

const SECOND_AUTHORIZATION: AuthorizationResponse = {
  ...AUTHORIZATION,
  paymentRef: `trip:${TRIP_ID}:rail-osaka-tokyo`,
  publicHash: "hash:mandate-1:rail-osaka-tokyo",
  settlement: { ...AUTHORIZATION.settlement, transactionId: "tx-2" },
};

const ALL_PUBLIC: PaymentVisibilityResponse = {
  outbound: "public",
  inbound: "public",
};

const BASE = {
  id: TRIP_ID,
  event: OSAKA,
  plan: PLAN,
  proposedAt: "2026-09-10T00:00:00Z",
};

const PROPOSED: TripResponse = { status: "proposed", ...BASE };

const APPROVED: TripResponse = {
  status: "approved",
  ...BASE,
  approvedAt: "2026-09-10T00:01:00Z",
  visibility: ALL_PUBLIC,
  authorizations: [],
};

const PARTIALLY_PAID: TripResponse = {
  status: "approved",
  ...BASE,
  approvedAt: "2026-09-10T00:01:00Z",
  visibility: ALL_PUBLIC,
  authorizations: [AUTHORIZATION],
};

const PAID: TripResponse = {
  status: "paid",
  ...BASE,
  approvedAt: "2026-09-10T00:01:00Z",
  visibility: ALL_PUBLIC,
  authorizations: [AUTHORIZATION, SECOND_AUTHORIZATION],
  paidAt: "2026-09-10T00:02:00Z",
};

const WRITTEN: TripResponse = {
  status: "written",
  ...BASE,
  approvedAt: "2026-09-10T00:01:00Z",
  visibility: ALL_PUBLIC,
  authorizations: [AUTHORIZATION, SECOND_AUTHORIZATION],
  paidAt: "2026-09-10T00:02:00Z",
  writtenEventId: "written-1",
  writtenAt: "2026-09-10T00:03:00Z",
};

const IDLE: Activity = { kind: "idle" };

const stateOf = (
  trip: TripResponse | undefined,
  activity: Activity = IDLE,
): ChatState => {
  return {
    event: OSAKA,
    cap: CAP,
    ...(trip === undefined ? {} : { trip }),
    activity,
  };
};

const busy = (step: Step): Activity => {
  return { kind: "busy", step };
};

const PROPOSAL_BUBBLE: Bubble = {
  speaker: "secretary",
  line: { kind: "proposal", title: OSAKA.title, plan: PLAN },
  at: "2026-09-10T00:00:00Z",
};

const APPROVE_BUBBLE: Bubble = { speaker: "user", line: { kind: "approve" } };

const ASK_PAY_BUBBLE: Bubble = {
  speaker: "secretary",
  line: { kind: "askPay" },
  at: "2026-09-10T00:01:00Z",
};

const GREETING_BUBBLES: readonly Bubble[] = [
  {
    speaker: "secretary",
    line: { kind: "greeting", title: OSAKA.title, cap: CAP },
  },

  { speaker: "secretary", line: { kind: "ask", title: OSAKA.title } },
];

const PROPOSE_BUBBLE: Bubble = { speaker: "user", line: { kind: "propose" } };

// trip があるときの導入 (挨拶、問いかけ、依頼の写し)
const INTRO_BUBBLES: readonly Bubble[] = [...GREETING_BUBBLES, PROPOSE_BUBBLE];

const PAID_BUBBLES: readonly Bubble[] = [
  ...INTRO_BUBBLES,
  PROPOSAL_BUBBLE,
  APPROVE_BUBBLE,
  ASK_PAY_BUBBLE,

  { speaker: "user", line: { kind: "pay", resume: false } },

  {
    speaker: "secretary",
    line: {
      kind: "paid",
      authorizations: [AUTHORIZATION, SECOND_AUTHORIZATION],
    },
    at: "2026-09-10T00:02:00Z",
  },

  {
    speaker: "secretary",
    line: { kind: "askWriteBack" },
    at: "2026-09-10T00:02:00Z",
  },
];

describe("conversationOf (休止状態)", () => {
  test("trip が無ければ挨拶 (cap 付き) と問いかけで、返答は提案", () => {
    expect(conversationOf(stateOf(undefined))).toStrictEqual({
      bubbles: GREETING_BUBBLES,
      replies: [{ kind: "propose", eventId: OSAKA.id }],
    });
  });

  test("proposed は導入 (挨拶、問いかけ、依頼の写し) の後に提案の吹き出しで、返答は承認だけ", () => {
    expect(conversationOf(stateOf(PROPOSED))).toStrictEqual({
      bubbles: [...INTRO_BUBBLES, PROPOSAL_BUBBLE],
      replies: [{ kind: "approve", trip: PROPOSED }],
    });
  });

  test("approved (支払い前) は承認の写しと askPay で、返答は支払い", () => {
    expect(conversationOf(stateOf(APPROVED))).toStrictEqual({
      bubbles: [
        ...INTRO_BUBBLES,
        PROPOSAL_BUBBLE,
        APPROVE_BUBBLE,
        ASK_PAY_BUBBLE,
      ],
      replies: [{ kind: "pay", trip: APPROVED, resume: false }],
    });
  });

  test("approved (一部支払い済み) は partiallyPaid で、返答は支払いの再開", () => {
    expect(conversationOf(stateOf(PARTIALLY_PAID))).toStrictEqual({
      bubbles: [
        ...INTRO_BUBBLES,
        PROPOSAL_BUBBLE,
        APPROVE_BUBBLE,

        {
          speaker: "secretary",
          line: { kind: "partiallyPaid", authorizations: [AUTHORIZATION] },
          at: "2026-09-10T00:01:00Z",
        },
      ],
      replies: [{ kind: "pay", trip: PARTIALLY_PAID, resume: true }],
    });
  });

  test("paid は支払いまでの列と askWriteBack で、返答はカレンダー登録", () => {
    expect(conversationOf(stateOf(PAID))).toStrictEqual({
      bubbles: PAID_BUBBLES,
      replies: [{ kind: "writeBack", trip: PAID }],
    });
  });

  test("written は paid の列に登録の写しと written を足し、返答は無い", () => {
    expect(conversationOf(stateOf(WRITTEN))).toStrictEqual({
      bubbles: [
        ...PAID_BUBBLES,

        { speaker: "user", line: { kind: "writeBack" } },

        {
          speaker: "secretary",
          line: { kind: "written", writtenEventId: "written-1" },
          at: "2026-09-10T00:03:00Z",
        },
      ],
      replies: [],
    });
  });
});

describe("conversationOf (進行中)", () => {
  test("最初の提案は挨拶の後に propose の写しと working を足し、返答は無い", () => {
    expect(conversationOf(stateOf(undefined, busy("propose")))).toStrictEqual({
      bubbles: [
        ...INTRO_BUBBLES,

        {
          speaker: "secretary",
          line: { kind: "working", step: "propose", title: OSAKA.title },
        },
      ],
      replies: [],
    });
  });

  test("承認は approve の写しになる", () => {
    expect(
      conversationOf(stateOf(PROPOSED, busy("approve"))).bubbles,
    ).toStrictEqual([
      ...INTRO_BUBBLES,
      PROPOSAL_BUBBLE,
      APPROVE_BUBBLE,

      {
        speaker: "secretary",
        line: { kind: "working", step: "approve", title: OSAKA.title },
      },
    ]);
  });

  test("支払いは resume 無しの pay の写しになる", () => {
    expect(
      conversationOf(stateOf(APPROVED, busy("pay"))).bubbles,
    ).toStrictEqual([
      ...INTRO_BUBBLES,
      PROPOSAL_BUBBLE,
      APPROVE_BUBBLE,
      ASK_PAY_BUBBLE,

      { speaker: "user", line: { kind: "pay", resume: false } },

      {
        speaker: "secretary",
        line: { kind: "working", step: "pay", title: OSAKA.title },
      },
    ]);
  });

  test("一部支払い済みの支払いは resume 付きの pay の写しになる", () => {
    const bubbles = conversationOf(
      stateOf(PARTIALLY_PAID, busy("pay")),
    ).bubbles;

    expect(bubbles.at(-2)).toStrictEqual({
      speaker: "user",
      line: { kind: "pay", resume: true },
    });
  });

  test("カレンダー登録は writeBack の写しになる", () => {
    expect(
      conversationOf(stateOf(PAID, busy("writeBack"))).bubbles,
    ).toStrictEqual([
      ...PAID_BUBBLES,

      { speaker: "user", line: { kind: "writeBack" } },

      {
        speaker: "secretary",
        line: { kind: "working", step: "writeBack", title: OSAKA.title },
      },
    ]);
  });
});

describe("conversationOf (失敗)", () => {
  test("失敗は working の代わりに failed を出し、返答は閉じるだけ", () => {
    const failed: Activity = {
      kind: "failed",
      step: "propose",
      failure: NETWORK_FAILURE,
    };

    expect(conversationOf(stateOf(undefined, failed))).toStrictEqual({
      bubbles: [
        ...INTRO_BUBBLES,

        {
          speaker: "secretary",
          line: { kind: "failed", failure: NETWORK_FAILURE },
        },
      ],
      replies: [{ kind: "dismiss" }],
    });
  });
});
