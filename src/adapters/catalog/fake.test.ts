import { describe, expect, test } from "vitest";
import type {
  CatalogManagementPort,
  FareCatalogPort,
  OfferQuery,
} from "@/domain/catalog";
import { mustParse, parseIsoDate } from "@/domain/identifiers.parse";
import type {
  PlaceServiceCreateInput,
  TransportServiceCreateInput,
} from "@/features/services/schemas";
import type { Result } from "@/lib/result";
import type { FakeCatalogIds } from "./fake";
import { createFakeCatalog, seedCatalog } from "./fake";

const catalog = createFakeCatalog(seedCatalog());

const query = (
  origin: string,
  destination: string,
  departOn: string,
  returnOn: string,
): OfferQuery => {
  return {
    origin,
    destination,
    departOn: mustParse(parseIsoDate(departOn)),
    returnOn: mustParse(parseIsoDate(returnOn)),
  };
};

const osakaTwoNights = query("東京", "大阪", "2026-09-14", "2026-09-16");

describe("createFakeCatalog", () => {
  test("料金を持っている目的地を挙げる", async () => {
    expect(await catalog.listDestinations()).toStrictEqual({
      ok: true,
      value: ["大阪", "東京"],
    });
  });

  test("未知の目的地は unknownDestination になる", async () => {
    const result = await catalog.findOffers(
      query("東京", "札幌", "2026-09-14", "2026-09-16"),
    );

    expect(result).toStrictEqual({
      ok: false,
      error: { kind: "unknownDestination", destination: "札幌" },
    });
  });

  test("往復の便に問い合わせた日付を入れて返す", async () => {
    const result = await catalog.findOffers(osakaTwoNights);

    expect(result.ok && result.value.outbound.at(0)).toStrictEqual({
      id: "air-ana-017",
      mode: "air",
      vendor: "ANA 017便",
      payee: "mn_shield-addr_test1demo-transport-seller",
      origin: "HND",
      destination: "ITM",
      departAt: "2026-09-14T07:00:00+09:00",
      arriveAt: "2026-09-14T08:15:00+09:00",
      price: { amount: 13000, currency: "MST" },
      doorToDoor: {
        totalMin: 235,
        totalPrice: { amount: 14350, currency: "MST" },
      },
    });
    expect(result.ok && result.value.inbound.at(0)?.departAt).toBe(
      "2026-09-16T18:00:00+09:00",
    );
  });

  test("door-to-door は仕様の検算値と一致する", async () => {
    const result = await catalog.findOffers(osakaTwoNights);
    const byId = (id: string) =>
      result.ok
        ? result.value.outbound.find((offer) => offer.id === id)?.doorToDoor
        : undefined;

    // 鉄道は速いが高く、航空は遅いが安い。door-to-door でこの逆転が見える
    expect(byId("rail-nozomi-221")).toStrictEqual({
      totalMin: 187,
      totalPrice: { amount: 15010, currency: "MST" },
    });
    expect(byId("air-ana-017")).toStrictEqual({
      totalMin: 235,
      totalPrice: { amount: 14350, currency: "MST" },
    });
    // 運賃は最安でも、成田・関空のアクセスで所要が最長になる
    expect(byId("air-jjp-201")).toStrictEqual({
      totalMin: 320,
      totalPrice: { amount: 12260, currency: "MST" },
    });
  });

  test("出発地は都市名でも地点名でも当たる", async () => {
    const fromCity = await catalog.findOffers(osakaTwoNights);
    const fromSpot = await catalog.findOffers(
      query("品川", "大阪", "2026-09-14", "2026-09-16"),
    );

    expect(fromCity.ok && fromCity.value.outbound.length).toBe(7);
    expect(
      fromSpot.ok && fromSpot.value.outbound.map((offer) => offer.id),
    ).toStrictEqual(["rail-nozomi-221", "rail-nozomi-221-green"]);
  });

  test("宿は泊数分の料金で返る", async () => {
    const result = await catalog.findOffers(osakaTwoNights);

    expect(result.ok && result.value.lodging.at(0)).toStrictEqual({
      id: "hotel-namba-c",
      vendor: "なんばホテルC",
      payee: "mn_shield-addr_test1demo-service-seller",
      name: "なんばホテルC",
      city: "大阪",
      checkIn: "2026-09-14",
      checkOut: "2026-09-16",
      price: { amount: 25000, currency: "MST" },
      rating: 4,
      requiredVerifications: [],
    });
    expect(result.ok && result.value.lodging.length).toBe(7);
  });

  test("宿は評価と要求する本人確認を持つ", async () => {
    const result = await catalog.findOffers(osakaTwoNights);
    const inbound = result.ok
      ? result.value.lodging.find(
          (offer) => offer.id === "hotel-osakabay-inbound",
        )
      : undefined;

    expect(inbound?.rating).toBe(4.5);
    expect(inbound?.requiredVerifications).toStrictEqual(["nationality"]);
  });

  test("日帰りなら宿は空になる", async () => {
    const result = await catalog.findOffers(
      query("東京", "大阪", "2026-09-14", "2026-09-14"),
    );

    expect(result.ok && result.value.lodging).toStrictEqual([]);
    expect(result.ok && result.value.outbound.length).toBe(7);
  });

  test("飲食とレジャーを目的地の分だけ返す", async () => {
    const result = await catalog.findOffers(osakaTwoNights);

    expect(result.ok && result.value.dining.length).toBe(10);
    expect(result.ok && result.value.leisure.length).toBe(10);
    expect(result.ok && result.value.dining.at(0)).toStrictEqual({
      id: "restaurant-bar-akari",
      kind: "restaurant",
      payee: "mn_shield-addr_test1demo-service-seller",
      name: "なんば オーセンティックバー 燈",
      city: "大阪",
      genre: "バー",
      price: { amount: 6000, currency: "MST" },
      requiredVerifications: ["age"],
      ageLimit: 20,
    });
  });

  test("年齢確認が要る候補はしきい値を持つ", async () => {
    const result = await catalog.findOffers(osakaTwoNights);
    const theater = result.ok
      ? result.value.leisure.find(
          (offer) => offer.id === "leisure-namba-night-theater",
        )
      : undefined;

    expect(theater?.requiredVerifications).toStrictEqual(["age"]);
    expect(theater?.ageLimit).toBe(18);
  });

  test("交通手段は絞り込まず rail と air の両方を返す", async () => {
    const result = await catalog.findOffers(osakaTwoNights);
    const modes = result.ok
      ? new Set(result.value.outbound.map((offer) => offer.mode))
      : new Set();

    expect(modes).toStrictEqual(new Set(["rail", "air"]));
  });

  test("出発地が未知でも失敗せず空の便を返す", async () => {
    const result = await catalog.findOffers({
      ...osakaTwoNights,
      origin: "札幌",
    });

    expect(result.ok && result.value.outbound).toStrictEqual([]);
    expect(result.ok && result.value.inbound).toStrictEqual([]);
    expect(result.ok && result.value.lodging.length).toBe(7);
  });
});

// 採番と時計はテスト設定に閉じる (id は Route Handler が uuid として検査するので、その形にする)
const testIds = (): FakeCatalogIds => {
  const state = { issued: 0 };

  return {
    newServiceId: () => {
      state.issued = state.issued + 1;

      return `00000000-0000-4000-8000-${String(state.issued).padStart(12, "0")}`;
    },
    now: () => new Date("2026-09-20T00:00:00.000Z"),
  };
};

const SEEDED_AT = new Date("2026-09-20T00:00:00.000Z");

const managed = (): CatalogManagementPort & FareCatalogPort => {
  return createFakeCatalog(seedCatalog(), testIds());
};

const restaurantInput = (code: string): PlaceServiceCreateInput => {
  return {
    kind: "restaurant",
    code,
    name: "新しい居酒屋",
    city: "大阪",
    address: "大阪市北区",
    nearestStation: "大阪駅",
    stationAccessMin: 5,
    price: 4000,
    requiredVerifications: ["age"],
    itemName: "コース",
    genre: "居酒屋",
    openFrom: "17:00",
    openTo: "23:00",
    checkinFrom: null,
    checkoutBy: null,
    rating: null,
    breakfastIncluded: null,
    hasAlcohol: true,
    seats: null,
    ageLimit: 20,
    walletAddress: "mn_shield-addr_test1demo-service-seller",
    active: true,
  };
};

const railInput = (code: string): TransportServiceCreateInput => {
  return {
    mode: "rail",
    code,
    name: "JR東海道新幹線 のぞみ999号",
    fromCity: "東京",
    toCity: "大阪",
    fromSpot: "東京",
    toSpot: "新大阪",
    departTime: "12:00",
    arriveTime: "14:30",
    durationMin: 150,
    price: 14720,
    originAccessMin: 25,
    boardingBufferMin: 10,
    arrivalBufferMin: 0,
    destinationAccessMin: 15,
    accessFare: 660,
    seatClass: "指定席",
    walletAddress: "mn_shield-addr_test1demo-transport-seller",
    active: true,
  };
};

const mustOk = <T, E>(result: Result<T, E>): T => {
  if (!result.ok) {
    throw new Error(`test: unexpected failure ${JSON.stringify(result.error)}`);
  }

  return result.value;
};

const CATEGORY_ORDER = ["rail", "air", "hotel", "restaurant", "leisure"];

describe("createFakeCatalog のサービス管理", () => {
  test("seed の全行を種別の論理順で一覧する", async () => {
    const items = mustOk(await managed().listServices({}));

    expect(items.length).toBe(37);
    expect(
      items.map((item) => CATEGORY_ORDER.indexOf(item.category)),
    ).toStrictEqual(
      items
        .map((item) => CATEGORY_ORDER.indexOf(item.category))
        .toSorted((a, b) => a - b),
    );
    expect(items.at(0)?.updatedAt).toStrictEqual(SEEDED_AT);
    expect(items.at(0)?.category).toBe("rail");
    expect(
      items.find((item) => item.code === "restaurant-izakaya-tenma"),
    ).toStrictEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      category: "restaurant",
      code: "restaurant-izakaya-tenma",
      name: "天満 立ち飲み居酒屋 大和",
      price: 3000,
      location: "大阪",
      station: "大阪駅",
      stationAccessMin: 5,
      requiredVerifications: ["age"],
      ageLimit: 20,
      active: true,
      updatedAt: SEEDED_AT,
    });
    expect(items.find((item) => item.code === "rail-nozomi-221")).toMatchObject(
      {
        category: "rail",
        location: "品川 → 新大阪",
        station: null,
        stationAccessMin: null,
        requiredVerifications: [],
        ageLimit: null,
      },
    );
  });

  test("種別・都市・文字列で絞り込める", async () => {
    const catalog = managed();

    const restaurants = mustOk(
      await catalog.listServices({ category: "restaurant" }),
    );
    const tokyo = mustOk(await catalog.listServices({ city: "東京" }));
    const nozomi = mustOk(await catalog.listServices({ query: "のぞみ" }));

    expect(restaurants.length).toBe(10);
    expect(restaurants.every((item) => item.category === "restaurant")).toBe(
      true,
    );
    // 交通は出発・到着のどちらかが東京なら当たる。場所系は所在地が大阪なので当たらない
    expect(tokyo.length).toBe(10);
    expect(nozomi.map((item) => item.code)).toStrictEqual([
      "rail-nozomi-215",
      "rail-nozomi-221",
      "rail-nozomi-221-green",
      "rail-nozomi-232",
      "rail-nozomi-246",
    ]);
  });

  test("id で詳細を引け、無ければ undefined", async () => {
    const catalog = managed();
    const items = mustOk(await catalog.listServices({}));
    const rail = items.find((item) => item.code === "rail-nozomi-221");
    const hotel = items.find((item) => item.code === "hotel-namba-c");

    const transport = mustOk(await catalog.getTransportService(rail?.id ?? ""));
    const place = mustOk(await catalog.getPlaceService(hotel?.id ?? ""));
    const missing = mustOk(
      await catalog.getTransportService("00000000-0000-4000-8000-ffffffffffff"),
    );

    expect(transport).toMatchObject({
      code: "rail-nozomi-221",
      mode: "rail",
      fromSpot: "品川",
      departTime: "10:00",
      seatClass: null,
      walletAddress: "mn_shield-addr_test1demo-transport-seller",
    });
    expect(place).toMatchObject({
      code: "hotel-namba-c",
      kind: "hotel",
      price: 12500,
      rating: 4,
      genre: null,
    });
    expect(missing).toBeUndefined();
  });

  test("拠点の選択肢は有効な交通の出発地から導く", async () => {
    expect(await managed().listHomeOptions()).toStrictEqual({
      ok: true,
      value: [
        { city: "大阪", spots: ["ITM", "新大阪"] },
        { city: "東京", spots: ["HND", "NRT", "品川", "東京"] },
      ],
    });
  });

  test("ジャンルの選択肢は有効な飲食・レジャーの genre から導く", async () => {
    expect(await managed().listGenreOptions()).toStrictEqual({
      ok: true,
      value: {
        dining: [
          "カフェ",
          "バー",
          "ビール",
          "中華",
          "和食",
          "居酒屋",
          "粉もん",
        ],
        leisure: [
          "aquarium",
          "art",
          "baseball",
          "history",
          "show",
          "sightseeing",
          "soccer",
          "tour",
        ],
      },
    });
  });

  test("追加した場所は一覧と候補の両方に現れる", async () => {
    const catalog = managed();

    const created = mustOk(
      await catalog.createPlaceService(restaurantInput("restaurant-new")),
    );
    const items = mustOk(
      await catalog.listServices({ category: "restaurant" }),
    );
    const offers = mustOk(await catalog.findOffers(osakaTwoNights));

    expect(created).toMatchObject({
      id: "00000000-0000-4000-8000-000000000038",
      code: "restaurant-new",
      kind: "restaurant",
      genre: "居酒屋",
      active: true,
      updatedAt: SEEDED_AT,
    });
    expect(items.length).toBe(11);
    expect(
      offers.dining.find((offer) => offer.id === "restaurant-new"),
    ).toStrictEqual({
      id: "restaurant-new",
      kind: "restaurant",
      payee: "mn_shield-addr_test1demo-service-seller",
      name: "新しい居酒屋",
      city: "大阪",
      genre: "居酒屋",
      price: { amount: 4000, currency: "MST" },
      requiredVerifications: ["age"],
      ageLimit: 20,
    });
  });

  test("追加した交通は候補に現れる", async () => {
    const catalog = managed();

    const created = mustOk(
      await catalog.createTransportService(railInput("rail-nozomi-999")),
    );
    const offers = mustOk(await catalog.findOffers(osakaTwoNights));

    expect(created.departTime).toBe("12:00");
    expect(
      offers.outbound.find((offer) => offer.id === "rail-nozomi-999")?.departAt,
    ).toBe("2026-09-14T12:00:00+09:00");
  });

  test("同じ code は同じ表の中で重複できない", async () => {
    const catalog = managed();

    expect(
      await catalog.createPlaceService(
        restaurantInput("restaurant-izakaya-tenma"),
      ),
    ).toStrictEqual({ ok: false, error: { kind: "duplicateCode" } });
    expect(
      await catalog.createTransportService(railInput("rail-nozomi-221")),
    ).toStrictEqual({ ok: false, error: { kind: "duplicateCode" } });
  });

  test("更新は取得時の updatedAt が一致するときだけ通る", async () => {
    const catalog = managed();
    const created = mustOk(
      await catalog.createPlaceService(restaurantInput("restaurant-new")),
    );
    const input = {
      ...restaurantInput("restaurant-new"),
      price: 4500,
      updatedAt: created.updatedAt.toISOString(),
    };

    const updated = mustOk(await catalog.updatePlaceService(created.id, input));
    const stale = await catalog.updatePlaceService(created.id, input);
    const otherKind = await catalog.updatePlaceService(created.id, {
      ...input,
      kind: "leisure",
      updatedAt: updated.updatedAt.toISOString(),
    });
    const missing = await catalog.updatePlaceService(
      "00000000-0000-4000-8000-ffffffffffff",
      input,
    );

    expect(updated.price).toBe(4500);
    // 時計が止まっているので updatedAt は変わらないが、同じ時刻なので次の更新も通る
    expect(stale.ok).toBe(true);
    expect(otherKind).toStrictEqual({
      ok: false,
      error: { kind: "immutableCategory" },
    });
    expect(missing).toStrictEqual({ ok: false, error: { kind: "notFound" } });
    expect(
      await catalog.updatePlaceService(created.id, {
        ...input,
        updatedAt: "2020-01-01T00:00:00.000Z",
      }),
    ).toStrictEqual({ ok: false, error: { kind: "conflict" } });
  });

  test("無効にした行は一覧の既定と候補から消え、all では見える", async () => {
    const catalog = managed();
    const items = mustOk(await catalog.listServices({ category: "rail" }));
    const target = items.find((item) => item.code === "rail-nozomi-221");

    const disabled = mustOk(
      await catalog.disableTransportService(
        target?.id ?? "",
        target?.updatedAt.toISOString() ?? "",
      ),
    );
    const active = mustOk(await catalog.listServices({ category: "rail" }));
    const all = mustOk(
      await catalog.listServices({ category: "rail", active: "all" }),
    );
    const offers = mustOk(await catalog.findOffers(osakaTwoNights));

    expect(disabled.active).toBe(false);
    expect(active.length).toBe(items.length - 1);
    expect(all.length).toBe(items.length);
    expect(
      offers.outbound.some((offer) => offer.id === "rail-nozomi-221"),
    ).toBe(false);
    expect(
      await catalog.disableTransportService(
        target?.id ?? "",
        "2020-01-01T00:00:00.000Z",
      ),
    ).toStrictEqual({ ok: false, error: { kind: "conflict" } });
    expect(
      await catalog.disablePlaceService(
        "00000000-0000-4000-8000-ffffffffffff",
        "",
      ),
    ).toStrictEqual({ ok: false, error: { kind: "notFound" } });
  });
});
