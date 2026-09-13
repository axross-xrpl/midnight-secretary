import { describe, expect, it } from "vitest";
import { verificationReadiness } from "./readiness";

describe("verificationReadiness", () => {
  it("marks both checks as ready when the source columns are filled", () => {
    expect(
      verificationReadiness({
        birthDate: "1990-04-01",
        residencePref: "大阪府",
      }),
    ).toStrictEqual([
      { kind: "age", ready: true },
      { kind: "residence", ready: true },
    ]);
  });

  it("marks a check as not ready when its source column is empty", () => {
    expect(
      verificationReadiness({ birthDate: null, residencePref: "" }),
    ).toStrictEqual([
      { kind: "age", ready: false },
      { kind: "residence", ready: false },
    ]);
  });

  it("judges each check from its own column", () => {
    expect(
      verificationReadiness({ birthDate: "1990-04-01", residencePref: null }),
    ).toStrictEqual([
      { kind: "age", ready: true },
      { kind: "residence", ready: false },
    ]);
  });
});
