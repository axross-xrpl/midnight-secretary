import { describe, expect, test } from "vitest";
import type { OfferQuery } from "@/domain/catalog";
import { mustParse, parseIsoDate } from "@/domain/identifiers.parse";
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
