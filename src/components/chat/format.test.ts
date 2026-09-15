import { describe, expect, test } from "vitest";
import type {
  MandateResponse,
  MoneyResponse,
  TripPlanResponse,
} from "@/lib/secretary-response";
import type { FormatNumber } from "./format";
import {
  adultRequirementOfResponse,
  asOfDateOf,
  inclusiveEndDate,
  moneyText,
  nightsOf,
  plainSpaces,
  planRows,
  remainingOf,
  shortHash,
  usedPercent,
} from "./format";

// next-intl の代わりに固定のロケールで桁区切りにする
const formatNumber: FormatNumber = (amount) => {
  return amount.toLocaleString("en-US");
};

const mst = (amount: number): MoneyResponse => {
  return { amount, currency: "MST" };
};

const mandateOf = (cap: number, spent: number): MandateResponse => {
  return {
    id: "mandate-1",
    cap: mst(cap),
    spent: mst(spent),
    expiresAt: "2026-10-10T09:00:00+09:00",
    purpose: "9 月の出張",
    commitment: "commitment-1",
  };
};

const RAIL_OUT = {
  id: "rail-tokyo-fukuoka",
  mode: "rail",
  vendor: "デモ鉄道",
  payee: "wallet-rail",
  origin: "東京",
  destination: "博多",
  departAt: "2026-09-21T09:00:00+09:00",
  arriveAt: "2026-09-21T14:00:00+09:00",
  price: mst(23000),
} as const;

const RAIL_BACK = {
  ...RAIL_OUT,
  id: "rail-fukuoka-tokyo",
  origin: "博多",
  destination: "東京",
  departAt: "2026-09-22T15:00:00+09:00",
  arriveAt: "2026-09-22T20:00:00+09:00",
} as const;

const HOTEL = {
  id: "hotel-fukuoka",
  vendor: "デモホテルズ",
  payee: "wallet-hotel",
  name: "デモホテル福岡",
  city: "福岡",
  checkIn: "2026-09-21",
  checkOut: "2026-09-22",
  price: mst(11000),
} as const;

const INTENT = {
  destination: "福岡",
  departOn: "2026-09-21",
  returnOn: "2026-09-22",
  purpose: "出張",
} as const;

const OVERNIGHT_PLAN: TripPlanResponse = {
  intent: INTENT,
  outbound: RAIL_OUT,
  inbound: RAIL_BACK,
  lodging: HOTEL,
  total: mst(57000),
  rationale: "1 泊で往復する",
};

const DAY_TRIP_PLAN: TripPlanResponse = {
  intent: { ...INTENT, returnOn: "2026-09-21" },
  outbound: RAIL_OUT,
  inbound: RAIL_BACK,
  total: mst(46000),
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

const CAFE = {
  ...IZAKAYA,
  id: "restaurant-cafe-nakanoshima",
  name: "中之島カフェ",
  genre: "カフェ",
  price: mst(1200),
  requiredVerifications: [],
  ageLimit: undefined,
} as const;

const GATHERING_PLAN: TripPlanResponse = {
  ...DAY_TRIP_PLAN,
  dining: IZAKAYA,
  total: mst(49000),
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

describe("moneyText", () => {
  test("桁区切りの整数と通貨コードを並べる", () => {
    expect(moneyText(mst(150000), formatNumber)).toBe("150,000 MST");
  });
});

describe("remainingOf", () => {
  test("上限から使用済みを引く", () => {
    expect(remainingOf(mandateOf(150000, 29440))).toStrictEqual(mst(120560));
  });
});

describe("usedPercent", () => {
  test("上限が 0 なら 0", () => {
    expect(usedPercent(mandateOf(0, 0))).toBe(0);
  });

  test("割合は整数に丸める", () => {
    expect(usedPercent(mandateOf(150000, 20000))).toBe(13);
  });

  test("使い過ぎても 100 で止める", () => {
    expect(usedPercent(mandateOf(150000, 200000))).toBe(100);
  });
});

describe("shortHash", () => {
  test("先頭と末尾を残して縮める", () => {
    expect(shortHash("0x0123456789abcdef0123456789abcdef")).toBe(
      "0x01234567...abcdef",
    );
  });

  test("短いハッシュはそのまま返す", () => {
    expect(shortHash("0xshort")).toBe("0xshort");
  });
});

describe("nightsOf", () => {
  test("同じ日なら 0 泊", () => {
    expect(nightsOf("2026-09-21", "2026-09-21")).toBe(0);
  });

  test("2 日後のチェックアウトは 2 泊", () => {
    expect(nightsOf("2026-09-21", "2026-09-23")).toBe(2);
  });
});

describe("inclusiveEndDate", () => {
  test("2 日にわたる予定の最終日は終了日の前日", () => {
    expect(inclusiveEndDate("2026-09-21", "2026-09-23")).toBe("2026-09-22");
  });

  test("1 日の予定は開始日のまま", () => {
    expect(inclusiveEndDate("2026-09-21", "2026-09-22")).toBe("2026-09-21");
  });

  test("終了日が開始日以前なら開始日", () => {
    expect(inclusiveEndDate("2026-09-21", "2026-09-21")).toBe("2026-09-21");
  });
});

describe("planRows", () => {
  test("宿があれば往路、宿、復路の 3 行になる", () => {
    expect(planRows(OVERNIGHT_PLAN)).toStrictEqual([
      { kind: "transport", category: "outbound", offer: RAIL_OUT },

      { kind: "lodging", category: "lodging", offer: HOTEL },

      { kind: "transport", category: "inbound", offer: RAIL_BACK },
    ]);
  });

  test("宿が無ければ往路と復路の 2 行になる", () => {
    expect(planRows(DAY_TRIP_PLAN)).toStrictEqual([
      { kind: "transport", category: "outbound", offer: RAIL_OUT },

      { kind: "transport", category: "inbound", offer: RAIL_BACK },
    ]);
  });

  test("飲食があれば往路、飲食、復路の 3 行になる", () => {
    expect(planRows(GATHERING_PLAN)).toStrictEqual([
      { kind: "transport", category: "outbound", offer: RAIL_OUT },

      { kind: "dining", category: "dining", offer: IZAKAYA },

      { kind: "transport", category: "inbound", offer: RAIL_BACK },
    ]);
  });

  test("宿と飲食があれば往路、宿、飲食、復路の 4 行になる", () => {
    expect(
      planRows({ ...OVERNIGHT_PLAN, dining: IZAKAYA }).map((row) => row.kind),
    ).toStrictEqual(["transport", "lodging", "dining", "transport"]);
  });

  test("レジャーがあれば往路、レジャー、復路の 3 行になる", () => {
    expect(planRows({ ...DAY_TRIP_PLAN, leisure: TOUR })).toStrictEqual([
      { kind: "transport", category: "outbound", offer: RAIL_OUT },

      { kind: "leisure", category: "leisure", offer: TOUR },

      { kind: "transport", category: "inbound", offer: RAIL_BACK },
    ]);
  });

  test("全部あれば往路、宿、飲食、レジャー、復路の 5 行になる", () => {
    expect(
      planRows({ ...OVERNIGHT_PLAN, dining: IZAKAYA, leisure: TOUR }).map(
        (row) => row.kind,
      ),
    ).toStrictEqual(["transport", "lodging", "dining", "leisure", "transport"]);
  });
});

describe("adultRequirementOfResponse", () => {
  test("年齢確認を要する飲食があればその候補と下限を返す", () => {
    expect(adultRequirementOfResponse(GATHERING_PLAN)).toStrictEqual({
      offer: IZAKAYA,
      ageLimit: 20,
    });
  });

  test("下限を持たない候補は 20 になる", () => {
    const requirement = adultRequirementOfResponse({
      ...GATHERING_PLAN,
      dining: { ...IZAKAYA, ageLimit: undefined },
    });

    expect(requirement?.ageLimit).toBe(20);
  });

  test("年齢確認を要しない飲食なら undefined", () => {
    expect(
      adultRequirementOfResponse({ ...GATHERING_PLAN, dining: CAFE }),
    ).toBeUndefined();
  });

  test("飲食が無ければ undefined", () => {
    expect(adultRequirementOfResponse(DAY_TRIP_PLAN)).toBeUndefined();
  });
});

describe("asOfDateOf", () => {
  test("cutoff の 20 年後が基準日になる", () => {
    expect(asOfDateOf("2006-09-15", 20)).toBe("2026-09-15");
  });

  test("下限が違えばその年数だけ戻す", () => {
    expect(asOfDateOf("2008-01-31", 18)).toBe("2026-01-31");
  });
});

describe("plainSpaces", () => {
  test("Intl の狭い空白と改行しない空白を通常の空白にする", () => {
    expect(plainSpaces("Sep 25\u2009–\u200926, 2026 8:33\u202FAM")).toBe(
      "Sep 25 – 26, 2026 8:33 AM",
    );
  });

  test("通常の空白だけの文字列は変えない", () => {
    expect(plainSpaces("2026/09/25 8:33")).toBe("2026/09/25 8:33");
  });
});
