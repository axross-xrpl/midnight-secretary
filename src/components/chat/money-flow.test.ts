import { describe, expect, test } from "vitest";
import type {
  AuthorizationResponse,
  MoneyResponse,
  TripPlanResponse,
  TripResponse,
} from "@/lib/secretary-response";
import { moneyFlowOf } from "./money-flow";

const mst = (amount: number): MoneyResponse => {
  return { amount, currency: "MST" };
};

const TRIP_ID = "trip-1";

const OUTBOUND = {
  id: "rail-tokyo-osaka",
  mode: "rail",
  vendor: "JR",
  payee: "wallet-rail",
  origin: "東京",
  destination: "新大阪",
  departAt: "2026-09-27T08:33:00+09:00",
  arriveAt: "2026-09-27T11:30:00+09:00",
  price: mst(14400),
} as const;

const INBOUND = {
  ...OUTBOUND,
  id: "rail-osaka-tokyo",
  origin: "新大阪",
  destination: "品川",
  price: mst(14520),
} as const;

const IZAKAYA = {
  id: "dining-izakaya",
  kind: "restaurant",
  payee: "wallet-service",
  name: "居酒屋 なにわ",
  city: "大阪",
  price: mst(6000),
  requiredVerifications: ["age"],
  ageLimit: 20,
} as const;

const PLAN: TripPlanResponse = {
  intent: {
    destination: "大阪",
    departOn: "2026-09-27",
    returnOn: "2026-09-27",
    purpose: "取引先訪問",
  },
  outbound: OUTBOUND,
  inbound: INBOUND,
  dining: IZAKAYA,
  total: mst(34920),
  rationale: "first matching offers",
};

const authorizationOf = (
  offerId: string,
  amount: MoneyResponse,
  escrow: AuthorizationResponse["escrow"],
): AuthorizationResponse => {
  return {
    mandateId: "mandate-1",
    paymentRef: `trip:${TRIP_ID}:${offerId}`,
    amount,
    authorizedAt: "2026-09-10T00:02:00Z",
    publicHash: `hash:${offerId}`,
    settlement: {
      kind: "tokenTransfer",
      transactionId: `tx:${offerId}`,
      recipient: "wallet-rail",
    },
    escrow,
  };
};

const HELD = { status: "held", heldAt: "2026-09-10T00:02:00Z" } as const;
const RELEASED = {
  status: "released",
  heldAt: "2026-09-10T00:02:00Z",
  releasedAt: "2026-09-28T00:00:00Z",
  releaseRef: "release-1",
} as const;

const BASE = {
  id: TRIP_ID,
  event: {
    id: "seed-2",
    title: "大阪出張 (取引先訪問)",
    when: {
      kind: "timed",
      start: "2026-09-27T10:00:00+09:00",
      end: "2026-09-27T17:00:00+09:00",
    },
  },
  plan: PLAN,
  proposedAt: "2026-09-10T00:00:00Z",
} as const;

const PROPOSED: TripResponse = { status: "proposed", ...BASE };

const PAID: TripResponse = {
  status: "paid",
  ...BASE,
  approvedAt: "2026-09-10T00:01:00Z",
  visibility: { outbound: "public", inbound: "public", dining: "private" },
  authorizations: [
    authorizationOf(OUTBOUND.id, OUTBOUND.price, RELEASED),
    authorizationOf(IZAKAYA.id, IZAKAYA.price, HELD),
    authorizationOf(INBOUND.id, INBOUND.price, HELD),
  ],
  paidAt: "2026-09-10T00:03:00Z",
};

describe("moneyFlowOf", () => {
  test("出張が無ければ受取先は空で、預かりも受取済みも 0", () => {
    expect(moneyFlowOf(undefined)).toStrictEqual({
      payees: [],
      held: undefined,
      released: undefined,
    });
  });

  test("提案だけの出張は計画の行がすべて未払いで並ぶ", () => {
    expect(moneyFlowOf(PROPOSED)).toStrictEqual({
      payees: [
        {
          key: OUTBOUND.id,
          kind: "rail",
          title: "東京 -> 新大阪",
          amount: mst(14400),
          status: "unpaid",
        },
        {
          key: IZAKAYA.id,
          kind: "dining",
          title: "居酒屋 なにわ",
          amount: mst(6000),
          status: "unpaid",
        },
        {
          key: INBOUND.id,
          kind: "rail",
          title: "新大阪 -> 品川",
          amount: mst(14520),
          status: "unpaid",
        },
      ],
      held: mst(0),
      released: mst(0),
    });
  });

  test("支払い済みの出張は行ごとに預かり中か受取済みかを持ち、合計を分ける", () => {
    const flow = moneyFlowOf(PAID);

    expect(flow.payees.map((payee) => payee.status)).toStrictEqual([
      "released",
      "held",
      "held",
    ]);
    expect(flow.held).toStrictEqual(mst(20520));
    expect(flow.released).toStrictEqual(mst(14400));
  });
});
