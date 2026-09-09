export const serviceCategories = [
  "rail",
  "air",
  "hotel",
  "restaurant",
  "leisure",
] as const;

export const transportModes = ["rail", "air"] as const;
export const placeKinds = ["hotel", "restaurant", "leisure"] as const;
export const verificationKinds = ["age", "nationality", "residence"] as const;

export type ServiceCategory = (typeof serviceCategories)[number];
export type TransportMode = (typeof transportModes)[number];
export type PlaceKind = (typeof placeKinds)[number];
export type VerificationKind = (typeof verificationKinds)[number];

/**
 * 価格の単位
 *
 * 種別から決まるので DB には持たない
 */
export const priceUnits = [
  "oneWay",
  "perNight",
  "perPerson",
  "perTicket",
] as const;

export type PriceUnit = (typeof priceUnits)[number];

export const categoryPriceUnits = {
  rail: "oneWay",
  air: "oneWay",
  hotel: "perNight",
  restaurant: "perPerson",
  leisure: "perTicket",
} as const satisfies Record<ServiceCategory, PriceUnit>;

/**
 * 種別が交通かどうか
 *
 * 詳細の取得先テーブル (transport_services / place_services) の判別に使う
 */
export const isTransportCategory = (
  category: ServiceCategory,
): category is TransportMode => {
  return (transportModes as readonly string[]).includes(category);
};
