import { match } from "ts-pattern";
import type {
  LodgingOffer,
  PlaceOffer,
  TransportMode,
  TransportOffer,
} from "@/domain/catalog";
import type { TripPlan } from "@/domain/plan";
import type { EventText, PaidTrip } from "@/domain/trip";
import { filterMap } from "@/lib/array";

/**
 * description の 1 行の文言のキー
 */
export type WriteBackLineKey =
  | "lines.outbound"
  | "lines.inbound"
  | "lines.lodging"
  | "lines.dining"
  | "lines.leisure"
  | "lines.total";

/**
 * `WriteBack` 名前空間の文言を引く関数
 *
 * next-intl の `getTranslations({ locale, namespace: "WriteBack" })` の戻り値をそのまま渡せる形に絞っている
 */
export type WriteBackTranslate = (
  key:
    | "title"
    | "description"
    | "transport"
    | "noLodging"
    | "total"
    | "mode.rail"
    | "mode.air"
    | WriteBackLineKey,
  values?: Readonly<Record<string, string | number>>,
) => string;

// 行の値で、計画にその候補が無ければ undefined を返して行ごと省かせる
type LineValueOf = (
  plan: TripPlan,
  t: WriteBackTranslate,
) => string | undefined;

// description の 1 行で、値が無ければ行ごと省く
type LineSpec = {
  key: WriteBackLineKey;
  valueOf: LineValueOf;
};

const modeKeyOf = (mode: TransportMode): "mode.rail" | "mode.air" => {
  return match(mode)
    .returnType<"mode.rail" | "mode.air">()
    .with("rail", () => "mode.rail")
    .with("air", () => "mode.air")
    .exhaustive();
};

const transportTextOf = (
  offer: TransportOffer,
  t: WriteBackTranslate,
): string => {
  return t("transport", {
    vendor: offer.vendor,
    mode: t(modeKeyOf(offer.mode)),
  });
};

// 宿の行は日帰りでも残し、無いことを文言で示す
const lodgingTextOf = (
  lodging: LodgingOffer | undefined,
  t: WriteBackTranslate,
): string => {
  if (lodging === undefined) {
    return t("noLodging");
  }

  return lodging.name;
};

const placeTextOf = (place: PlaceOffer | undefined): string | undefined => {
  return place?.name;
};

// 行の順は計画の候補の順 (往路、復路、宿泊、飲食、レジャー) で、最後に合計
const LINES = [
  {
    key: "lines.outbound",
    valueOf: (plan, t) => transportTextOf(plan.outbound, t),
  },

  {
    key: "lines.inbound",
    valueOf: (plan, t) => transportTextOf(plan.inbound, t),
  },

  {
    key: "lines.lodging",
    valueOf: (plan, t) => lodgingTextOf(plan.lodging, t),
  },

  { key: "lines.dining", valueOf: (plan) => placeTextOf(plan.dining) },

  { key: "lines.leisure", valueOf: (plan) => placeTextOf(plan.leisure) },

  {
    key: "lines.total",
    valueOf: (plan, t) =>
      t("total", { amount: plan.total.amount, currency: plan.total.currency }),
  },
] as const satisfies readonly LineSpec[];

const lineTextOf = (
  spec: LineSpec,
  plan: TripPlan,
  t: WriteBackTranslate,
): string | undefined => {
  const value = spec.valueOf(plan, t);

  if (value === undefined) {
    return undefined;
  }

  return t(spec.key, { value });
};

/**
 * 支払い済みの出張からカレンダーに書く文言を組み立てる
 *
 * description は目的、候補ごとの行 (飲食とレジャーは計画にあるときだけ)、合計を改行で並べる
 */
export const writeBackText = (
  trip: PaidTrip,
  t: WriteBackTranslate,
): EventText => {
  const plan = trip.plan;
  const lines = filterMap(LINES, (spec) => lineTextOf(spec, plan, t));

  return {
    title: t("title", { destination: plan.intent.destination }),
    description: t("description", {
      purpose: plan.intent.purpose,
      lines: lines.join("\n"),
    }),
  };
};
