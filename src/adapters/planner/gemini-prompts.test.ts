import { describe, expect, test } from "vitest";
import type { CalendarEvent } from "@/domain/calendar";
import type { OfferSet } from "@/domain/catalog";
import {
  mustParse,
  parseAmount,
  parseCalendarEventId,
  parseIsoDate,
  parseIsoDateTime,
} from "@/domain/identifiers.parse";
import type { Locale } from "@/domain/locale";
import type { TripIntent } from "@/domain/plan";
import type { ChoiceContext, InterpretContext } from "@/domain/planner";
import { createFakeCatalog, seedCatalog } from "../catalog/fake";
import {
  CHOICE_JSON_SCHEMA,
  choicePrompt,
  INTERPRET_JSON_SCHEMA,
  interpretPrompt,
} from "./gemini-prompts";

const catalog = createFakeCatalog(seedCatalog());

const event: CalendarEvent = {
  id: mustParse(parseCalendarEventId("event-1")),
  title: "大阪出張 (取引先訪問)",
  when: {
    kind: "allDay",
    startDate: mustParse(parseIsoDate("2026-09-22")),
    endDate: mustParse(parseIsoDate("2026-09-24")),
  },
  location: "新大阪",
};

const interpretContext = (locale: Locale): InterpretContext => {
  return {
    locale,
    now: mustParse(parseIsoDateTime("2026-09-09T09:00:00+09:00")),
    knownDestinations: ["大阪", "福岡"],
  };
};

const choiceContext = (locale: Locale): ChoiceContext => {
  return {
    locale,
    preferences: {
      homeStation: "東京",
      preferredTransport: "rail",
      diningGenres: ["居酒屋"],
      leisureGenres: ["history"],
    },
    budget: { amount: mustParse(parseAmount(100000)), currency: "MST" },
  };
};

const intent: TripIntent = {
  destination: "大阪",
  departOn: mustParse(parseIsoDate("2026-09-22")),
  returnOn: mustParse(parseIsoDate("2026-09-24")),
  purpose: "取引先を訪問する",
};

// 候補は Fake の料金表から取る (値を手で書かない)。取れないのはテスト設定のバグ
const offersFor = async (target: TripIntent): Promise<OfferSet> => {
  const offers = await catalog.findOffers({
    origin: "東京",
    destination: target.destination,
    departOn: target.departOn,
    returnOn: target.returnOn,
  });

  if (!offers.ok) {
    throw new Error("test setup: findOffers failed");
  }

  return offers.value;
};

describe("interpretPrompt", () => {
  test("予定の事実と目的地の一覧と現在時刻が入る", () => {
    const prompt = interpretPrompt(event, interpretContext("ja"));

    expect(prompt).toContain("大阪出張 (取引先訪問)");
    expect(prompt).toContain("新大阪");
    expect(prompt).toContain('["大阪","福岡"]');
    expect(prompt).toContain("2026-09-09T09:00:00+09:00");
    expect(prompt).toContain("日本語で書いてください");
  });

  test("en では自由記述を英語で書かせる", () => {
    expect(interpretPrompt(event, interpretContext("en"))).toContain(
      "英語で書いてください",
    );
  });
});

describe("choicePrompt", () => {
  test("候補の id、泊数、好み、予算が入る", async () => {
    const offers = await offersFor(intent);
    const prompt = choicePrompt(intent, offers, choiceContext("ja"));
    const ids = [...offers.outbound, ...offers.inbound, ...offers.lodging].map(
      (offer) => offer.id,
    );

    expect(ids.length).toBeGreaterThan(0);
    expect(ids.filter((id) => !prompt.includes(id))).toStrictEqual([]);
    expect(prompt).toContain('"nights":2');
    expect(prompt).toContain('"homeStation":"東京"');
    expect(prompt).toContain('"preferredTransport":"rail"');
    expect(prompt).toContain('"amount":100000');
    expect(prompt).toContain("往路、復路、宿、飲食、レジャーの合計");
    expect(prompt).toContain("日本語で書いてください");
  });

  test("候補の新しい属性と、目的地の飲食・レジャーが選択肢として入る", async () => {
    const offers = await offersFor(intent);
    const prompt = choicePrompt(intent, offers, choiceContext("ja"));
    const placeNames = [...offers.dining, ...offers.leisure].map(
      (offer) => offer.name,
    );
    const placeIds = [...offers.dining, ...offers.leisure].map(
      (offer) => offer.id,
    );

    expect(placeNames.length).toBeGreaterThan(0);
    expect(prompt).toContain('"doorToDoor":{');
    expect(prompt).toContain('"rating":');
    expect(prompt).toContain('"requiredVerifications":[');
    expect(placeNames.filter((name) => !prompt.includes(name))).toStrictEqual(
      [],
    );
    // 飲食とレジャーも選ばせるので id を見せる
    expect(placeIds.filter((id) => !prompt.includes(id))).toStrictEqual([]);
    expect(prompt).toContain("diningId");
    expect(prompt).toContain("leisureId");
  });

  test("出張者の好みの genre と、それを優先させる指示が入る", async () => {
    const offers = await offersFor(intent);
    const prompt = choicePrompt(intent, offers, choiceContext("ja"));

    expect(prompt).toContain('"diningGenres":["居酒屋"]');
    expect(prompt).toContain('"leisureGenres":["history"]');
    expect(prompt).toContain(
      "出張者の好み (diningGenres / leisureGenres) に合う genre を優先してください",
    );
  });

  test("年齢制限のある候補を見せた上で、避けさせる指示は書かない", async () => {
    const offers = await offersFor(intent);
    const prompt = choicePrompt(intent, offers, choiceContext("ja"));

    expect(prompt).toContain('"ageLimit":20');
    expect(prompt).toContain("選んでかまいません");
    expect(prompt).not.toContain("避け");
    expect(prompt).not.toContain("除外");
  });

  test("en では自由記述を英語で書かせる", async () => {
    const offers = await offersFor(intent);

    expect(choicePrompt(intent, offers, choiceContext("en"))).toContain(
      "英語で書いてください",
    );
  });
});

describe("JSON schema", () => {
  test("必須の項目と properties が一致する", () => {
    expect([...INTERPRET_JSON_SCHEMA.required]).toStrictEqual(
      Object.keys(INTERPRET_JSON_SCHEMA.properties),
    );
    expect([...CHOICE_JSON_SCHEMA.required]).toStrictEqual(
      Object.keys(CHOICE_JSON_SCHEMA.properties),
    );
  });
});
