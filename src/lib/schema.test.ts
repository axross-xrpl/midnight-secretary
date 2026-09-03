import { describe, expect, it } from "vitest";
import { z } from "zod";
import { fromZod } from "./schema";

const userSchema = z.object({
  name: z.string(),
});

describe("fromZod", () => {
  it("正常系: パース成功を ok に変換する", () => {
    const result = fromZod(userSchema.safeParse({ name: "Alice" }));

    expect(result).toStrictEqual({ ok: true, value: { name: "Alice" } });
  });

  it("正常系: パース失敗を kind タグ付きの err に変換する", () => {
    const result = fromZod(userSchema.safeParse({ name: 1 }));
    const error = result.ok ? undefined : result.error;

    expect(error?.kind).toBe("schema");
  });

  it("正常系: 失敗には issue の path と message が入る", () => {
    const result = fromZod(userSchema.safeParse({}));
    const error = result.ok ? undefined : result.error;

    expect(error?.issues[0]?.path).toStrictEqual(["name"]);
    expect(error?.issues[0]?.message).toBeTypeOf("string");
  });
});
