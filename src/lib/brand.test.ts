import { describe, expectTypeOf, it } from "vitest";
import type { Brand } from "./brand";

type UserId = Brand<string, "UserId">;
type OrderId = Brand<string, "OrderId">;

describe("Brand", () => {
  it("型契約: 素の string は branded type に代入できない", () => {
    expectTypeOf<string>().not.toExtend<UserId>();
  });

  it("型契約: branded type は元の型として使える", () => {
    expectTypeOf<UserId>().toExtend<string>();
  });

  it("型契約: brand 名が異なる型同士は互換でない", () => {
    expectTypeOf<UserId>().not.toExtend<OrderId>();
    expectTypeOf<OrderId>().not.toExtend<UserId>();
  });
});
