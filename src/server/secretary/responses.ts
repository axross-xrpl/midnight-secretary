import "server-only";

import { match, P } from "ts-pattern";
import type { SecretaryError } from "@/application/errors";
import type { WriteBackResult } from "@/application/secretary";
import type { AgeRegistration } from "@/domain/identity";
import type { StoreError } from "@/domain/store";
import { fromThrowable } from "@/lib/result";

// 循環参照を持つ原因は JSON にできないので、その場合だけ toString に落とす
const jsonOf = (cause: unknown): string | undefined => {
  const json = fromThrowable(
    () => JSON.stringify(cause),
    () => undefined,
  );

  if (!json.ok) {
    return undefined;
  }

  return json.value;
};

/**
 * `unknown` の原因を、クライアントへ返せる 1 行の文字列にする
 *
 * Error は `name: message`、文字列はそのまま、それ以外は JSON
 */
export const describeCause = (cause: unknown): string => {
  if (cause instanceof Error) {
    return `${cause.name}: ${cause.message}`;
  }

  if (typeof cause === "string") {
    return cause;
  }

  return jsonOf(cause) ?? String(cause);
};

/**
 * 失敗の中の `cause: unknown` を文字列に置き換える
 *
 * JSON に Error インスタンスや循環参照を残さない
 * `cause` を持たない variant はそのまま返す
 */
export const serializableSecretaryError = (
  error: SecretaryError,
): SecretaryError => {
  return match(error)
    .returnType<SecretaryError>()
    .with(
      { source: "calendar", error: { cause: P._ } },
      ({ error: inner }) => ({
        source: "calendar",
        error: { ...inner, cause: describeCause(inner.cause) },
      }),
    )
    .with({ source: "catalog", error: { cause: P._ } }, ({ error: inner }) => ({
      source: "catalog",
      error: { ...inner, cause: describeCause(inner.cause) },
    }))
    .with({ source: "planner", error: { cause: P._ } }, ({ error: inner }) => ({
      source: "planner",
      error: { ...inner, cause: describeCause(inner.cause) },
    }))
    .with({ source: "mandate", error: { cause: P._ } }, ({ error: inner }) => ({
      source: "mandate",
      error: { ...inner, cause: describeCause(inner.cause) },
    }))
    .with({ source: "store", error: { cause: P._ } }, ({ error: inner }) => ({
      source: "store",
      error: { ...inner, cause: describeCause(inner.cause) },
    }))
    .with(
      { source: "identity", error: { cause: P._ } },
      ({ error: inner }) => ({
        source: "identity",
        error: { ...inner, cause: describeCause(inner.cause) },
      }),
    )
    .with({ source: "profile", error: { cause: P._ } }, ({ error: inner }) => ({
      source: "profile",
      error: { ...inner, cause: describeCause(inner.cause) },
    }))
    .otherwise(() => error);
};

/**
 * store の失敗の中の `cause: unknown` を文字列に置き換える
 *
 * `serializableSecretaryError` と同じ考えで、JSON に Error インスタンスや循環参照を残さない
 */
export const serializableStoreError = (error: StoreError): StoreError => {
  if (error.kind === "schema") {
    return error;
  }

  return { ...error, cause: describeCause(error.cause) };
};

/**
 * 書き戻しの結果を JSON にする
 *
 * 出張の形は他の手と同じで、確定旅程の保存に失敗したときだけ `confirmedStoreError` が付く
 * カレンダーには書けているので、これは成功の応答の中の補足
 */
export const writeBackResponseOf = (
  result: WriteBackResult,
): Readonly<Record<string, unknown>> => {
  const failure = result.confirmedStoreError;

  if (failure === undefined) {
    return { ...result.trip };
  }

  return {
    ...result.trip,
    confirmedStoreError: serializableStoreError(failure),
  };
};

/**
 * 年齢確認証明書を JSON にする
 *
 * 生年月日はもちろん `userId` も返さず、公開される `identity` と載っている場所の情報 (`origin`) だけを載せる
 * 未発行はフィールドごと消えないよう null にする (JSON では undefined が消えるため)
 */
export const ageCredentialResponseOf = (
  registration: AgeRegistration | undefined,
): Readonly<Record<string, unknown>> => {
  if (registration === undefined) {
    return { credential: null };
  }

  return {
    credential: {
      identity: registration.identity,
      origin: registration.origin,
    },
  };
};

/**
 * use case の失敗に対応する HTTP status
 */
export const statusOf = (error: SecretaryError): number => {
  return match(error)
    .returnType<number>()
    .with(
      {
        source: "calendar",
        error: { kind: P.union("unauthenticated", "tokenExpired") },
      },
      () => 401,
    )
    .with({ source: "calendar", error: { kind: "forbidden" } }, () => 403)
    .with(
      {
        source: "calendar",
        error: { kind: P.union("http", "network", "schema") },
      },
      () => 502,
    )
    .with(
      {
        source: "flow",
        error: { kind: P.union("eventNotFound", "tripNotFound") },
      },
      () => 404,
    )
    .with(
      {
        source: "flow",
        error: {
          kind: P.union(
            "noMandate",
            "mandateExists",
            "eventAlreadyArranged",
            "wrongStatus",
          ),
        },
      },
      () => 409,
    )
    .with(
      {
        source: "flow",
        error: {
          kind: P.union(
            "privateSettlementUnsupported",
            "ageCredentialMissing",
            "birthDateMissing",
            "replanNotNeeded",
          ),
        },
      },
      () => 422,
    )
    .with({ source: "mandate", error: { kind: "notFound" } }, () => 404)
    .with(
      { source: "mandate", error: { kind: "alreadyAuthorized" } },
      () => 409,
    )
    .with(
      { source: "mandate", error: { kind: P.union("overBudget", "expired") } },
      () => 422,
    )
    .with(
      {
        source: "mandate",
        error: { kind: P.union("proofFailed", "unavailable") },
      },
      () => 502,
    )
    .with(
      { source: "catalog", error: { kind: "unknownDestination" } },
      () => 422,
    )
    .with(
      { source: "catalog", error: { kind: P.union("unavailable", "schema") } },
      () => 502,
    )
    .with(
      {
        source: "planner",
        error: { kind: P.union("notATrip", "noViableChoice") },
      },
      () => 422,
    )
    .with(
      { source: "planner", error: { kind: P.union("llm", "schema") } },
      () => 502,
    )
    .with({ source: "plan" }, () => 422)
    .with({ source: "money" }, () => 422)
    .with({ source: "store" }, () => 502)
    .with(
      {
        source: "identity",
        error: { kind: P.union("notRegistered", "alreadyRegistered") },
      },
      () => 409,
    )
    .with(
      {
        source: "identity",
        error: { kind: P.union("proofFailed", "unavailable") },
      },
      () => 502,
    )
    .with({ source: "profile" }, () => 502)
    .exhaustive();
};

/**
 * 成功の応答 (`{ data }`)
 */
export const dataResponse = <T>(data: T, status: 200 | 201): Response => {
  return Response.json({ data }, { status });
};

/**
 * use case の失敗の応答
 *
 * `{ error: { code: "secretary", message: "<source>.<kind>", detail } }` を `statusOf` の status で返す
 * `detail` は `serializableSecretaryError` を通した SecretaryError
 */
export const secretaryErrorResponse = (error: SecretaryError): Response => {
  const detail = serializableSecretaryError(error);

  return Response.json(
    {
      error: {
        code: "secretary",
        message: `${detail.source}.${detail.error.kind}`,
        detail,
      },
    },
    { status: statusOf(error) },
  );
};
