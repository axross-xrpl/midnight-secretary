import { describe, expect, test } from "vitest";
import type { CalendarEvent } from "@/domain/calendar";
import type { OfferSet, TransportMode } from "@/domain/catalog";
import {
  mustParse,
  parseAmount,
  parseCalendarEventId,
  parseIsoDate,
  parseIsoDateTime,
} from "@/domain/identifiers.parse";
import type { TripIntent } from "@/domain/plan";
import type { ChoiceContext, InterpretContext } from "@/domain/planner";
import { createFakeCatalog, seedCatalog } from "../catalog/fake";
import { createFakePlanner } from "./fake";

const planner = createFakePlanner();

const catalog = createFakeCatalog(seedCatalog());

const interpretContext: InterpretContext = {
  locale: "ja",
  now: mustParse(parseIsoDateTime("2026-09-09T09:00:00+09:00")),
  knownDestinations: ["大阪", "福岡"],
};

const choiceContext = (preferredTransport?: TransportMode): ChoiceContext => {
  return {
    locale: "ja",
    preferences: {
      homeStation: "東京",
      ...(preferredTransport === undefined ? {} : { preferredTransport }),
    },
    budget: { amount: mustParse(parseAmount(100000)), currency: "MST" },
  };
};

const timedEvent = (
  title: string,
  location: string | undefined,
  start: string,
  end: string,
): CalendarEvent => {
  return {
    id: mustParse(parseCalendarEventId("event-1")),
    title,
    when: {
      kind: "timed",
      start: mustParse(parseIsoDateTime(start)),
      end: mustParse(parseIsoDateTime(end)),
    },
    ...(location === undefined ? {} : { location }),
  };
};

const allDayEvent = (
  title: string,
  startDate: string,
  endDate: string,
): CalendarEvent => {
  return {
    id: mustParse(parseCalendarEventId("event-2")),
    title,
    when: {
      kind: "allDay",
      startDate: mustParse(parseIsoDate(startDate)),
      endDate: mustParse(parseIsoDate(endDate)),
    },
  };
};

const intentFor = (
  destination: string,
  departOn: string,
  returnOn: string,
  purpose = `${destination}出張`,
): TripIntent => {
  return {
    destination,
    departOn: mustParse(parseIsoDate(departOn)),
    returnOn: mustParse(parseIsoDate(returnOn)),
    purpose,
  };
};

const offersFor = async (intent: TripIntent): Promise<OfferSet> => {
  const offers = await catalog.findOffers({
    origin: "東京",
    destination: intent.destination,
    departOn: intent.departOn,
    returnOn: intent.returnOn,
  });

  if (!offers.ok) {
    throw new Error(`test setup: no offers for ${intent.destination}`);
  }

  return offers.value;
};

const emptyOffers: OfferSet = {
  outbound: [],
  inbound: [],
  lodging: [],
  dining: [],
  leisure: [],
};

describe("interpretEvent", () => {
  test("件名から目的地を見つける", async () => {
    const event = timedEvent(
      "大阪出張 (取引先訪問)",
      undefined,
      "2026-09-14T10:00:00+09:00",
      "2026-09-14T17:00:00+09:00",
    );

    expect(await planner.interpretEvent(event, interpretContext)).toStrictEqual(
      {
        ok: true,
        value: {
          destination: "大阪",
          departOn: "2026-09-14",
          returnOn: "2026-09-14",
          purpose: "大阪出張 (取引先訪問)",
        },
      },
    );
  });

  test("場所から目的地を見つける", async () => {
    const event = timedEvent(
      "取引先訪問",
      "大阪市北区",
      "2026-09-14T10:00:00+09:00",
      "2026-09-14T17:00:00+09:00",
    );
    const result = await planner.interpretEvent(event, interpretContext);

    expect(result.ok && result.value.destination).toBe("大阪");
  });

  test("知っている目的地が無ければ notATrip になる", async () => {
    const event = timedEvent(
      "チーム定例",
      undefined,
      "2026-09-11T10:00:00+09:00",
      "2026-09-11T11:00:00+09:00",
    );

    expect(await planner.interpretEvent(event, interpretContext)).toStrictEqual(
      {
        ok: false,
        error: {
          kind: "notATrip",
          reason: "no known destination in title or location",
        },
      },
    );
  });

  test("終日の予定は排他の終了日を 1 日戻して returnOn にする", async () => {
    const event = allDayEvent("福岡出張", "2026-09-21", "2026-09-23");
    const result = await planner.interpretEvent(event, interpretContext);

    expect(result.ok && result.value).toStrictEqual({
      destination: "福岡",
      departOn: "2026-09-21",
      returnOn: "2026-09-22",
      purpose: "福岡出張",
    });
  });

  test("終了日が開始日と同じ終日の予定でも returnOn は開始日にする", async () => {
    const event = allDayEvent("福岡出張", "2026-09-21", "2026-09-21");
    const result = await planner.interpretEvent(event, interpretContext);

    expect(result.ok && result.value.returnOn).toBe("2026-09-21");
  });

  test("UTC で日をまたぐ時刻ありの予定は JST の日付にする", async () => {
    const event = timedEvent(
      "大阪出張",
      undefined,
      "2026-09-13T16:00:00Z",
      "2026-09-14T09:00:00Z",
    );
    const result = await planner.interpretEvent(event, interpretContext);

    expect(result.ok && result.value.departOn).toBe("2026-09-14");
    expect(result.ok && result.value.returnOn).toBe("2026-09-14");
  });
});

describe("choosePlan", () => {
  // 候補は code 順で届くので、希望が無いときの先頭は air になる
  test("希望の交通手段があればそれを選ぶ", async () => {
    const intent = intentFor("大阪", "2026-09-14", "2026-09-16");
    const offers = await offersFor(intent);

    expect(
      await planner.choosePlan(intent, offers, choiceContext("rail")),
    ).toStrictEqual({
      ok: true,
      value: {
        outboundId: "rail-hikari-505",
        inboundId: "rail-nozomi-232",
        lodgingId: "hotel-namba-c",
        rationale: "Fake planner: first matching offers",
      },
    });
  });

  test("希望が無ければ先頭の便を選ぶ", async () => {
    const intent = intentFor("大阪", "2026-09-14", "2026-09-16");
    const offers = await offersFor(intent);
    const result = await planner.choosePlan(intent, offers, choiceContext());

    expect(result.ok && result.value.outboundId).toBe("air-ana-017");
    expect(result.ok && result.value.inboundId).toBe("air-ana-038");
  });

  test("日帰りなら宿を選ばない", async () => {
    const intent = intentFor("大阪", "2026-09-14", "2026-09-14");
    const offers = await offersFor(intent);
    const result = await planner.choosePlan(intent, offers, choiceContext());

    expect(result.ok && result.value).toStrictEqual({
      outboundId: "air-ana-017",
      inboundId: "air-ana-038",
      rationale: "Fake planner: first matching offers",
    });
  });

  test("片道が無ければ noViableChoice になる", async () => {
    const intent = intentFor("大阪", "2026-09-14", "2026-09-16");
    const offers = await offersFor(intent);

    expect(
      await planner.choosePlan(
        intent,
        { ...offers, inbound: [] },
        choiceContext(),
      ),
    ).toStrictEqual({
      ok: false,
      error: { kind: "noViableChoice", reason: "no outbound or inbound offer" },
    });
    expect(
      await planner.choosePlan(intent, emptyOffers, choiceContext()),
    ).toStrictEqual({
      ok: false,
      error: { kind: "noViableChoice", reason: "no outbound or inbound offer" },
    });
  });

  test("題名に懇親会があれば居酒屋を選び、理由にも書く", async () => {
    const intent = intentFor(
      "大阪",
      "2026-09-15",
      "2026-09-15",
      "大阪出張 (取引先と懇親会)",
    );
    const offers = await offersFor(intent);

    expect(
      await planner.choosePlan(intent, offers, choiceContext("rail")),
    ).toStrictEqual({
      ok: true,
      value: {
        outboundId: "rail-hikari-505",
        inboundId: "rail-nozomi-232",
        diningId: "restaurant-izakaya-tenma",
        rationale:
          "Fake planner: first matching offers, with a dining place for the gathering",
      },
    });
  });

  test("会食、飲み会、居酒屋の題名でも居酒屋を選ぶ", async () => {
    const titles = [
      "大阪出張 (パートナー会食)",
      "大阪 飲み会",
      "大阪の居酒屋めぐり",
    ];
    const chosen = await Promise.all(
      titles.map(async (title) => {
        const intent = intentFor("大阪", "2026-09-18", "2026-09-18", title);

        return planner.choosePlan(
          intent,
          await offersFor(intent),
          choiceContext("rail"),
        );
      }),
    );

    expect(
      chosen.map((result) => result.ok && result.value.diningId),
    ).toStrictEqual([
      "restaurant-izakaya-tenma",
      "restaurant-izakaya-tenma",
      "restaurant-izakaya-tenma",
    ]);
  });

  test("取引先訪問の題名では飲食を選ばない", async () => {
    const intent = intentFor(
      "大阪",
      "2026-09-14",
      "2026-09-14",
      "大阪出張 (取引先訪問)",
    );
    const offers = await offersFor(intent);

    expect(
      await planner.choosePlan(intent, offers, choiceContext("rail")),
    ).toStrictEqual({
      ok: true,
      value: {
        outboundId: "rail-hikari-505",
        inboundId: "rail-nozomi-232",
        rationale: "Fake planner: first matching offers",
      },
    });
  });

  test("居酒屋が無ければ飲食の先頭を選ぶ", async () => {
    const intent = intentFor(
      "大阪",
      "2026-09-15",
      "2026-09-15",
      "大阪出張 (取引先と懇親会)",
    );
    const offers = await offersFor(intent);
    const withoutIzakaya = {
      ...offers,
      dining: offers.dining.filter((offer) => offer.genre !== "居酒屋"),
    };
    const result = await planner.choosePlan(
      intent,
      withoutIzakaya,
      choiceContext("rail"),
    );

    expect(result.ok && result.value.diningId).toBe("restaurant-bar-akari");
  });

  test("飲食の候補が無ければ懇親会でも飲食を付けない", async () => {
    const intent = intentFor(
      "大阪",
      "2026-09-15",
      "2026-09-15",
      "大阪出張 (取引先と懇親会)",
    );
    const offers = await offersFor(intent);
    const result = await planner.choosePlan(
      intent,
      { ...offers, dining: [] },
      choiceContext("rail"),
    );

    expect(result.ok && result.value).toStrictEqual({
      outboundId: "rail-hikari-505",
      inboundId: "rail-nozomi-232",
      rationale: "Fake planner: first matching offers",
    });
  });

  test("題名に視察と懇親会があれば宿、居酒屋、本人確認の要らないレジャーを選び、理由に両方を書く", async () => {
    const intent = intentFor(
      "大阪",
      "2026-09-25",
      "2026-09-26",
      "大阪出張 (工場視察と懇親会)",
    );
    const offers = await offersFor(intent);

    expect(
      await planner.choosePlan(intent, offers, choiceContext("rail")),
    ).toStrictEqual({
      ok: true,
      value: {
        outboundId: "rail-hikari-505",
        inboundId: "rail-nozomi-232",
        lodgingId: "hotel-namba-c",
        diningId: "restaurant-izakaya-tenma",
        leisureId: "leisure-kaiyukan",
        rationale:
          "Fake planner: first matching offers, with a dining place for the gathering, with a leisure place for the visit",
      },
    });
  });

  test("観光、見学の題名でも本人確認の要らないレジャーを選ぶ", async () => {
    const titles = ["大阪 観光", "大阪の工場見学"];
    const chosen = await Promise.all(
      titles.map(async (title) => {
        const intent = intentFor("大阪", "2026-09-25", "2026-09-25", title);

        return planner.choosePlan(
          intent,
          await offersFor(intent),
          choiceContext("rail"),
        );
      }),
    );

    expect(chosen.map((result) => result.ok && result.value)).toStrictEqual([
      {
        outboundId: "rail-hikari-505",
        inboundId: "rail-nozomi-232",
        leisureId: "leisure-kaiyukan",
        rationale:
          "Fake planner: first matching offers, with a leisure place for the visit",
      },

      {
        outboundId: "rail-hikari-505",
        inboundId: "rail-nozomi-232",
        leisureId: "leisure-kaiyukan",
        rationale:
          "Fake planner: first matching offers, with a leisure place for the visit",
      },
    ]);
  });

  test("本人確認の要るレジャーだけなら先頭を選ぶ", async () => {
    const intent = intentFor(
      "大阪",
      "2026-09-25",
      "2026-09-25",
      "大阪 工場視察",
    );
    const offers = await offersFor(intent);
    const onlyVerified = {
      ...offers,
      leisure: offers.leisure.filter(
        (offer) => offer.requiredVerifications.length > 0,
      ),
    };
    const result = await planner.choosePlan(
      intent,
      onlyVerified,
      choiceContext("rail"),
    );

    expect(result.ok && result.value.leisureId).toBe(
      "leisure-inbound-guide-tour",
    );
  });

  test("レジャーの候補が無ければ視察でもレジャーを付けない", async () => {
    const intent = intentFor(
      "大阪",
      "2026-09-25",
      "2026-09-25",
      "大阪 工場視察",
    );
    const offers = await offersFor(intent);
    const result = await planner.choosePlan(
      intent,
      { ...offers, leisure: [] },
      choiceContext("rail"),
    );

    expect(result.ok && result.value).toStrictEqual({
      outboundId: "rail-hikari-505",
      inboundId: "rail-nozomi-232",
      rationale: "Fake planner: first matching offers",
    });
  });
});
