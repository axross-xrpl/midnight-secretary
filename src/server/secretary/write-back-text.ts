import { match } from "ts-pattern";
import type {
  LodgingOffer,
  TransportMode,
  TransportOffer,
} from "@/domain/catalog";
import type { EventText, PaidTrip } from "@/domain/trip";

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
    | "mode.air",
  values?: Readonly<Record<string, string | number>>,
) => string;

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

const lodgingTextOf = (
  lodging: LodgingOffer | undefined,
  t: WriteBackTranslate,
): string => {
  if (lodging === undefined) {
    return t("noLodging");
  }

  return lodging.name;
};

/**
 * 支払い済みの出張からカレンダーに書く文言を組み立てる
 */
export const writeBackText = (
  trip: PaidTrip,
  t: WriteBackTranslate,
): EventText => {
  const plan = trip.plan;

  return {
    title: t("title", { destination: plan.intent.destination }),
    description: t("description", {
      purpose: plan.intent.purpose,
      outbound: transportTextOf(plan.outbound, t),
      inbound: transportTextOf(plan.inbound, t),
      lodging: lodgingTextOf(plan.lodging, t),
      total: t("total", {
        amount: plan.total.amount,
        currency: plan.total.currency,
      }),
    }),
  };
};
