import { describe, expect, it } from "vitest";
import { profileSaveSchema } from "./schemas";

const valid = {
  fullName: "山田 太郎",
  address: "東京都港区1-1-1",
  birthDate: "1990-04-01",
  residencePref: "東京都",
  homeCity: "東京",
  homeSpot: "品川",
  diningGenres: ["中華"],
  leisureGenres: ["art"],
  budget: 50000,
  priority: "time",
  walletAddress: "addr1q9demo0000",
};

const fieldErrors = (input: unknown) => {
  const parsed = profileSaveSchema.safeParse(input);

  return parsed.success ? {} : parsed.error.flatten().fieldErrors;
};

describe("profileSaveSchema", () => {
  it("accepts a fully filled profile", () => {
    const parsed = profileSaveSchema.safeParse(valid);

    expect(parsed.success).toBe(true);
  });

  it("turns empty text into null so the column is cleared", () => {
    const parsed = profileSaveSchema.parse({
      ...valid,
      fullName: "",
      address: "",
      homeSpot: "",
      birthDate: "",
      residencePref: "",
      priority: "",
      budget: null,
      walletAddress: "",
    });

    expect(parsed).toMatchObject({
      fullName: null,
      address: null,
      homeSpot: null,
      birthDate: null,
      residencePref: null,
      priority: null,
      budget: null,
      walletAddress: null,
    });
  });

  it("requires a home city", () => {
    expect(fieldErrors({ ...valid, homeCity: "" })).toHaveProperty("homeCity");
  });

  it("rejects a birth date in the future", () => {
    expect(fieldErrors({ ...valid, birthDate: "2999-01-01" })).toHaveProperty(
      "birthDate",
    );
  });

  it("rejects a birth date before 1900", () => {
    expect(fieldErrors({ ...valid, birthDate: "1899-12-31" })).toHaveProperty(
      "birthDate",
    );
  });

  it("rejects a residence that is not one of the options", () => {
    expect(fieldErrors({ ...valid, residencePref: "大阪" })).toHaveProperty(
      "residencePref",
    );
  });

  it("accepts 国外 as a residence", () => {
    expect(fieldErrors({ ...valid, residencePref: "国外" })).toStrictEqual({});
  });

  it("rejects a priority outside the fixed values", () => {
    expect(fieldErrors({ ...valid, priority: "cheap" })).toHaveProperty(
      "priority",
    );
  });

  it("rejects a negative budget", () => {
    expect(fieldErrors({ ...valid, budget: -1 })).toHaveProperty("budget");
  });

  it("rejects duplicate genres", () => {
    expect(
      fieldErrors({ ...valid, diningGenres: ["中華", "中華"] }),
    ).toHaveProperty("diningGenres");
  });

  it("rejects more than 10 genres", () => {
    const many = Array.from({ length: 11 }, (_, index) => `g${index}`);

    expect(fieldErrors({ ...valid, leisureGenres: many })).toHaveProperty(
      "leisureGenres",
    );
  });

  it("rejects a wallet address shorter than the database check allows", () => {
    expect(fieldErrors({ ...valid, walletAddress: "short" })).toHaveProperty(
      "walletAddress",
    );
  });

  it("rejects columns the screen does not own", () => {
    expect(
      profileSaveSchema.safeParse({ ...valid, email: "other@example.com" })
        .success,
    ).toBe(false);
    expect(
      profileSaveSchema.safeParse({ ...valid, nationality: "JP" }).success,
    ).toBe(false);
  });

  it("keeps updatedAt optional so a first save can be an insert", () => {
    expect(profileSaveSchema.parse(valid).updatedAt).toBeUndefined();
    expect(
      profileSaveSchema.parse({
        ...valid,
        updatedAt: "2026-09-13T00:00:00.000Z",
      }).updatedAt,
    ).toBe("2026-09-13T00:00:00.000Z");
  });
});
