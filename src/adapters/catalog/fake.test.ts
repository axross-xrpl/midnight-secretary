import { describe, expect, test } from "vitest";
import type { OfferQuery } from "@/domain/catalog";
import { mustParse, parseIsoDate } from "@/domain/identifiers.parse";
import { createFakeCatalog, seedCatalog } from "./fake";

const catalog = createFakeCatalog(seedCatalog());

const query = (
  destination: string,
  departOn: string,
  returnOn: string,
): OfferQuery => {
  return {
    origin: "東京",
    destination,
    departOn: mustParse(parseIsoDate(departOn)),
    returnOn: mustParse(parseIsoDate(returnOn)),
  };
};

const osakaTwoNights = query("大阪", "2026-09-14", "2026-09-16");

describe("createFakeCatalog", () => {
  test("料金を持っている目的地を挙げる", async () => {
    expect(await catalog.listDestinations()).toStrictEqual({
      ok: true,
      value: ["大阪", "福岡"],
    });
  });

  test("未知の目的地は unknownDestination になる", async () => {
    const result = await catalog.findOffers(
      query("札幌", "2026-09-14", "2026-09-16"),
    );

    expect(result).toStrictEqual({
      ok: false,
      error: { kind: "unknownDestination", destination: "札幌" },
    });
  });

  test("往復の便に問い合わせた日付を入れて返す", async () => {
    const result = await catalog.findOffers(osakaTwoNights);

    expect(
      result.ok && result.value.outbound.map((offer) => offer.id),
    ).toStrictEqual(["rail-tokyo-osaka", "air-tokyo-osaka"]);
    expect(result.ok && result.value.outbound.at(0)).toStrictEqual({
      id: "rail-tokyo-osaka",
      mode: "rail",
      vendor: "JR",
      payee: "demo-payee-jr",
      origin: "東京",
      destination: "大阪",
      departAt: "2026-09-14T09:00:00+09:00",
      arriveAt: "2026-09-14T11:30:00+09:00",
      price: { amount: 14720, currency: "DEMO" },
    });
    expect(
      result.ok && result.value.inbound.map((offer) => offer.id),
    ).toStrictEqual(["rail-osaka-tokyo", "air-osaka-tokyo"]);
    expect(result.ok && result.value.inbound.at(0)?.departAt).toBe(
      "2026-09-16T18:00:00+09:00",
    );
  });

  test("宿は泊数分の料金で返る", async () => {
    const result = await catalog.findOffers(osakaTwoNights);

    expect(result.ok && result.value.lodging).toStrictEqual([
      {
        id: "hotel-osaka",
        vendor: "デモホテルズ",
        payee: "demo-payee-hotels",
        name: "デモホテル大阪",
        city: "大阪",
        checkIn: "2026-09-14",
        checkOut: "2026-09-16",
        price: { amount: 24000, currency: "DEMO" },
      },
    ]);
  });

  test("日帰りなら宿は空になる", async () => {
    const result = await catalog.findOffers(
      query("大阪", "2026-09-14", "2026-09-14"),
    );

    expect(result.ok && result.value.lodging).toStrictEqual([]);
    expect(result.ok && result.value.outbound.length).toBe(2);
  });

  test("交通手段は絞り込まず rail と air の両方を返す", async () => {
    const result = await catalog.findOffers(osakaTwoNights);

    expect(
      result.ok && result.value.outbound.map((offer) => offer.mode),
    ).toStrictEqual(["rail", "air"]);
  });

  test("出発地が未知でも失敗せず空の便を返す", async () => {
    const result = await catalog.findOffers({
      ...osakaTwoNights,
      origin: "札幌",
    });

    expect(result.ok && result.value.outbound).toStrictEqual([]);
    expect(result.ok && result.value.inbound).toStrictEqual([]);
    expect(result.ok && result.value.lodging.length).toBe(1);
  });
});
