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
import type { TripIntent } from "@/domain/plan";
import type {
  ChoiceContext,
  InterpretContext,
  PlannerError,
} from "@/domain/planner";
import { err, ok } from "@/lib/result";
import { createFakeCatalog, seedCatalog } from "../catalog/fake";
import type { GenerateJson } from "./gemini";
import { createGeminiPlanner } from "./gemini";
import {
  CHOICE_JSON_SCHEMA,
  INTERPRET_JSON_SCHEMA,
  interpretPrompt,
} from "./gemini-prompts";

const catalog = createFakeCatalog(seedCatalog());

const interpretContext: InterpretContext = {
  locale: "ja",
  now: mustParse(parseIsoDateTime("2026-09-09T09:00:00+09:00")),
  knownDestinations: ["大阪", "福岡"],
};

const choiceContext: ChoiceContext = {
  locale: "ja",
  preferences: { homeStation: "東京", diningGenres: [], leisureGenres: [] },
  budget: { amount: mustParse(parseAmount(100000)), currency: "MST" },
};

const allDayEvent = (
  title: string,
  startDate: string,
  endDate: string,
): CalendarEvent => {
  return {
    id: mustParse(parseCalendarEventId("event-1")),
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

// 候補は Fake の料金表から取る (値を手で書かない)。取れないのはテスト設定のバグ
const offersFor = async (intent: TripIntent): Promise<OfferSet> => {
  const offers = await catalog.findOffers({
    origin: "東京",
    destination: intent.destination,
    departOn: intent.departOn,
    returnOn: intent.returnOn,
  });

  if (!offers.ok) {
    throw new Error("test setup: findOffers failed");
  }

  return offers.value;
};

const generateReturning = (json: unknown): GenerateJson => {
  return async () => ok(json);
};

const generateFailing = (error: PlannerError): GenerateJson => {
  return async () => err(error);
};

type Received = {
  prompt: string;
  schema: Readonly<Record<string, unknown>>;
};

// 受け取ったプロンプトと schema を入れ物に残す Stub (呼び出し回数は検証しない)
const generateRecording = (
  json: unknown,
  received: { last?: Received },
): GenerateJson => {
  return async (prompt, schema) => {
    received.last = { prompt, schema };

    return ok(json);
  };
};

const tripAnswer = {
  isTrip: true,
  destination: "福岡",
  purpose: "取引先を訪問する",
  reason: "題名に福岡出張とある",
};

describe("interpretEvent", () => {
  const trip = allDayEvent("福岡出張", "2026-09-22", "2026-09-24");

  test("出張なら目的地と用件と予定の日付から意図を作る", async () => {
    const planner = createGeminiPlanner({
      generate: generateReturning(tripAnswer),
    });

    expect(await planner.interpretEvent(trip, interpretContext)).toStrictEqual({
      ok: true,
      value: {
        destination: "福岡",
        departOn: "2026-09-22",
        returnOn: "2026-09-23",
        purpose: "取引先を訪問する",
      },
    });
  });

  test("用件が空なら予定の題名で代える", async () => {
    const planner = createGeminiPlanner({
      generate: generateReturning({ ...tripAnswer, purpose: "" }),
    });

    const result = await planner.interpretEvent(trip, interpretContext);

    expect(result.ok && result.value.purpose).toBe("福岡出張");
  });

  test("出張でなければ notATrip で理由は Gemini のもの", async () => {
    const planner = createGeminiPlanner({
      generate: generateReturning({
        isTrip: false,
        destination: null,
        purpose: "",
        reason: "歯医者の予約で移動を伴わない",
      }),
    });

    expect(
      await planner.interpretEvent(
        allDayEvent("歯医者", "2026-09-18", "2026-09-19"),
        interpretContext,
      ),
    ).toStrictEqual({
      ok: false,
      error: { kind: "notATrip", reason: "歯医者の予約で移動を伴わない" },
    });
  });

  test("目的地が一覧に無ければ notATrip", async () => {
    const planner = createGeminiPlanner({
      generate: generateReturning({ ...tripAnswer, destination: "札幌" }),
    });

    expect(await planner.interpretEvent(trip, interpretContext)).toStrictEqual({
      ok: false,
      error: {
        kind: "notATrip",
        reason: "destination is not in the catalog: 札幌",
      },
    });
  });

  test("出張なのに目的地が null でも notATrip", async () => {
    const planner = createGeminiPlanner({
      generate: generateReturning({ ...tripAnswer, destination: null }),
    });

    expect(await planner.interpretEvent(trip, interpretContext)).toStrictEqual({
      ok: false,
      error: {
        kind: "notATrip",
        reason: "destination is not in the catalog: (none)",
      },
    });
  });

  test("形の違う JSON は schema", async () => {
    const planner = createGeminiPlanner({
      generate: generateReturning({ isTrip: "yes" }),
    });

    const result = await planner.interpretEvent(trip, interpretContext);

    expect(!result.ok && result.error.kind).toBe("schema");
  });

  test("Gemini の失敗はそのまま返す", async () => {
    const planner = createGeminiPlanner({
      generate: generateFailing({ kind: "llm", cause: "boom" }),
    });

    expect(await planner.interpretEvent(trip, interpretContext)).toStrictEqual({
      ok: false,
      error: { kind: "llm", cause: "boom" },
    });
  });

  test("Gemini にはプロンプトと JSON schema を渡す", async () => {
    const received: { last?: Received } = {};
    const planner = createGeminiPlanner({
      generate: generateRecording(tripAnswer, received),
    });

    await planner.interpretEvent(trip, interpretContext);

    expect(received.last).toStrictEqual({
      prompt: interpretPrompt(trip, interpretContext),
      schema: INTERPRET_JSON_SCHEMA,
    });
  });
});

const choiceAnswer = {
  outboundId: "rail-hikari-505",
  inboundId: "air-ana-038",
  lodgingId: "hotel-namba-c",
  diningId: null,
  leisureId: null,
  rationale: "新幹線で行き、飛行機で戻る",
};

describe("choosePlan", () => {
  const twoNights = intentFor("大阪", "2026-09-22", "2026-09-24");
  const dayTrip = intentFor("大阪", "2026-09-22", "2026-09-22");

  test("候補の id を選ぶ", async () => {
    const planner = createGeminiPlanner({
      generate: generateReturning(choiceAnswer),
    });

    expect(
      await planner.choosePlan(
        twoNights,
        await offersFor(twoNights),
        choiceContext,
      ),
    ).toStrictEqual({
      ok: true,
      value: {
        outboundId: "rail-hikari-505",
        inboundId: "air-ana-038",
        lodgingId: "hotel-namba-c",
        rationale: "新幹線で行き、飛行機で戻る",
      },
    });
  });

  test("日帰りの null は lodgingId を持たない", async () => {
    const planner = createGeminiPlanner({
      generate: generateReturning({ ...choiceAnswer, lodgingId: null }),
    });

    expect(
      await planner.choosePlan(
        dayTrip,
        await offersFor(dayTrip),
        choiceContext,
      ),
    ).toStrictEqual({
      ok: true,
      value: {
        outboundId: "rail-hikari-505",
        inboundId: "air-ana-038",
        rationale: "新幹線で行き、飛行機で戻る",
      },
    });
  });

  test("飲食とレジャーの id も選択に載る", async () => {
    const planner = createGeminiPlanner({
      generate: generateReturning({
        ...choiceAnswer,
        diningId: "restaurant-izakaya-tenma",
        leisureId: "leisure-osaka-castle",
      }),
    });

    expect(
      await planner.choosePlan(
        twoNights,
        await offersFor(twoNights),
        choiceContext,
      ),
    ).toStrictEqual({
      ok: true,
      value: {
        outboundId: "rail-hikari-505",
        inboundId: "air-ana-038",
        lodgingId: "hotel-namba-c",
        diningId: "restaurant-izakaya-tenma",
        leisureId: "leisure-osaka-castle",
        rationale: "新幹線で行き、飛行機で戻る",
      },
    });
  });

  test("飲食とレジャーの null はキーごと持たない", async () => {
    const planner = createGeminiPlanner({
      generate: generateReturning({
        ...choiceAnswer,
        diningId: null,
        leisureId: null,
      }),
    });

    const result = await planner.choosePlan(
      twoNights,
      await offersFor(twoNights),
      choiceContext,
    );

    expect(result.ok && Object.keys(result.value)).toStrictEqual([
      "outboundId",
      "inboundId",
      "lodgingId",
      "rationale",
    ]);
  });

  test("飲食の id が候補に無ければ noViableChoice", async () => {
    const planner = createGeminiPlanner({
      generate: generateReturning({
        ...choiceAnswer,
        diningId: "restaurant-kyoto",
      }),
    });

    expect(
      await planner.choosePlan(
        twoNights,
        await offersFor(twoNights),
        choiceContext,
      ),
    ).toStrictEqual({
      ok: false,
      error: {
        kind: "noViableChoice",
        reason: "unknown offer id: restaurant-kyoto",
      },
    });
  });

  test("レジャーの id が候補に無ければ noViableChoice", async () => {
    const planner = createGeminiPlanner({
      generate: generateReturning({
        ...choiceAnswer,
        leisureId: "leisure-kyoto",
      }),
    });

    expect(
      await planner.choosePlan(
        twoNights,
        await offersFor(twoNights),
        choiceContext,
      ),
    ).toStrictEqual({
      ok: false,
      error: {
        kind: "noViableChoice",
        reason: "unknown offer id: leisure-kyoto",
      },
    });
  });

  test("年齢確認の要る飲食も選択に載る", async () => {
    const planner = createGeminiPlanner({
      generate: generateReturning({
        ...choiceAnswer,
        diningId: "restaurant-craftbeer-nakazaki",
      }),
    });

    const result = await planner.choosePlan(
      twoNights,
      await offersFor(twoNights),
      choiceContext,
    );

    expect(result.ok && result.value.diningId).toBe(
      "restaurant-craftbeer-nakazaki",
    );
  });

  test("知らない id は noViableChoice", async () => {
    const planner = createGeminiPlanner({
      generate: generateReturning({ ...choiceAnswer, outboundId: "bus-1" }),
    });

    expect(
      await planner.choosePlan(
        twoNights,
        await offersFor(twoNights),
        choiceContext,
      ),
    ).toStrictEqual({
      ok: false,
      error: { kind: "noViableChoice", reason: "unknown offer id: bus-1" },
    });
  });

  test("宿の id が候補に無いのも noViableChoice", async () => {
    const planner = createGeminiPlanner({
      generate: generateReturning({
        ...choiceAnswer,
        lodgingId: "hotel-kyoto",
      }),
    });

    expect(
      await planner.choosePlan(
        twoNights,
        await offersFor(twoNights),
        choiceContext,
      ),
    ).toStrictEqual({
      ok: false,
      error: {
        kind: "noViableChoice",
        reason: "unknown offer id: hotel-kyoto",
      },
    });
  });

  test("rationale が空なら schema", async () => {
    const planner = createGeminiPlanner({
      generate: generateReturning({ ...choiceAnswer, rationale: "" }),
    });

    const result = await planner.choosePlan(
      twoNights,
      await offersFor(twoNights),
      choiceContext,
    );

    expect(!result.ok && result.error.kind).toBe("schema");
  });

  test("Gemini には候補の id を含むプロンプトと JSON schema を渡す", async () => {
    const received: { last?: Received } = {};
    const planner = createGeminiPlanner({
      generate: generateRecording(choiceAnswer, received),
    });

    await planner.choosePlan(
      twoNights,
      await offersFor(twoNights),
      choiceContext,
    );

    expect(received.last?.schema).toStrictEqual(CHOICE_JSON_SCHEMA);
    expect(received.last?.prompt).toContain("rail-hikari-505");
    expect(received.last?.prompt).toContain("hotel-namba-c");
    expect(received.last?.prompt).toContain("restaurant-izakaya-tenma");
    expect(received.last?.prompt).toContain("leisure-osaka-castle");
  });
});
