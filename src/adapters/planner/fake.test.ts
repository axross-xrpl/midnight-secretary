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
    budget: { amount: mustParse(parseAmount(100000)), currency: "DEMO" },
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
): TripIntent => {
  return {
    destination,
    departOn: mustParse(parseIsoDate(departOn)),
    returnOn: mustParse(parseIsoDate(returnOn)),
    purpose: `${destination}出張`,
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
});
