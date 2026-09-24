import { match } from "ts-pattern";
import type {
  AuthorizationResponse,
  MoneyResponse,
  TripResponse,
} from "@/lib/secretary-response";
import type { PlanRow } from "./format";
import { planRows } from "./format";
import type { VendorKind } from "./styles";

/**
 * 受取先 1 件から見た支払いの居場所
 *
 * `unpaid` は承認前、`held` は承認して秘書が預かっている、`released` は受け取りの確認で受取先へ渡った
 */
export type PayeeFlowStatus = "unpaid" | "held" | "released";

/**
 * 計画の行 1 つを受取先として見たもの
 */
export type PayeeFlow = {
  key: string;
  kind: VendorKind;
  title: string;
  amount: MoneyResponse;
  status: PayeeFlowStatus;
};

/**
 * 「お金の居場所」パネルが描く、出張 1 件のお金の流れ
 *
 * 出張が無いときは受取先も合計も無い
 */
export type MoneyFlow = {
  payees: readonly PayeeFlow[];
  held?: MoneyResponse;
  released?: MoneyResponse;
};

// 承認済みの支払いは trip の status で持つ場所が変わる (提案だけの出張には無い)
const authorizationsOf = (
  trip: TripResponse,
): readonly AuthorizationResponse[] => {
  return match(trip)
    .with({ status: "proposed" }, () => [])
    .with(
      { status: "approved" },
      { status: "paid" },
      { status: "written" },
      ({ authorizations }) => authorizations,
    )
    .exhaustive();
};

// 支払い参照は domain の `paymentRefFor` と同じ形 (ブラウザ側では brand を持たない)
const paymentRefOf = (tripId: string, offerId: string): string => {
  return `trip:${tripId}:${offerId}`;
};

const statusOf = (
  authorization: AuthorizationResponse | undefined,
): PayeeFlowStatus => {
  if (authorization === undefined) {
    return "unpaid";
  }

  return authorization.escrow.status;
};

const kindOf = (row: PlanRow): VendorKind => {
  return match(row)
    .with({ kind: "transport" }, ({ offer }) => offer.mode)
    .with({ kind: "lodging" }, () => "lodging" as const)
    .with({ kind: "dining" }, () => "dining" as const)
    .with({ kind: "leisure" }, () => "leisure" as const)
    .exhaustive();
};

const titleOf = (row: PlanRow): string => {
  return match(row)
    .with(
      { kind: "transport" },
      ({ offer }) => `${offer.origin} -> ${offer.destination}`,
    )
    .with(
      { kind: "lodging" },
      { kind: "dining" },
      { kind: "leisure" },
      ({ offer }) => offer.name,
    )
    .exhaustive();
};

const payeeFlowOf = (
  trip: TripResponse,
  authorizations: readonly AuthorizationResponse[],
  row: PlanRow,
): PayeeFlow => {
  const paymentRef = paymentRefOf(trip.id, row.offer.id);
  const authorization = authorizations.find(
    (candidate) => candidate.paymentRef === paymentRef,
  );

  return {
    key: row.offer.id,
    kind: kindOf(row),
    title: titleOf(row),
    amount: row.offer.price,
    status: statusOf(authorization),
  };
};

// 合計の通貨は計画の合計と同じ (計画の候補はすべて同じ通貨)
const sumOf = (
  currency: MoneyResponse["currency"],
  payees: readonly PayeeFlow[],
  status: PayeeFlowStatus,
): MoneyResponse => {
  const amount = payees
    .filter((payee) => payee.status === status)
    .reduce((total, payee) => total + payee.amount.amount, 0);

  return { amount, currency };
};

/**
 * 出張 1 件から、受取先ごとの支払いの居場所と、預かり中 / 受取済みの合計を導く
 *
 * 行の順は `planRows` と同じ (時系列)
 */
export const moneyFlowOf = (trip: TripResponse | undefined): MoneyFlow => {
  if (trip === undefined) {
    return { payees: [], held: undefined, released: undefined };
  }

  const authorizations = authorizationsOf(trip);
  const payees = planRows(trip.plan).map((row) =>
    payeeFlowOf(trip, authorizations, row),
  );
  const currency = trip.plan.total.currency;

  return {
    payees,
    held: sumOf(currency, payees, "held"),
    released: sumOf(currency, payees, "released"),
  };
};
