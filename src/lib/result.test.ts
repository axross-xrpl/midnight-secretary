import { describe, expect, expectTypeOf, it } from "vitest";
import type { Ok, Result } from "./result";
import {
  all,
  andThen,
  err,
  fromPromise,
  fromThrowable,
  isOk,
  map,
  mapErr,
  match,
  ok,
  orElse,
  partition,
  unwrapOr,
} from "./result";

/**
 * テスト用の期待される失敗
 */
type TestError = {
  kind: "test_failure";
  detail: string;
};

const testError = (detail: string): TestError => {
  return { kind: "test_failure", detail };
};

describe("map / mapErr", () => {
  it("正常系: 成功値を変換する", () => {
    const result = map(ok(2), (n) => n * 10);

    expect(result).toStrictEqual({ ok: true, value: 20 });
  });

  it("正常系: 失敗は変換せずそのまま通す", () => {
    const result = map(err(testError("boom")), (n: number) => n * 10);

    expect(result).toStrictEqual({
      ok: false,
      error: { kind: "test_failure", detail: "boom" },
    });
  });

  it("正常系: mapErr は失敗値だけを変換する", () => {
    const result = mapErr(err(testError("boom")), (e) => e.detail);

    expect(result).toStrictEqual({ ok: false, error: "boom" });
  });
});

describe("andThen / orElse", () => {
  const parsePositive = (n: number): Result<number, TestError> => {
    if (n > 0) {
      return ok(n);
    }

    return err(testError("not positive"));
  };

  it("正常系: 成功値に次の Result 関数を適用して平坦化する", () => {
    const result = andThen(ok(3), parsePositive);

    expect(result).toStrictEqual({ ok: true, value: 3 });
  });

  it("正常系: 途中の失敗で short-circuit する", () => {
    const result = andThen(ok(-1), parsePositive);

    expect(result).toStrictEqual({
      ok: false,
      error: { kind: "test_failure", detail: "not positive" },
    });
  });

  it("正常系: orElse は失敗から回復できる", () => {
    const result = orElse(err(testError("boom")), () => ok(0));

    expect(result).toStrictEqual({ ok: true, value: 0 });
  });
});

describe("match / unwrapOr", () => {
  it("正常系: 成功・失敗を単一の値に畳み込む", () => {
    const onOk = (n: number): string => {
      return `value:${n}`;
    };

    const onErr = (e: TestError): string => {
      return `error:${e.detail}`;
    };

    expect(match(ok(1), onOk, onErr)).toBe("value:1");
    expect(match(err(testError("boom")), onOk, onErr)).toBe("error:boom");
  });

  it("正常系: unwrapOr は失敗時にフォールバック値を返す", () => {
    expect(unwrapOr(ok(1), 0)).toBe(1);
    expect(unwrapOr(err(testError("boom")), 0)).toBe(0);
  });
});

describe("all / partition", () => {
  it("正常系: すべて成功なら値の配列にまとめる", () => {
    const result = all([ok(1), ok(2), ok(3)]);

    expect(result).toStrictEqual({ ok: true, value: [1, 2, 3] });
  });

  it("正常系: 失敗が混ざると最初の失敗を返す", () => {
    const result = all([
      ok(1),
      err(testError("first")),
      err(testError("second")),
    ]);

    expect(result).toStrictEqual({
      ok: false,
      error: { kind: "test_failure", detail: "first" },
    });
  });

  it("境界値: 空配列は空の成功を返す", () => {
    const result = all([]);

    expect(result).toStrictEqual({ ok: true, value: [] });
  });

  it("正常系: partition は成功値と失敗値に振り分ける", () => {
    const result = partition([ok(1), err(testError("boom")), ok(2)]);

    expect(result).toStrictEqual({
      values: [1, 2],
      errors: [{ kind: "test_failure", detail: "boom" }],
    });
  });
});

describe("fromThrowable / fromPromise", () => {
  const boom = (): number => {
    throw new Error("boom");
  };

  it("正常系: throw しない関数の戻り値を ok で包む", () => {
    const result = fromThrowable(
      () => 1,
      () => testError("unreachable"),
    );

    expect(result).toStrictEqual({ ok: true, value: 1 });
  });

  it("正常系: throw を期待される失敗に変換する", () => {
    const result = fromThrowable(boom, () => testError("caught"));

    expect(result).toStrictEqual({
      ok: false,
      error: { kind: "test_failure", detail: "caught" },
    });
  });

  it("正常系: resolve した Promise を ok で包む", async () => {
    const result = await fromPromise(Promise.resolve(1), () => {
      return testError("unreachable");
    });

    expect(result).toStrictEqual({ ok: true, value: 1 });
  });

  it("正常系: reject を期待される失敗に変換する", async () => {
    const result = await fromPromise(Promise.reject(new Error("boom")), () =>
      testError("rejected"),
    );

    expect(result).toStrictEqual({
      ok: false,
      error: { kind: "test_failure", detail: "rejected" },
    });
  });
});

describe("型契約", () => {
  it("ok / err は Result に代入できる", () => {
    expectTypeOf(ok(1)).toExtend<Result<number, never>>();
    expectTypeOf(err("boom")).toExtend<Result<never, string>>();
  });

  it("isOk は Ok に絞り込む型ガードである", () => {
    expectTypeOf(isOk<number, string>).guards.toEqualTypeOf<Ok<number>>();
  });

  it("andThen はエラー型を合成する", () => {
    const parse = (n: number): Result<string, TestError> => {
      return ok(String(n));
    };

    const start: Result<number, "first"> = ok(1);

    // 型注釈への代入がコンパイル時の契約アサーションになる
    const chained: Result<string, "first" | TestError> = andThen(start, parse);

    expect(chained).toStrictEqual({ ok: true, value: "1" });
  });
});
