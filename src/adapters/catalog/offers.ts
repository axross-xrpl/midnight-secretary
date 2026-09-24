import type {
  DoorToDoor,
  LodgingOffer,
  OfferQuery,
  PlaceOffer,
  PlaceOfferKind,
  TransportMode,
  TransportOffer,
  VerificationKind,
} from "@/domain/catalog";
import type { IsoDate, OfferId, WalletAddress } from "@/domain/identifiers";
import {
  mustParse,
  parseAmount,
  parseOfferId,
  parseWalletAddress,
} from "@/domain/identifiers.parse";
import type { Money } from "@/domain/money";
import {
  transportModes,
  verificationKinds,
} from "@/features/services/constants";
import { jstDateTimeOf } from "../jst";

/**
 * 交通 1 行のうち、候補を作るのに要る列
 *
 * Neon は必要な列だけを select して渡し、fake は設定画面の DTO をそのまま渡す (DTO はこの形を構造的に満たす)
 */
export type TransportRow = {
  code: string;
  name: string;
  mode: string;
  fromSpot: string;
  toSpot: string;
  departTime: string | null;
  arriveTime: string | null;
  durationMin: number;
  price: number;
  originAccessMin: number;
  boardingBufferMin: number;
  arrivalBufferMin: number | null;
  destinationAccessMin: number;
  accessFare: number | null;
  walletAddress: string;
};

/**
 * 場所系 1 行のうち、候補を作るのに要る列
 *
 * `TransportRow` と同じく、Neon の select の結果と設定画面の DTO のどちらも渡せる
 */
export type PlaceRow = {
  code: string;
  kind: string;
  name: string;
  city: string;
  genre: string | null;
  price: number;
  requiredVerifications: readonly string[];
  rating: number | null;
  ageLimit: number | null;
  walletAddress: string;
};

/**
 * 金額の通貨
 *
 * DB は円単位の整数を持つが、`Money` の通貨はデモ用の 2 つしか無い
 * 金額の大きさは同じなので、fake と real で揃えて MST 建てとして扱う
 */
const mst = (amount: number): Money => {
  return { amount: mustParse(parseAmount(amount)), currency: "MST" };
};

/**
 * 交通の行の mode を交通手段として読む
 *
 * DB の CHECK で 2 値に絞られているが、型の上では text なのでここで絞る
 * CHECK を外れた値は不変条件の違反なので throw し、呼び出し側で unavailable にさせる
 */
export const transportModeOf = (raw: string): TransportMode => {
  const mode = transportModes.find((value) => value === raw);

  if (mode === undefined) {
    throw new Error(`bug: transport mode is ${raw}`);
  }

  return mode;
};

const isVerificationKind = (value: string): value is VerificationKind => {
  return verificationKinds.some((kind) => kind === value);
};

/**
 * 場所系の行が求める本人確認を読む
 *
 * DB の CHECK で 3 値に絞られているが、型の上では text[] なので、知らない値を落として絞る
 */
export const verificationsOf = (raw: readonly string[]): VerificationKind[] => {
  return raw.filter(isVerificationKind);
};

// time 型は "HH:MM:SS" で来るので、JST の現地時刻が要る形に切る
const hourMinute = (value: string): string => {
  return value.slice(0, 5);
};

const offerId = (code: string): OfferId => {
  return mustParse(parseOfferId(code));
};

const payeeOf = (walletAddress: string): WalletAddress => {
  return mustParse(parseWalletAddress(walletAddress));
};

const optional = <T>(value: T | null): T | undefined => {
  return value === null ? undefined : value;
};

/**
 * 拠点から目的地までの所要と総額
 *
 * 内訳は交通の行が自己完結して持つので、移動条件のテーブルを引かない
 */
const doorToDoorOf = (row: TransportRow): DoorToDoor => {
  return {
    totalMin:
      row.originAccessMin +
      row.boardingBufferMin +
      row.durationMin +
      (row.arrivalBufferMin ?? 0) +
      row.destinationAccessMin,
    totalPrice: mst(row.price + (row.accessFare ?? 0)),
  };
};

/**
 * 交通 1 行を、クエリの日付に当てはめた候補にする
 *
 * 時刻を持たない行は旅程に置けないので候補から外す
 * `vendor` は DB に列が無い (事業者マスタを持たない設計) ので名称をそのまま使う
 */
export const transportOfferOn = (
  row: TransportRow,
  date: IsoDate,
): TransportOffer | undefined => {
  if (row.departTime === null || row.arriveTime === null) {
    return undefined;
  }

  return {
    id: offerId(row.code),
    mode: transportModeOf(row.mode),
    vendor: row.name,
    payee: payeeOf(row.walletAddress),
    origin: row.fromSpot,
    destination: row.toSpot,
    departAt: jstDateTimeOf(date, hourMinute(row.departTime)),
    arriveAt: jstDateTimeOf(date, hourMinute(row.arriveTime)),
    price: mst(row.price),
    doorToDoor: doorToDoorOf(row),
  };
};

/**
 * 宿泊 1 行を、滞在全体の料金の候補にする
 */
export const lodgingOfferFor = (
  row: PlaceRow,
  query: OfferQuery,
  nights: number,
): LodgingOffer => {
  return {
    id: offerId(row.code),
    vendor: row.name,
    payee: payeeOf(row.walletAddress),
    name: row.name,
    city: row.city,
    checkIn: query.departOn,
    checkOut: query.returnOn,
    price: mst(row.price * nights),
    ...(row.rating === null ? {} : { rating: row.rating }),
    requiredVerifications: verificationsOf(row.requiredVerifications),
  };
};

/**
 * 飲食・レジャー 1 行を候補にする
 */
export const placeOfferOf = (
  row: PlaceRow,
  kind: PlaceOfferKind,
): PlaceOffer => {
  const genre = optional(row.genre);
  const ageLimit = optional(row.ageLimit);

  return {
    id: offerId(row.code),
    kind,
    payee: payeeOf(row.walletAddress),
    name: row.name,
    city: row.city,
    ...(genre === undefined ? {} : { genre }),
    price: mst(row.price),
    requiredVerifications: verificationsOf(row.requiredVerifications),
    ...(ageLimit === undefined ? {} : { ageLimit }),
  };
};
