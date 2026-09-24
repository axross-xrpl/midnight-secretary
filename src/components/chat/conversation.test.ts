import { describe, expect, test } from "vitest";
import { tripIdAt } from "@/testing/ids";
import type { PaymentVisibilityInput } from "@/domain/trip";
import type { ScanEvent } from "@/lib/calendar-scan-response";
import type {
  AgeProofResponse,
  AuthorizationResponse,
  FailedAgeCheckResponse,
  MoneyResponse,
  PaymentVisibilityResponse,
  PlanRevisionResponse,
  TripPlanResponse,
  TripResponse,
} from "@/lib/secretary-response";
import type { Bubble, ChatState, PlanVisibility } from "./conversation";
import { conversationOf } from "./conversation";
import type {
  Activity,
  MandateCapabilities,
  RequestFailure,
  Step,
} from "./types";

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

const IZAKAYA = {
  id: "restaurant-izakaya-tenma",
  kind: "restaurant",
  payee: "wallet-service",
  name: "天満 立ち飲み居酒屋 大和",
  city: "大阪",
  genre: "居酒屋",
  price: mst(3000),
  requiredVerifications: ["age"],
  ageLimit: 20,
} as const;

// 居酒屋つきの計画 (承認に成人の証明が要る)
const GATHERING_PLAN: TripPlanResponse = {
  ...PLAN,
  intent: { ...PLAN.intent, purpose: "取引先と懇親会" },
  dining: IZAKAYA,
  total: mst(32440),
};

const CAFE = {
  id: "restaurant-cafe-nakanoshima",
  kind: "restaurant",
  payee: "wallet-service",
  name: "中之島カフェ",
  city: "大阪",
  genre: "カフェ",
  price: mst(1200),
  requiredVerifications: [],
} as const;

// 年齢確認が通らず、居酒屋をカフェに置き換えた計画
const REVISED_PLAN: TripPlanResponse = {
  ...GATHERING_PLAN,
  dining: CAFE,
  total: mst(30640),
};

const TOUR = {
  id: "leisure-inbound-guide-tour",
  kind: "leisure",
  payee: "wallet-service",
  name: "訪日外国人限定 大阪ガイドツアー",
  city: "大阪",
  genre: "tour",
  price: mst(3500),
  requiredVerifications: ["nationality"],
} as const;

// 居酒屋とレジャーつきの計画
const INSPECTION_PLAN: TripPlanResponse = {
  ...GATHERING_PLAN,
  intent: { ...PLAN.intent, purpose: "工場視察と懇親会" },
  leisure: TOUR,
  total: mst(35940),
};

const AGE_PROOF: AgeProofResponse = {
  identity: "identity:user-1",
  cutoffDate: "2006-09-15",
  proofRef: "proof-1",
  provedAt: "2026-09-10T00:01:00Z",
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
  escrow: { status: "held", heldAt: "2026-09-10T00:02:00Z" },
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

// 居酒屋つきの計画は飲食にも公開範囲を持つ
const GATHERING_ALL_PUBLIC: PaymentVisibilityResponse = {
  ...ALL_PUBLIC,
  dining: "public",
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

const PROPOSED_GATHERING: TripResponse = {
  status: "proposed",
  ...BASE,
  plan: GATHERING_PLAN,
};

const PROPOSED_INSPECTION: TripResponse = {
  status: "proposed",
  ...BASE,
  plan: INSPECTION_PLAN,
};

const APPROVED_WITH_PROOF: TripResponse = {
  status: "approved",
  ...BASE,
  plan: GATHERING_PLAN,
  approvedAt: "2026-09-10T00:01:00Z",
  visibility: GATHERING_ALL_PUBLIC,
  authorizations: [],
  ageProof: AGE_PROOF,
};

const PAID_WITH_PROOF: TripResponse = {
  status: "paid",
  ...BASE,
  plan: GATHERING_PLAN,
  approvedAt: "2026-09-10T00:01:00Z",
  visibility: GATHERING_ALL_PUBLIC,
  authorizations: [AUTHORIZATION, SECOND_AUTHORIZATION],
  ageProof: AGE_PROOF,
  paidAt: "2026-09-10T00:02:00Z",
};

// 居酒屋つきの提案を承認したが、証明が通らなかった記録
const FAILED_AGE_CHECK: FailedAgeCheckResponse = {
  ageLimit: 20,
  cutoffDate: "2006-09-15",
  visibility: GATHERING_ALL_PUBLIC,
  checkedAt: "2026-09-10T00:01:00Z",
};

// 証明が通らず、組み直しの返事を待っている提案 (計画は居酒屋つきのまま)
const PROPOSED_AGE_REJECTED: TripResponse = {
  status: "proposed",
  ...BASE,
  plan: GATHERING_PLAN,
  failedAgeCheck: FAILED_AGE_CHECK,
};

// 証明が通らなかった提案を、カフェの計画に組み直した記録
const REVISION: PlanRevisionResponse = {
  reason: { kind: "ageNotVerified", ageLimit: 20, cutoffDate: "2006-09-15" },
  previous: {
    plan: GATHERING_PLAN,
    proposedAt: "2026-09-10T00:00:00Z",
    visibility: GATHERING_ALL_PUBLIC,
  },
  revisedAt: "2026-09-10T00:01:00Z",
};

const PROPOSED_REVISED: TripResponse = {
  status: "proposed",
  ...BASE,
  plan: REVISED_PLAN,
  proposedAt: "2026-09-10T00:01:00Z",
  revision: REVISION,
};

const APPROVED_REVISED: TripResponse = {
  status: "approved",
  ...BASE,
  plan: REVISED_PLAN,
  proposedAt: "2026-09-10T00:01:00Z",
  approvedAt: "2026-09-10T00:02:00Z",
  visibility: { outbound: "public", inbound: "public", dining: "public" },
  authorizations: [],
  revision: REVISION,
};

const IDLE: Activity = { kind: "idle" };

const AWAITING_CONSENT: Activity = { kind: "awaitingConsent" };

const CAN_KEEP_PRIVATE: MandateCapabilities = { privateSettlement: true };

const PUBLIC_ONLY: MandateCapabilities = { privateSettlement: false };

const stateOf = (
  trip: TripResponse | undefined,
  activity: Activity = IDLE,
  capabilities: MandateCapabilities = CAN_KEEP_PRIVATE,
  visibility: PaymentVisibilityInput = {},
): ChatState => {
  return {
    event: OSAKA,
    cap: CAP,
    ...(trip === undefined ? {} : { trip }),
    activity,
    capabilities,
    visibility,
  };
};

const busy = (step: Step): Activity => {
  return { kind: "busy", step };
};

const proposalBubble = (visibility?: PlanVisibility): Bubble => {
  return {
    speaker: "secretary",
    line: {
      kind: "proposal",
      title: OSAKA.title,
      plan: PLAN,
      ...(visibility === undefined ? {} : { visibility }),
    },
    at: "2026-09-10T00:00:00Z",
  };
};

// 提案済みで非公開を選べるとき (まだ何も選んでいない)
const EDITOR_PROPOSAL_BUBBLE = proposalBubble({
  mode: "editor",
  value: {},
  disabled: false,
});

// 承認を押した後 (証明の返事待ちと進行中) はトグルを止める
const FROZEN_EDITOR_PROPOSAL_BUBBLE = proposalBubble({
  mode: "editor",
  value: {},
  disabled: true,
});

// 承認済み以降は記録された公開範囲のバッジになる
const PROPOSAL_BUBBLE = proposalBubble({ mode: "badges", value: ALL_PUBLIC });

const APPROVE_BUBBLE: Bubble = {
  speaker: "user",
  line: { kind: "approve", privateCount: 0 },
};

const gatheringProposalBubble = (visibility: PlanVisibility): Bubble => {
  return {
    speaker: "secretary",
    line: {
      kind: "proposal",
      title: OSAKA.title,
      plan: GATHERING_PLAN,
      visibility,
    },
    at: "2026-09-10T00:00:00Z",
  };
};

// 居酒屋つきの計画の承認済み以降 (飲食も公開のバッジ)
const GATHERING_PROPOSAL_BUBBLE = gatheringProposalBubble({
  mode: "badges",
  value: GATHERING_ALL_PUBLIC,
});

// 居酒屋つきの提案のまま承認を押した後 (トグルは止まった editor のまま)
const FROZEN_GATHERING_PROPOSAL_BUBBLE = gatheringProposalBubble({
  mode: "editor",
  value: {},
  disabled: true,
});

// 組み直した提案は、前の提案 (居酒屋) から変わった飲食の行と合計の差分を持つ
const revisedProposalBubble = (visibility: PlanVisibility): Bubble => {
  return {
    speaker: "secretary",
    line: {
      kind: "proposal",
      title: OSAKA.title,
      plan: REVISED_PLAN,
      visibility,
      diff: { rows: ["dining"], total: true },
    },
    at: "2026-09-10T00:01:00Z",
  };
};

const ASK_PROOF_BUBBLE: Bubble = {
  speaker: "secretary",
  line: { kind: "askProof", place: IZAKAYA, ageLimit: 20 },
};

// 成人を要する計画の承認の 1 手は、承認の写し、証明の問い、証明を送る写しの 3 つ
const GATHERING_APPROVE_BUBBLES: readonly Bubble[] = [
  APPROVE_BUBBLE,
  ASK_PROOF_BUBBLE,

  { speaker: "user", line: { kind: "sendProof" } },
];

// 証明が通らなかった説明と、組み直してよいかの問い (時刻は証明の時刻か作り直しの時刻で、どちらも同じ値)
const AGE_REJECTED_BUBBLE: Bubble = {
  speaker: "secretary",
  line: {
    kind: "ageRejected",
    place: IZAKAYA,
    ageLimit: 20,
    cutoffDate: "2006-09-15",
  },
  at: "2026-09-10T00:01:00Z",
};

const REPLAN_BUBBLE: Bubble = { speaker: "user", line: { kind: "replan" } };

// 証明が通らなかった提案の履歴 (提案はバッジ、承認の写し 3 つ、組み直しの問い)
const AGE_REJECTED_BUBBLES: readonly Bubble[] = [
  GATHERING_PROPOSAL_BUBBLE,
  ...GATHERING_APPROVE_BUBBLES,
  AGE_REJECTED_BUBBLE,
];

// 作り直した提案の前に出る、前の提案から「組み直して」の写しまで
const REVISION_PRELUDE: readonly Bubble[] = [
  ...AGE_REJECTED_BUBBLES,
  REPLAN_BUBBLE,
];

const AGE_VERIFIED_BUBBLE: Bubble = {
  speaker: "secretary",
  line: { kind: "ageVerified", proof: AGE_PROOF, ageLimit: 20 },
  at: "2026-09-10T00:01:00Z",
};

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
      tripId: TRIP_ID,
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
      bubbles: [...INTRO_BUBBLES, EDITOR_PROPOSAL_BUBBLE],
      replies: [{ kind: "approve", trip: PROPOSED, visibility: {} }],
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
          line: {
            kind: "partiallyPaid",
            tripId: TRIP_ID,
            authorizations: [AUTHORIZATION],
          },
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
          line: {
            kind: "written",
            writtenEventId: "written-1",
            confirmedStoreFailed: false,
          },
          at: "2026-09-10T00:03:00Z",
        },
      ],
      replies: [],
    });
  });

  test("確定旅程の保存に失敗した書き戻しは written に印が付く", () => {
    const conversation = conversationOf(
      stateOf({
        ...WRITTEN,
        confirmedStoreError: { kind: "unavailable", cause: "stub" },
      }),
    );

    expect(conversation.bubbles.at(-1)).toStrictEqual({
      speaker: "secretary",
      line: {
        kind: "written",
        writtenEventId: "written-1",
        confirmedStoreFailed: true,
      },
      at: "2026-09-10T00:03:00Z",
    });
  });

  test("approved に ageProof があれば証明を送る写しと askPay の間に ageVerified が入る", () => {
    expect(conversationOf(stateOf(APPROVED_WITH_PROOF))).toStrictEqual({
      bubbles: [
        ...INTRO_BUBBLES,
        GATHERING_PROPOSAL_BUBBLE,
        ...GATHERING_APPROVE_BUBBLES,
        AGE_VERIFIED_BUBBLE,
        ASK_PAY_BUBBLE,
      ],
      replies: [{ kind: "pay", trip: APPROVED_WITH_PROOF, resume: false }],
    });
  });

  test("paid でも ageVerified は承認の 1 手の直後に残る", () => {
    const bubbles = conversationOf(stateOf(PAID_WITH_PROOF)).bubbles;

    expect(bubbles.slice(3, 8)).toStrictEqual([
      GATHERING_PROPOSAL_BUBBLE,
      ...GATHERING_APPROVE_BUBBLES,
      AGE_VERIFIED_BUBBLE,
    ]);
    expect(bubbles.map((bubble) => bubble.line.kind)).toStrictEqual([
      "greeting",
      "ask",
      "propose",
      "proposal",
      "approve",
      "askProof",
      "sendProof",
      "ageVerified",
      "askPay",
      "pay",
      "paid",
      "askWriteBack",
    ]);
  });

  test("ageProof が無ければ居酒屋つきでも ageVerified は出ない", () => {
    const approved: TripResponse = {
      ...APPROVED_WITH_PROOF,
      ageProof: undefined,
    };

    expect(
      conversationOf(stateOf(approved)).bubbles.map(
        (bubble) => bubble.line.kind,
      ),
    ).toStrictEqual([
      "greeting",
      "ask",
      "propose",
      "proposal",
      "approve",
      "askProof",
      "sendProof",
      "askPay",
    ]);
  });
});

describe("conversationOf (進行中)", () => {
  test("最初の提案は挨拶の後に propose の写しと working を足し、返答は無い", () => {
    expect(conversationOf(stateOf(undefined, busy("propose")))).toStrictEqual({
      bubbles: [
        ...INTRO_BUBBLES,

        {
          speaker: "secretary",
          line: {
            kind: "working",
            step: "propose",
            title: OSAKA.title,
          },
        },
      ],
      replies: [],
    });
  });

  test("承認は approve の写しになり、進行中はトグルを止める", () => {
    expect(
      conversationOf(stateOf(PROPOSED, busy("approve"))).bubbles,
    ).toStrictEqual([
      ...INTRO_BUBBLES,
      FROZEN_EDITOR_PROPOSAL_BUBBLE,
      APPROVE_BUBBLE,

      {
        speaker: "secretary",
        line: {
          kind: "working",
          step: "approve",
          title: OSAKA.title,
        },
      },
    ]);
  });

  test("成人を要する計画の承認は証明の問いまで写し、年齢の証明つきの working になる", () => {
    expect(
      conversationOf(stateOf(PROPOSED_GATHERING, busy("approve"))).bubbles,
    ).toStrictEqual([
      ...INTRO_BUBBLES,
      FROZEN_GATHERING_PROPOSAL_BUBBLE,
      ...GATHERING_APPROVE_BUBBLES,

      {
        speaker: "secretary",
        line: {
          kind: "working",
          step: "approveWithProof",
          title: OSAKA.title,
        },
      },
    ]);
  });

  test("成人を要する計画でも支払いの working は証明つきにならない", () => {
    const bubbles = conversationOf(
      stateOf(APPROVED_WITH_PROOF, busy("pay")),
    ).bubbles;

    expect(bubbles.at(-1)).toStrictEqual({
      speaker: "secretary",
      line: {
        kind: "working",
        step: "pay",
        title: OSAKA.title,
      },
    });
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
        line: {
          kind: "working",
          step: "pay",
          title: OSAKA.title,
        },
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
        line: {
          kind: "working",
          step: "writeBack",
          title: OSAKA.title,
        },
      },
    ]);
  });
});

describe("conversationOf (公開範囲)", () => {
  test("非公開を扱えない支払い枠ではトグルを出さず、承認の返答も空の指定になる", () => {
    expect(conversationOf(stateOf(PROPOSED, IDLE, PUBLIC_ONLY))).toStrictEqual({
      bubbles: [...INTRO_BUBBLES, proposalBubble()],
      replies: [{ kind: "approve", trip: PROPOSED, visibility: {} }],
    });
  });

  test("非公開を扱えない支払い枠では、選択が残っていても返答に載せない", () => {
    const state = stateOf(PROPOSED, IDLE, PUBLIC_ONLY, { inbound: "private" });

    expect(conversationOf(state).replies).toStrictEqual([
      { kind: "approve", trip: PROPOSED, visibility: {} },
    ]);
  });

  test("選んだ非公開はトグルの値と承認の返答の両方に載る", () => {
    const state = stateOf(PROPOSED, IDLE, CAN_KEEP_PRIVATE, {
      inbound: "private",
    });

    expect(conversationOf(state)).toStrictEqual({
      bubbles: [
        ...INTRO_BUBBLES,
        proposalBubble({
          mode: "editor",
          value: { inbound: "private" },
          disabled: false,
        }),
      ],
      replies: [
        {
          kind: "approve",
          trip: PROPOSED,
          visibility: { inbound: "private" },
        },
      ],
    });
  });

  test("承認の写しは選んだ非公開の件数を持つ", () => {
    const state = stateOf(PROPOSED, busy("approve"), CAN_KEEP_PRIVATE, {
      inbound: "private",
    });

    expect(conversationOf(state).bubbles.at(-2)).toStrictEqual({
      speaker: "user",
      line: { kind: "approve", privateCount: 1 },
    });
  });

  test("飲食を非公開にすると、写しの件数にも数える", () => {
    const state = stateOf(
      PROPOSED_GATHERING,
      busy("approve"),
      CAN_KEEP_PRIVATE,
      { dining: "private" },
    );

    // 成人を要する計画なので、承認の写しの後に証明の問いと同意の写しが続く
    expect(conversationOf(state).bubbles.at(-4)).toStrictEqual({
      speaker: "user",
      line: { kind: "approve", privateCount: 1 },
    });
  });

  test("飲食とレジャーを非公開にすると、写しの件数は 2 になる", () => {
    const state = stateOf(
      PROPOSED_INSPECTION,
      busy("approve"),
      CAN_KEEP_PRIVATE,
      { dining: "private", leisure: "private" },
    );

    expect(conversationOf(state).bubbles.at(-4)).toStrictEqual({
      speaker: "user",
      line: { kind: "approve", privateCount: 2 },
    });
  });

  test("承認済み以降の写しは trip に残った公開範囲から数える", () => {
    const approved: TripResponse = {
      ...APPROVED,
      visibility: { outbound: "public", inbound: "private" },
    };

    const bubbles = conversationOf(stateOf(approved)).bubbles;

    expect(bubbles[3]).toStrictEqual(
      proposalBubble({
        mode: "badges",
        value: { outbound: "public", inbound: "private" },
      }),
    );
    expect(bubbles[4]).toStrictEqual({
      speaker: "user",
      line: { kind: "approve", privateCount: 1 },
    });
  });
});

describe("conversationOf (証明の同意)", () => {
  test("返事待ちは承認の写しと証明の問いを足し、返答は証明を送るかやめるかの 2 つ", () => {
    expect(
      conversationOf(stateOf(PROPOSED_GATHERING, AWAITING_CONSENT)),
    ).toStrictEqual({
      bubbles: [
        ...INTRO_BUBBLES,
        FROZEN_GATHERING_PROPOSAL_BUBBLE,
        APPROVE_BUBBLE,
        ASK_PROOF_BUBBLE,
      ],
      replies: [
        { kind: "sendProof", trip: PROPOSED_GATHERING, visibility: {} },

        { kind: "declineProof" },
      ],
    });
  });

  test("選んだ非公開は返事待ちの写しにも返答にも載る", () => {
    const conversation = conversationOf(
      stateOf(PROPOSED_GATHERING, AWAITING_CONSENT, CAN_KEEP_PRIVATE, {
        dining: "private",
      }),
    );

    expect(conversation.bubbles.at(-2)).toStrictEqual({
      speaker: "user",
      line: { kind: "approve", privateCount: 1 },
    });
    expect(conversation.replies).toStrictEqual([
      {
        kind: "sendProof",
        trip: PROPOSED_GATHERING,
        visibility: { dining: "private" },
      },

      { kind: "declineProof" },
    ]);
  });

  test("成人を要しない計画の返事待ちでは、承認の写しを出さず承認の返答に戻る", () => {
    expect(conversationOf(stateOf(PROPOSED, AWAITING_CONSENT))).toStrictEqual({
      bubbles: [...INTRO_BUBBLES, FROZEN_EDITOR_PROPOSAL_BUBBLE],
      replies: [{ kind: "approve", trip: PROPOSED, visibility: {} }],
    });
  });
});

describe("conversationOf (証明が通らなかった提案)", () => {
  test("提案はバッジで出し、承認の写し 3 つと組み直しの問いが続き、返答は組み直しだけ", () => {
    expect(conversationOf(stateOf(PROPOSED_AGE_REJECTED))).toStrictEqual({
      bubbles: [...INTRO_BUBBLES, ...AGE_REJECTED_BUBBLES],
      replies: [{ kind: "replan", trip: PROPOSED_AGE_REJECTED }],
    });
  });

  test("承認の写しは承認で選んでいた公開範囲から数え、選択中の値は見ない", () => {
    const rejected: TripResponse = {
      ...PROPOSED_AGE_REJECTED,
      failedAgeCheck: {
        ...FAILED_AGE_CHECK,
        visibility: { ...GATHERING_ALL_PUBLIC, dining: "private" },
      },
    };
    const conversation = conversationOf(
      stateOf(rejected, IDLE, CAN_KEEP_PRIVATE, { inbound: "private" }),
    );

    expect(conversation.bubbles[3]).toStrictEqual(
      gatheringProposalBubble({
        mode: "badges",
        value: { ...GATHERING_ALL_PUBLIC, dining: "private" },
      }),
    );
    expect(conversation.bubbles[4]).toStrictEqual({
      speaker: "user",
      line: { kind: "approve", privateCount: 1 },
    });
    expect(conversation.replies).toStrictEqual([
      { kind: "replan", trip: rejected },
    ]);
  });

  test("組み直しの進行中は「組み直して」の写しと working を足し、返答は無い", () => {
    expect(
      conversationOf(stateOf(PROPOSED_AGE_REJECTED, busy("replan"))),
    ).toStrictEqual({
      bubbles: [
        ...INTRO_BUBBLES,
        ...AGE_REJECTED_BUBBLES,
        REPLAN_BUBBLE,

        {
          speaker: "secretary",
          line: { kind: "working", step: "replan", title: OSAKA.title },
        },
      ],
      replies: [],
    });
  });

  test("年齢制限つきの候補が無い計画の記録は (起こらないはず) 無いのと同じに扱う", () => {
    const odd: TripResponse = {
      ...PROPOSED_AGE_REJECTED,
      plan: PLAN,
    };

    expect(conversationOf(stateOf(odd))).toStrictEqual({
      bubbles: [...INTRO_BUBBLES, EDITOR_PROPOSAL_BUBBLE],
      replies: [{ kind: "approve", trip: odd, visibility: {} }],
    });
  });
});

describe("conversationOf (作り直した提案)", () => {
  test("作り直した提案の前に、前の提案と承認と組み直しの問いと「組み直して」の写しが出る", () => {
    expect(conversationOf(stateOf(PROPOSED_REVISED))).toStrictEqual({
      bubbles: [
        ...INTRO_BUBBLES,
        ...REVISION_PRELUDE,
        revisedProposalBubble({ mode: "editor", value: {}, disabled: false }),
      ],
      replies: [{ kind: "approve", trip: PROPOSED_REVISED, visibility: {} }],
    });
  });

  test("作り直した提案を承認した後も経緯が残り、証明の吹き出しは出ない", () => {
    const bubbles = conversationOf(stateOf(APPROVED_REVISED)).bubbles;

    expect(bubbles.slice(3, 9)).toStrictEqual(REVISION_PRELUDE);
    expect(bubbles[9]).toStrictEqual(
      revisedProposalBubble({ mode: "badges", value: GATHERING_ALL_PUBLIC }),
    );
    expect(bubbles.map((bubble) => bubble.line.kind)).toStrictEqual([
      "greeting",
      "ask",
      "propose",
      "proposal",
      "approve",
      "askProof",
      "sendProof",
      "ageRejected",
      "replan",
      "proposal",
      "approve",
      "askPay",
    ]);
  });

  test("作り直していない提案には前置きが出ない", () => {
    expect(
      conversationOf(stateOf(PROPOSED_GATHERING)).bubbles.map(
        (bubble) => bubble.line.kind,
      ),
    ).toStrictEqual(["greeting", "ask", "propose", "proposal"]);
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
