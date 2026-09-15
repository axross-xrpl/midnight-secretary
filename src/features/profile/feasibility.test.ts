import { describe, expect, it } from "vitest";
import type { PlanningProfile } from "./feasibility";
import {
  ageOn,
  canSatisfy,
  excludedKinds,
  filterFeasible,
  jstToday,
  orderByPreference,
} from "./feasibility";

const TODAY = "2026-09-13";

const profile = (
  overrides: Partial<PlanningProfile> = {},
): PlanningProfile => ({
  birthDate: "1990-04-01",
  nationality: "JP",
  residencePref: "大阪府",
  homeCity: "東京",
  homeSpot: "品川",
  diningGenres: [],
  leisureGenres: [],
  budget: null,
  priority: null,
  ...overrides,
});

const candidate = (
  requiredVerifications: string[],
  extra: { ageLimit?: number; genre?: string } = {},
) => ({ requiredVerifications, ...extra });

describe("ageOn", () => {
  it("counts a birthday that has already passed this year", () => {
    expect(ageOn("1990-04-01", TODAY)).toBe(36);
  });

  it("does not count a birthday later this year", () => {
    expect(ageOn("1990-12-31", TODAY)).toBe(35);
  });

  it("counts the birthday itself", () => {
    expect(ageOn("1990-09-13", TODAY)).toBe(36);
    expect(ageOn("1990-09-14", TODAY)).toBe(35);
  });
});

describe("jstToday", () => {
  it("uses the Japanese calendar day, not UTC", () => {
    // UTC では前日の 23:00 でも、JST では翌日
    expect(jstToday(Date.parse("2026-09-12T23:00:00.000Z"))).toBe("2026-09-13");
    expect(jstToday(Date.parse("2026-09-13T14:00:00.000Z"))).toBe("2026-09-13");
  });
});

describe("canSatisfy", () => {
  it("needs a birth date for the age check", () => {
    expect(canSatisfy("age", profile({ birthDate: null }), 20, TODAY)).toBe(
      false,
    );
    expect(canSatisfy("age", profile(), 20, TODAY)).toBe(true);
  });

  it("compares the age against the limit of the candidate", () => {
    const young = profile({ birthDate: "2010-01-01" });

    expect(canSatisfy("age", young, 18, TODAY)).toBe(false);
    expect(canSatisfy("age", young, 16, TODAY)).toBe(true);
  });

  it("needs the matching column for the other checks", () => {
    expect(
      canSatisfy(
        "nationality",
        profile({ nationality: null }),
        undefined,
        TODAY,
      ),
    ).toBe(false);
    expect(
      canSatisfy(
        "residence",
        profile({ residencePref: null }),
        undefined,
        TODAY,
      ),
    ).toBe(false);
  });

  it("satisfies nothing when there is no profile", () => {
    expect(canSatisfy("age", null, undefined, TODAY)).toBe(false);
    expect(canSatisfy("residence", null, undefined, TODAY)).toBe(false);
  });
});

describe("filterFeasible", () => {
  const candidates = [
    candidate([]),
    candidate(["age"], { ageLimit: 20 }),
    candidate(["residence"]),
    candidate(["nationality"]),
  ];

  it("keeps every candidate when the profile satisfies all of them", () => {
    const result = filterFeasible(candidates, profile(), TODAY);

    expect(result.candidates).toHaveLength(4);
    expect(result.excluded).toStrictEqual({});
  });

  it("drops the candidates whose check cannot be satisfied", () => {
    const result = filterFeasible(
      candidates,
      profile({ residencePref: null }),
      TODAY,
    );

    expect(result.candidates).toHaveLength(3);
    expect(result.excluded).toStrictEqual({ residence: 1 });
  });

  it("drops everything that requires a check when there is no profile", () => {
    const result = filterFeasible(candidates, null, TODAY);

    expect(result.candidates).toHaveLength(1);
    expect(result.excluded).toStrictEqual({
      age: 1,
      residence: 1,
      nationality: 1,
    });
  });

  it("counts a candidate once, by its first unmet check", () => {
    const result = filterFeasible(
      [candidate(["age", "residence"], { ageLimit: 20 })],
      profile({ birthDate: null, residencePref: null }),
      TODAY,
    );

    expect(result.candidates).toStrictEqual([]);
    expect(result.excluded).toStrictEqual({ age: 1 });
  });

  it("ignores verification kinds it does not know", () => {
    const result = filterFeasible([candidate(["income"])], null, TODAY);

    expect(result.candidates).toHaveLength(1);
    expect(result.excluded).toStrictEqual({});
  });
});

describe("orderByPreference", () => {
  const candidates = [
    { id: "a", genre: "和食" },
    { id: "b", genre: "中華" },
    { id: "c" },
    { id: "d", genre: "中華" },
  ];

  it("moves matching genres to the front and keeps the rest in order", () => {
    expect(orderByPreference(candidates, ["中華"]).map(({ id }) => id)).toEqual(
      ["b", "d", "a", "c"],
    );
  });

  it("changes nothing when no preference is set", () => {
    expect(orderByPreference(candidates, [])).toBe(candidates);
  });

  it("keeps candidates that match no preference", () => {
    expect(orderByPreference(candidates, ["フレンチ"])).toHaveLength(4);
  });
});

describe("excludedKinds", () => {
  it("returns the kinds in a fixed order, skipping the empty ones", () => {
    expect(excludedKinds({ residence: 2, age: 1 })).toEqual([
      "age",
      "residence",
    ]);
    expect(excludedKinds({ age: 0 })).toEqual([]);
  });
});
