import { jstDateTimeOf } from "@/adapters/jst";
import type { PlaceOffer, TransportOffer } from "@/domain/catalog";
import type {
  Amount,
  CalendarEventId,
  IsoDate,
  IsoDateTime,
  OfferId,
  ParseError,
  UserId,
  WalletAddress,
} from "@/domain/identifiers";
import {
  mustParse,
  parseAmount,
  parseCalendarEventId,
  parseIsoDate,
  parseIsoDateTime,
  parseTripId,
  parseWalletAddress,
} from "@/domain/identifiers.parse";
import { paymentRefFor } from "@/domain/mandate.parse";
import type { Money } from "@/domain/money";
import { sumMoney } from "@/domain/money";
import type { TripPlan } from "@/domain/plan";
import type {
  ConfirmedTrip,
  ConfirmedTripItem,
  ConfirmedTripItemCategory,
  StoreError,
} from "@/domain/store";
import type { WrittenTrip } from "@/domain/trip";
import type { Result } from "@/lib/result";
import { all, err, ok } from "@/lib/result";

/**
 * `trips` に書く 1 行
 *
 * フィールド名は drizzle の schema に合わせる (この module は DB を触らない)
 */
export type TripRow = {
  id: string;
  userId: string;
  title: string;
  originCity: string;
  destinationCity: string;
  startDate: string;
  endDate: string;
  status: string;
  sourceEventId: string;
};

/**
 * `trip_items` に書く 1 行
 */
export type TripItemRow = {
  tripId: string;
  seq: number;
  category: string;
  serviceId: string;
  nameSnapshot: string;
  unitPrice: number;
  quantity: number;
  price: number;
  payeeSnapshot: string;
  startAt?: Date;
  endAt?: Date;
  status: string;
  bookingRef?: string;
  googleEventId?: string;
};

/**
 * `trips` から読んだ 1 行
 *
 * DB の null は読み取りの境界で undefined にしてからこの形にする
 */
export type ConfirmedTripRow = {
  id: string;
  title: string;
  originCity: string;
  destinationCity: string;
  startDate: string;
  endDate?: string;
  sourceEventId?: string;
  createdAt: Date;
};

/**
 * `trip_items` から読んだ 1 行
 */
export type ConfirmedTripItemRow = {
  seq: number;
  category: string;
  serviceId: string;
  nameSnapshot: string;
  price: number;
  payeeSnapshot: string;
  startAt?: Date;
  endAt?: Date;
  googleEventId?: string;
};

// db-design の `detected -> planning -> confirmed -> completed` のうち、確定した旅程が入る状態
const TRIP_STATUS = "confirmed";

// 確定旅程は支払いも書き戻しも済んでいるので、明細の状態は常に booked
const ITEM_STATUS = "booked";

// 明細は候補 1 件につき 1 つなので数量は常に 1 で、単価は価格と同じ
const QUANTITY = 1;

// 列は `*_jpyc` だが値は MST 建て (T9-8 で列名を揃えるまでこの扱い)
const CURRENCY = "MST";

const ZERO: Amount = mustParse(parseAmount(0));

const CATEGORIES = [
  "rail",
  "air",
  "hotel",
  "restaurant",
  "leisure",
] as const satisfies readonly ConfirmedTripItemCategory[];

// 明細 1 件ぶんの事実 (交通・宿・飲食・レジャーを同じ形にしたもの)
type ItemSource = {
  category: ConfirmedTripItemCategory;
  offerId: OfferId;
  name: string;
  price: Money;
  payee: WalletAddress;
  startAt?: IsoDateTime;
  endAt?: IsoDateTime;
};

const schemaError = (field: string, value: unknown): StoreError => {
  return {
    kind: "schema",
    issues: [{ path: [field], message: `invalid ${field}: ${String(value)}` }],
  };
};

// parse の失敗は「DB の行が期待した形でない」ことなので、store の schema の失敗にする
const parsed = <T>(value: Result<T, ParseError>): Result<T, StoreError> => {
  if (!value.ok) {
    return err(schemaError(value.error.field, value.error.value));
  }

  return value;
};

const optionalParsed = <T>(
  raw: string | undefined,
  parse: (raw: string) => Result<T, ParseError>,
): Result<T | undefined, StoreError> => {
  if (raw === undefined) {
    return ok(undefined);
  }

  return parsed(parse(raw));
};

const optionalAt = (
  raw: Date | undefined,
): Result<IsoDateTime | undefined, StoreError> => {
  return optionalParsed(raw?.toISOString(), parseIsoDateTime);
};

const categoryOf = (raw: string): ConfirmedTripItemCategory | undefined => {
  return CATEGORIES.find((category) => category === raw);
};

// 暦日を JST の日の始まりの時点にする (宿の check-in / check-out を timestamp の列に置くため)
// 交通の departAt / arriveAt が現地時刻の時点なので、宿の暦日も同じ時間帯の日の始まりに揃える
const dayStart = (date: IsoDate): IsoDateTime => {
  return jstDateTimeOf(date, "00:00");
};

const transportSource = (offer: TransportOffer): readonly ItemSource[] => {
  return [
    {
      category: offer.mode,
      offerId: offer.id,
      name: offer.vendor,
      price: offer.price,
      payee: offer.payee,
      startAt: offer.departAt,
      endAt: offer.arriveAt,
    },
  ];
};

const lodgingSource = (plan: TripPlan): readonly ItemSource[] => {
  const lodging = plan.lodging;

  if (lodging === undefined) {
    return [];
  }

  return [
    {
      category: "hotel",
      offerId: lodging.id,
      name: lodging.name,
      price: lodging.price,
      payee: lodging.payee,
      startAt: dayStart(lodging.checkIn),
      endAt: dayStart(lodging.checkOut),
    },
  ];
};

const placeSource = (
  offer: PlaceOffer | undefined,
  category: ConfirmedTripItemCategory,
): readonly ItemSource[] => {
  if (offer === undefined) {
    return [];
  }

  return [
    {
      category,
      offerId: offer.id,
      name: offer.name,
      price: offer.price,
      payee: offer.payee,
    },
  ];
};

// 並びは支払いの順 (往路、復路、あれば宿、あれば飲食、あればレジャー)
const itemSourcesOf = (plan: TripPlan): readonly ItemSource[] => {
  return [
    ...transportSource(plan.outbound),
    ...transportSource(plan.inbound),
    ...lodgingSource(plan),
    ...placeSource(plan.dining, "restaurant"),
    ...placeSource(plan.leisure, "leisure"),
  ];
};

// 予約番号を持たないので、その候補の支払いの公開ハッシュを予約の参照として残す
const bookingRefOf = (
  trip: WrittenTrip,
  offerId: OfferId,
): string | undefined => {
  const paymentRef = paymentRefFor(trip.id, offerId);

  return trip.authorizations.find(
    (authorization) => authorization.paymentRef === paymentRef,
  )?.publicHash;
};

const tripItemRowOf = (
  trip: WrittenTrip,
  source: ItemSource,
  seq: number,
  serviceId: string | undefined,
): Result<TripItemRow, StoreError> => {
  if (serviceId === undefined) {
    return err({
      kind: "unavailable",
      cause: { reason: "serviceIdMissing", offerId: source.offerId },
    });
  }

  const bookingRef = bookingRefOf(trip, source.offerId);

  return ok({
    tripId: trip.id,
    seq,
    category: source.category,
    serviceId,
    nameSnapshot: source.name,
    unitPrice: source.price.amount,
    quantity: QUANTITY,
    price: source.price.amount,
    payeeSnapshot: source.payee,
    ...(source.startAt === undefined
      ? {}
      : { startAt: new Date(source.startAt) }),
    ...(source.endAt === undefined ? {} : { endAt: new Date(source.endAt) }),
    status: ITEM_STATUS,
    ...(bookingRef === undefined ? {} : { bookingRef }),
    googleEventId: trip.writtenEventId,
  });
};

const confirmedItemOf = (
  source: ItemSource,
  seq: number,
  googleEventId: CalendarEventId,
): ConfirmedTripItem => {
  return {
    seq,
    category: source.category,
    serviceId: source.offerId,
    name: source.name,
    price: source.price,
    payee: source.payee,
    ...(source.startAt === undefined ? {} : { startAt: source.startAt }),
    ...(source.endAt === undefined ? {} : { endAt: source.endAt }),
    googleEventId,
  };
};

const confirmedItemOfRow = (
  row: ConfirmedTripItemRow,
): Result<ConfirmedTripItem, StoreError> => {
  const category = categoryOf(row.category);

  if (category === undefined) {
    return err(schemaError("category", row.category));
  }

  const amount = parsed(parseAmount(row.price));

  if (!amount.ok) {
    return amount;
  }

  const payee = parsed(parseWalletAddress(row.payeeSnapshot));

  if (!payee.ok) {
    return payee;
  }

  const startAt = optionalAt(row.startAt);

  if (!startAt.ok) {
    return startAt;
  }

  const endAt = optionalAt(row.endAt);

  if (!endAt.ok) {
    return endAt;
  }

  const googleEventId = optionalParsed(row.googleEventId, parseCalendarEventId);

  if (!googleEventId.ok) {
    return googleEventId;
  }

  return ok({
    seq: row.seq,
    category,
    serviceId: row.serviceId,
    name: row.nameSnapshot,
    price: { amount: amount.value, currency: CURRENCY },
    payee: payee.value,
    ...(startAt.value === undefined ? {} : { startAt: startAt.value }),
    ...(endAt.value === undefined ? {} : { endAt: endAt.value }),
    ...(googleEventId.value === undefined
      ? {}
      : { googleEventId: googleEventId.value }),
  });
};

// 明細が 1 件も無い旅程は合計 0 (`sumMoney` は空を受けられない)
const totalOf = (
  items: readonly ConfirmedTripItem[],
): Result<Money, StoreError> => {
  const [head, ...rest] = items;

  if (head === undefined) {
    return ok({ amount: ZERO, currency: CURRENCY });
  }

  const summed = sumMoney([head.price, ...rest.map((item) => item.price)]);

  if (!summed.ok) {
    return err(schemaError("price", summed.error.kind));
  }

  return ok(summed.value);
};

/**
 * 確定した出張を `trips` の 1 行にする
 *
 * 日帰りでも `end_date` を入れる (db-design の「未設定 = ヒアリング前」と衝突させない)
 */
export const tripRowOf = (userId: UserId, trip: WrittenTrip): TripRow => {
  return {
    id: trip.id,
    userId,
    title: trip.event.title,
    originCity: trip.plan.outbound.origin,
    destinationCity: trip.plan.intent.destination,
    startDate: trip.plan.intent.departOn,
    endDate: trip.plan.intent.returnOn,
    status: TRIP_STATUS,
    sourceEventId: trip.event.id,
  };
};

/**
 * 確定した出張を `trip_items` の行にする
 *
 * `seq` は支払いの順に 1 から、`google_event_id` は全明細に書き戻した予定の id を入れる (表に旅程単位の列が無い)
 * `serviceIds` に無い候補があれば失敗する (存在しないサービス行を指す明細を作らない)
 */
export const tripItemRowsOf = (
  trip: WrittenTrip,
  serviceIds: Readonly<Record<OfferId, string>>,
): Result<readonly TripItemRow[], StoreError> => {
  return all(
    itemSourcesOf(trip.plan).map((source, index) =>
      tripItemRowOf(trip, source, index + 1, serviceIds[source.offerId]),
    ),
  );
};

/**
 * 確定した出張を、DB を通さずに確定旅程の形にする
 *
 * Fake の store が使う (`code` からサービス行の id を引けないので DB には書かない)
 * 引き直しをしないので、明細の `serviceId` には候補の `code` がそのまま入る
 */
export const confirmedTripOfWritten = (trip: WrittenTrip): ConfirmedTrip => {
  return {
    id: trip.id,
    title: trip.event.title,
    originCity: trip.plan.outbound.origin,
    destinationCity: trip.plan.intent.destination,
    startDate: trip.plan.intent.departOn,
    endDate: trip.plan.intent.returnOn,
    sourceEventId: trip.event.id,
    items: itemSourcesOf(trip.plan).map((source, index) =>
      confirmedItemOf(source, index + 1, trip.writtenEventId),
    ),
    total: trip.plan.total,
    confirmedAt: trip.writtenAt,
  };
};

/**
 * `trips` と `trip_items` の行を確定旅程 1 件にする
 *
 * 合計は列に無いので明細の合計から導く
 * 行が期待した形でなければ schema の失敗にする (行を黙って捨てない)
 */
export const confirmedTripOf = (
  row: ConfirmedTripRow,
  itemRows: readonly ConfirmedTripItemRow[],
): Result<ConfirmedTrip, StoreError> => {
  const id = parsed(parseTripId(row.id));

  if (!id.ok) {
    return id;
  }

  const startDate = parsed(parseIsoDate(row.startDate));

  if (!startDate.ok) {
    return startDate;
  }

  const endDate = optionalParsed(row.endDate, parseIsoDate);

  if (!endDate.ok) {
    return endDate;
  }

  const sourceEventId = optionalParsed(row.sourceEventId, parseCalendarEventId);

  if (!sourceEventId.ok) {
    return sourceEventId;
  }

  const confirmedAt = parsed(parseIsoDateTime(row.createdAt.toISOString()));

  if (!confirmedAt.ok) {
    return confirmedAt;
  }

  const items = all(itemRows.map(confirmedItemOfRow));

  if (!items.ok) {
    return items;
  }

  const total = totalOf(items.value);

  if (!total.ok) {
    return total;
  }

  return ok({
    id: id.value,
    title: row.title,
    originCity: row.originCity,
    destinationCity: row.destinationCity,
    startDate: startDate.value,
    ...(endDate.value === undefined ? {} : { endDate: endDate.value }),
    ...(sourceEventId.value === undefined
      ? {}
      : { sourceEventId: sourceEventId.value }),
    items: items.value,
    total: total.value,
    confirmedAt: confirmedAt.value,
  });
};
