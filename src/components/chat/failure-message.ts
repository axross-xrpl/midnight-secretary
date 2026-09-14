import { match } from "ts-pattern";
import type {
  MoneyResponse,
  SecretaryErrorJson,
} from "@/lib/secretary-response";
import {
  parseAgeNotVerified,
  parseMandateOverBudget,
  parsePlanOverBudget,
} from "@/lib/secretary-response";
import type { RequestFailure } from "./types";

/**
 * 引数無しで引けるメッセージのキー
 *
 * `SecretaryError` の source x kind のうち金額や日付を出さないものと、封筒の失敗、ブラウザ側の失敗
 * 並びは `src/application/errors.ts` と各 port の error union の定義順
 */
const PLAIN_FAILURE_KEYS = [
  "calendar.unauthenticated",
  "calendar.tokenExpired",
  "calendar.forbidden",
  "calendar.http",
  "calendar.network",
  "calendar.schema",
  "catalog.unknownDestination",
  "catalog.unavailable",
  "catalog.schema",
  "planner.notATrip",
  "planner.noViableChoice",
  "planner.llm",
  "planner.schema",
  "plan.unknownOffer",
  "plan.lodgingRequired",
  "plan.lodgingNotAllowed",
  "plan.currencyMismatch",
  "plan.negativeResult",
  "mandate.notFound",
  "mandate.expired",
  "mandate.alreadyAuthorized",
  "mandate.proofFailed",
  "mandate.unavailable",
  "money.currencyMismatch",
  "money.negativeResult",
  "store.unavailable",
  "store.schema",
  "flow.noMandate",
  "flow.mandateExists",
  "flow.eventNotFound",
  "flow.eventAlreadyArranged",
  "flow.tripNotFound",
  "flow.wrongStatus",
  "flow.privateSettlementUnsupported",
  "flow.birthDateMissing",
  "identity.notRegistered",
  "identity.alreadyRegistered",
  "identity.proofFailed",
  "identity.unavailable",
  "profile.unavailable",
  "profile.schema",
  "unauthorized",
  "invalid_request",
  "network",
  "schema",
  "unknown",
] as const satisfies readonly string[];

/**
 * 引数無しで引けるメッセージのキー
 */
export type PlainFailureKey = (typeof PLAIN_FAILURE_KEYS)[number];

/**
 * 画面に出す文言の引き方
 *
 * 金額を埋める 2 つと日付を埋める 1 つだけ variant を分け、`t` の引数を型で合わせる
 * `ageNotVerified` の `cutoffDate` は出発日の `ageLimit` 年前で、画面は基準日 (出発日) に戻して出す
 */
export type FailureMessage =
  | { kind: "plain"; key: PlainFailureKey }
  | { kind: "planOverBudget"; budget: MoneyResponse; total: MoneyResponse }
  | {
      kind: "mandateOverBudget";
      cap: MoneyResponse;
      spent: MoneyResponse;
      requested: MoneyResponse;
    }
  | { kind: "ageNotVerified"; ageLimit: number; cutoffDate: string };

const plain = (key: PlainFailureKey): FailureMessage => {
  return { kind: "plain", key };
};

const planOverBudget = (error: SecretaryErrorJson): FailureMessage => {
  const detail = parsePlanOverBudget(error);

  if (!detail.ok) {
    return plain("schema");
  }

  return {
    kind: "planOverBudget",
    budget: detail.value.budget,
    total: detail.value.total,
  };
};

const mandateOverBudget = (error: SecretaryErrorJson): FailureMessage => {
  const detail = parseMandateOverBudget(error);

  if (!detail.ok) {
    return plain("schema");
  }

  return {
    kind: "mandateOverBudget",
    cap: detail.value.cap,
    spent: detail.value.spent,
    requested: detail.value.requested,
  };
};

const ageNotVerified = (error: SecretaryErrorJson): FailureMessage => {
  const detail = parseAgeNotVerified(error);

  if (!detail.ok) {
    return plain("schema");
  }

  return {
    kind: "ageNotVerified",
    ageLimit: detail.value.ageLimit,
    cutoffDate: detail.value.cutoffDate,
  };
};

// 知らない source / kind は unknown に畳む (サーバが新しい失敗を返しても画面は壊れない)
const secretaryMessage = (error: SecretaryErrorJson): FailureMessage => {
  const raw = `${error.source}.${error.error.kind}`;

  if (raw === "plan.overBudget") {
    return planOverBudget(error);
  }

  if (raw === "mandate.overBudget") {
    return mandateOverBudget(error);
  }

  if (raw === "flow.ageNotVerified") {
    return ageNotVerified(error);
  }

  const known = PLAIN_FAILURE_KEYS.find((candidate) => candidate === raw);

  return plain(known ?? "unknown");
};

/**
 * 失敗をメッセージの引き方に写す
 *
 * どの失敗にも必ずキーを返し、throw しない
 * 知らない source / kind は `unknown`、overBudget や ageNotVerified なのに detail が読めないときは `schema`
 */
export const failureMessageOf = (failure: RequestFailure): FailureMessage => {
  return match(failure)
    .with({ code: "unauthorized" }, () => plain("unauthorized"))
    .with({ code: "invalid_request" }, () => plain("invalid_request"))
    .with({ code: "secretary" }, ({ error }) => secretaryMessage(error))
    .with({ code: "unknown" }, () => plain("unknown"))
    .with({ code: "network" }, () => plain("network"))
    .with({ code: "schema" }, () => plain("schema"))
    .exhaustive();
};
