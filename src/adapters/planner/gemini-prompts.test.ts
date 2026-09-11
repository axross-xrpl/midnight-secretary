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
    preferences: { homeStation: "東京", preferredTransport: "rail" },
    budget: { amount: mustParse(parseAmount(100000)), currency: "DEMO" },
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

    expect(ids.length).toBe(5);
    expect(ids.filter((id) => !prompt.includes(id))).toStrictEqual([]);
    expect(prompt).toContain('"nights":2');
    expect(prompt).toContain('"homeStation":"東京"');
    expect(prompt).toContain('"preferredTransport":"rail"');
    expect(prompt).toContain('"amount":100000');
    expect(prompt).toContain("日本語で書いてください");
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
