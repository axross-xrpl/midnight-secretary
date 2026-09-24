import { describe, expect, test } from "vitest";
import { serviceIdAt, testCatalogIds } from "@/testing/ids";
import type { OfferQuery } from "@/domain/catalog";
import type { IsoDateTime } from "@/domain/identifiers";
import {
  mustParse,
  parseIsoDate,
  parseIsoDateTime,
} from "@/domain/identifiers.parse";
import type {
  ServiceListItemDto,
  TransportServiceCreateInput,
  TransportServiceDetailDto,
  TransportServiceUpdateInput,
} from "@/features/services/schemas";
import type { CatalogSettingsPort } from "@/features/services/settings-port";
import type { Result } from "@/lib/result";
import type { FakeCatalogIds } from "./fake";
import { createFakeCatalog, seedCatalog } from "./fake";

const at = (raw: string): IsoDateTime => {
  return mustParse(parseIsoDateTime(raw));
};

const SEEDED_AT = at("2026-09-24T00:00:00.000Z");

const LATER = at("2026-09-24T01:00:00.000Z");

// seed の行は交通 10、宿泊 7、飲食 10、レジャー 10 で、採番は交通 -> 宿泊 -> 飲食・レジャーの順
const SEEDED_ROWS = 37;

type TestCatalogIds = FakeCatalogIds & {
  advanceTo: (next: IsoDateTime) => void;
};

// 採番は共有の連番の Stub に任せ、時計はテストが進められるよう閉じた入れ物に持つ
const testIds = (): TestCatalogIds => {
  const clock = { now: SEEDED_AT };

  return {
    ...testCatalogIds(SEEDED_AT),
    now: () => clock.now,
    advanceTo: (next) => {
      clock.now = next;
    },
  };
};

// Fake は状態を持つので、テストごとに組み直す
const testCatalog = () => {
  const ids = testIds();

  return { ids, catalog: createFakeCatalog(seedCatalog(), ids) };
};

// 期待どおり成功したことを前提に値を取り出す (失敗はテストの失敗なので throw)
const mustOk = <T, E>(result: Result<T, E>): T => {
  if (!result.ok) {
    throw new Error(`test: unexpected failure ${JSON.stringify(result.error)}`);
  }

  return result.value;
};

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

// 画面は詳細を読んで編集するので、読んだ行をそのまま更新の入力にする
const updateInputOf = (
  detail: TransportServiceDetailDto,
): TransportServiceUpdateInput => {
  return {
    mode: detail.mode,
    code: detail.code,
    name: detail.name,
    fromCity: detail.fromCity,
    toCity: detail.toCity,
    fromSpot: detail.fromSpot,
    toSpot: detail.toSpot,
    departTime: detail.departTime,
    arriveTime: detail.arriveTime,
    durationMin: detail.durationMin,
    price: detail.price,
    originAccessMin: detail.originAccessMin,
    boardingBufferMin: detail.boardingBufferMin,
    arrivalBufferMin: detail.arrivalBufferMin,
    destinationAccessMin: detail.destinationAccessMin,
    accessFare: detail.accessFare,
    seatClass: detail.seatClass,
    walletAddress: detail.walletAddress,
    active: detail.active,
    updatedAt: detail.updatedAt,
  };
};

const NAGOYA_EXPRESS: TransportServiceCreateInput = {
  mode: "rail",
  code: "rail-nagoya-test",
  name: "テスト特急 名古屋行き",
  fromCity: "東京",
  toCity: "名古屋",
  fromSpot: "東京",
  toSpot: "名古屋",
  departTime: "07:00",
  arriveTime: "08:40",
  durationMin: 100,
  price: 11000,
  originAccessMin: 25,
  boardingBufferMin: 10,
  arrivalBufferMin: 0,
  destinationAccessMin: 15,
  accessFare: 500,
  seatClass: null,
  walletAddress: "mn_shield-addr_test1demo-transport-seller",
  active: true,
};

// 一覧の code から詳細を引く (無ければテスト設定の誤りなので throw)
const mustTransport = async (
  catalog: CatalogSettingsPort,
  code: string,
): Promise<TransportServiceDetailDto> => {
  const listed = mustOk(await catalog.listServices({ active: "all" })).find(
    (item) => item.code === code,
  );

  if (listed === undefined) {
    throw new Error(`test: no service ${code}`);
  }

  const detail = mustOk(await catalog.getTransportService(listed.id));

  if (detail === undefined) {
    throw new Error(`test: no transport ${code}`);
  }

  return detail;
};

const namesIn = (
  items: readonly ServiceListItemDto[],
  category: ServiceListItemDto["category"],
): string[] => {
  return items
    .filter((item) => item.category === category)
    .map((item) => item.name);
};

describe("createFakeCatalog の秘書の面", () => {
  const { catalog } = testCatalog();

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

describe("createFakeCatalog の設定画面の面", () => {
  test("絞り込みなしでは有効な行だけを、種別の論理順、種別の中は名前順で返す", async () => {
    const { catalog } = testCatalog();
    const hikari = await mustTransport(catalog, "rail-hikari-505");

    mustOk(await catalog.disableTransportService(hikari.id, hikari.updatedAt));

    const items = mustOk(await catalog.listServices({}));

    expect(items.length).toBe(SEEDED_ROWS - 1);
    expect(items.every((item) => item.active)).toBe(true);
    expect([...new Set(items.map((item) => item.category))]).toStrictEqual([
      "rail",
      "air",
      "hotel",
      "restaurant",
      "leisure",
    ]);
    expect(namesIn(items, "rail")).toStrictEqual([
      "JR東海道新幹線 のぞみ215号",
      "JR東海道新幹線 のぞみ221号",
      "JR東海道新幹線 のぞみ221号 グリーン車",
      "JR東海道新幹線 のぞみ232号",
      "JR東海道新幹線 のぞみ246号",
    ]);
    expect(namesIn(items, "air")).toStrictEqual([
      "ANA 017便",
      "ANA 038便",
      "JAL 105便",
      "Jetstar 201便",
    ]);
  });

  test("一覧の行は画面の形で、交通は区間、場所系は都市と最寄り駅を持つ", async () => {
    const { catalog } = testCatalog();
    const items = mustOk(await catalog.listServices({}));

    expect(items.find((item) => item.code === "air-ana-017")).toStrictEqual({
      id: serviceIdAt(1),
      category: "air",
      code: "air-ana-017",
      name: "ANA 017便",
      price: 13000,
      location: "HND → ITM",
      station: null,
      stationAccessMin: null,
      requiredVerifications: [],
      ageLimit: null,
      active: true,
      updatedAt: SEEDED_AT,
    });
    expect(
      items.find((item) => item.code === "restaurant-bar-akari"),
    ).toStrictEqual({
      id: serviceIdAt(18),
      category: "restaurant",
      code: "restaurant-bar-akari",
      name: "なんば オーセンティックバー 燈",
      price: 6000,
      location: "大阪",
      station: "大阪",
      stationAccessMin: 5,
      requiredVerifications: ["age"],
      ageLimit: 20,
      active: true,
      updatedAt: SEEDED_AT,
    });
  });

  test("種別で絞る", async () => {
    const { catalog } = testCatalog();
    const hotels = mustOk(await catalog.listServices({ category: "hotel" }));

    expect(hotels.length).toBe(7);
    expect(hotels.every((item) => item.category === "hotel")).toBe(true);
  });

  test("都市で絞ると、交通は出発と到着のどちらかが一致すれば出る", async () => {
    const { catalog } = testCatalog();
    const tokyo = mustOk(await catalog.listServices({ city: "東京" }));

    // 東京発の 7 本と東京着の 3 本で、場所系は全部大阪なので出ない
    expect(tokyo.length).toBe(10);
    expect(tokyo.map((item) => item.code)).toContain("air-ana-017");
    expect(tokyo.map((item) => item.code)).toContain("air-ana-038");
    expect(tokyo.every((item) => item.category !== "hotel")).toBe(true);
  });

  test("文字列で絞ると、大文字小文字を区別しない部分一致になる", async () => {
    const { catalog } = testCatalog();
    const nozomi = mustOk(await catalog.listServices({ query: "NOZOMI" }));

    expect(nozomi.map((item) => item.code)).toStrictEqual([
      "rail-nozomi-215",
      "rail-nozomi-221",
      "rail-nozomi-221-green",
      "rail-nozomi-232",
      "rail-nozomi-246",
    ]);
  });

  test("active: all なら無効な行も出る", async () => {
    const { catalog } = testCatalog();
    const hikari = await mustTransport(catalog, "rail-hikari-505");

    mustOk(await catalog.disableTransportService(hikari.id, hikari.updatedAt));

    const all = mustOk(await catalog.listServices({ active: "all" }));
    const inactive = mustOk(await catalog.listServices({ active: false }));

    expect(all.length).toBe(SEEDED_ROWS);
    expect(inactive.map((item) => item.code)).toStrictEqual([
      "rail-hikari-505",
    ]);
  });

  test("一覧の id で詳細が取れ、無い id は undefined になる", async () => {
    const { catalog } = testCatalog();
    const items = mustOk(await catalog.listServices({}));
    const hotel = items.find((item) => item.code === "hotel-namba-c");

    expect(
      mustOk(await catalog.getPlaceService(hotel?.id ?? "")),
    ).toStrictEqual({
      id: serviceIdAt(11),
      code: "hotel-namba-c",
      name: "なんばホテルC",
      kind: "hotel",
      city: "大阪",
      address: "大阪",
      nearestStation: "大阪",
      stationAccessMin: 5,
      price: 12500,
      requiredVerifications: [],
      itemName: null,
      genre: null,
      openFrom: null,
      openTo: null,
      checkinFrom: null,
      checkoutBy: null,
      rating: 4,
      breakfastIncluded: null,
      hasAlcohol: null,
      seats: null,
      ageLimit: null,
      walletAddress: "mn_shield-addr_test1demo-service-seller",
      active: true,
      updatedAt: SEEDED_AT,
    });
    expect((await mustTransport(catalog, "air-ana-017")).id).toBe(
      serviceIdAt(1),
    );
    expect(await catalog.getTransportService(serviceIdAt(999))).toStrictEqual({
      ok: true,
      value: undefined,
    });
    expect(await catalog.getPlaceService(serviceIdAt(999))).toStrictEqual({
      ok: true,
      value: undefined,
    });
  });

  test("作成すると新しい id と今の時刻で返り、一覧に出る", async () => {
    const { ids, catalog } = testCatalog();

    ids.advanceTo(LATER);

    const created = mustOk(
      await catalog.createTransportService(NAGOYA_EXPRESS),
    );

    expect(created).toStrictEqual({
      id: serviceIdAt(SEEDED_ROWS + 1),
      ...NAGOYA_EXPRESS,
      updatedAt: LATER,
    });
    expect(
      mustOk(await catalog.listServices({})).map((item) => item.code),
    ).toContain("rail-nagoya-test");
  });

  test("既存の code で作成すると duplicateCode になる", async () => {
    const { catalog } = testCatalog();

    expect(
      await catalog.createTransportService({
        ...NAGOYA_EXPRESS,
        code: "rail-hikari-505",
      }),
    ).toStrictEqual({ ok: false, error: { kind: "duplicateCode" } });
  });

  test("取得した updatedAt で更新でき、updatedAt が進む", async () => {
    const { ids, catalog } = testCatalog();
    const hikari = await mustTransport(catalog, "rail-hikari-505");

    ids.advanceTo(LATER);

    const updated = mustOk(
      await catalog.updateTransportService(hikari.id, {
        ...updateInputOf(hikari),
        price: 20000,
      }),
    );

    expect(updated).toStrictEqual({
      ...hikari,
      price: 20000,
      updatedAt: LATER,
    });
  });

  test("古い updatedAt の更新は conflict になる", async () => {
    const { ids, catalog } = testCatalog();
    const hikari = await mustTransport(catalog, "rail-hikari-505");

    ids.advanceTo(LATER);
    mustOk(
      await catalog.updateTransportService(hikari.id, {
        ...updateInputOf(hikari),
        price: 20000,
      }),
    );

    expect(
      await catalog.updateTransportService(hikari.id, {
        ...updateInputOf(hikari),
        price: 21000,
      }),
    ).toStrictEqual({ ok: false, error: { kind: "conflict" } });
  });

  test("無い id の更新は notFound、mode を変える更新は immutableCategory になる", async () => {
    const { catalog } = testCatalog();
    const hikari = await mustTransport(catalog, "rail-hikari-505");

    expect(
      await catalog.updateTransportService(
        serviceIdAt(999),
        updateInputOf(hikari),
      ),
    ).toStrictEqual({ ok: false, error: { kind: "notFound" } });
    expect(
      await catalog.updateTransportService(hikari.id, {
        ...updateInputOf(hikari),
        mode: "air",
      }),
    ).toStrictEqual({ ok: false, error: { kind: "immutableCategory" } });
  });

  test("別の行の code に更新すると duplicateCode になる", async () => {
    const { catalog } = testCatalog();
    const hikari = await mustTransport(catalog, "rail-hikari-505");

    expect(
      await catalog.updateTransportService(hikari.id, {
        ...updateInputOf(hikari),
        code: "rail-nozomi-215",
      }),
    ).toStrictEqual({ ok: false, error: { kind: "duplicateCode" } });
  });

  test("無効にすると既定の一覧から消え、active: all では active: false で出る", async () => {
    const { ids, catalog } = testCatalog();
    const hikari = await mustTransport(catalog, "rail-hikari-505");

    ids.advanceTo(LATER);

    expect(
      mustOk(
        await catalog.disableTransportService(hikari.id, hikari.updatedAt),
      ),
    ).toStrictEqual({ ...hikari, active: false, updatedAt: LATER });
    expect(
      mustOk(await catalog.listServices({})).map((item) => item.code),
    ).not.toContain("rail-hikari-505");
    expect(
      mustOk(await catalog.listServices({ active: "all" })).find(
        (item) => item.code === "rail-hikari-505",
      )?.active,
    ).toBe(false);
  });

  test("無効化も古い updatedAt なら conflict、無い id なら notFound になる", async () => {
    const { ids, catalog } = testCatalog();
    const hikari = await mustTransport(catalog, "rail-hikari-505");

    ids.advanceTo(LATER);
    mustOk(
      await catalog.updateTransportService(hikari.id, updateInputOf(hikari)),
    );

    expect(
      await catalog.disableTransportService(hikari.id, hikari.updatedAt),
    ).toStrictEqual({ ok: false, error: { kind: "conflict" } });
    expect(
      await catalog.disableTransportService(serviceIdAt(999), SEEDED_AT),
    ).toStrictEqual({ ok: false, error: { kind: "notFound" } });
  });

  test("場所系の書き込みも同じ規則で判定する", async () => {
    const { ids, catalog } = testCatalog();
    const items = mustOk(await catalog.listServices({ category: "hotel" }));
    const listed = items.find((item) => item.code === "hotel-namba-c");
    const hotel = mustOk(await catalog.getPlaceService(listed?.id ?? ""));

    if (hotel === undefined) {
      throw new Error("test: no hotel-namba-c");
    }

    const { id: _id, updatedAt, ...fields } = hotel;

    ids.advanceTo(LATER);

    expect(
      await catalog.updatePlaceService(hotel.id, {
        ...fields,
        kind: "restaurant",
        updatedAt,
      }),
    ).toStrictEqual({ ok: false, error: { kind: "immutableCategory" } });
    expect(
      mustOk(
        await catalog.updatePlaceService(hotel.id, {
          ...fields,
          price: 13000,
          updatedAt,
        }),
      ),
    ).toStrictEqual({ ...hotel, price: 13000, updatedAt: LATER });
    expect(
      await catalog.createPlaceService({ ...fields, active: true }),
    ).toStrictEqual({ ok: false, error: { kind: "duplicateCode" } });
    expect(
      await catalog.disablePlaceService(hotel.id, updatedAt),
    ).toStrictEqual({ ok: false, error: { kind: "conflict" } });
  });
});

describe("設定画面の書き込みが秘書の候補に効く", () => {
  test("大阪行きの交通の料金を変えると、次の findOffers のその候補の料金が変わる", async () => {
    const { catalog } = testCatalog();
    const hikari = await mustTransport(catalog, "rail-hikari-505");

    mustOk(
      await catalog.updateTransportService(hikari.id, {
        ...updateInputOf(hikari),
        price: 20000,
      }),
    );

    const offers = mustOk(await catalog.findOffers(osakaTwoNights));

    expect(
      offers.outbound.find((offer) => offer.id === "rail-hikari-505")?.price,
    ).toStrictEqual({ amount: 20000, currency: "MST" });
  });

  test("その交通を無効にすると findOffers の候補から消える", async () => {
    const { catalog } = testCatalog();
    const hikari = await mustTransport(catalog, "rail-hikari-505");

    mustOk(await catalog.disableTransportService(hikari.id, hikari.updatedAt));

    const offers = mustOk(await catalog.findOffers(osakaTwoNights));

    expect(offers.outbound.map((offer) => offer.id)).not.toContain(
      "rail-hikari-505",
    );
    expect(offers.outbound.length).toBe(6);
  });

  test("作った交通の到着都市が目的地になり、その便が候補に出る", async () => {
    const { catalog } = testCatalog();

    mustOk(await catalog.createTransportService(NAGOYA_EXPRESS));

    const offers = mustOk(
      await catalog.findOffers(
        query("東京", "名古屋", "2026-09-14", "2026-09-14"),
      ),
    );

    expect(mustOk(await catalog.listDestinations())).toStrictEqual([
      "名古屋",
      "大阪",
      "東京",
    ]);
    expect(offers.outbound.map((offer) => offer.id)).toStrictEqual([
      "rail-nagoya-test",
    ]);
  });
});

describe("createFakeCatalog の選択肢", () => {
  test("拠点は有効な交通の出発都市ごとに、起点を並べる", async () => {
    const { catalog } = testCatalog();

    expect(mustOk(await catalog.listHomeOptions())).toStrictEqual([
      { city: "大阪", spots: ["ITM", "新大阪"] },
      { city: "東京", spots: ["HND", "NRT", "品川", "東京"] },
    ]);

    // 伊丹発は ANA 038便だけなので、無効にすると起点から消える
    const ana = await mustTransport(catalog, "air-ana-038");

    mustOk(await catalog.disableTransportService(ana.id, ana.updatedAt));

    expect(mustOk(await catalog.listHomeOptions()).at(0)).toStrictEqual({
      city: "大阪",
      spots: ["新大阪"],
    });
  });

  test("ジャンルは有効な飲食・レジャーのジャンルを重複なしで並べる", async () => {
    const { catalog } = testCatalog();

    expect(mustOk(await catalog.listGenreOptions())).toStrictEqual({
      dining: ["カフェ", "バー", "ビール", "中華", "和食", "居酒屋", "粉もん"],
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
    });
  });

  test("対応都市は有効な交通の到着都市を重複なしの昇順で並べる", async () => {
    const { catalog } = testCatalog();

    expect(mustOk(await catalog.listSupportedCities())).toStrictEqual([
      "大阪",
      "東京",
    ]);
  });
});
