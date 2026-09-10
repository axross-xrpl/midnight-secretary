import catalogJson from "@/data/catalog.json";
import { catalogSchema } from "@/lib/schemas";
import type { Catalog, Hotel, HotelCandidate } from "@/lib/types";

const catalog: Catalog = catalogSchema.parse(catalogJson) as Catalog;

const OSAKA_CITY_NAMES = new Set(["大阪", "大阪市", "大阪府大阪市"]);
const PRICE_FRESHNESS_MS = 30 * 24 * 60 * 60 * 1000;

function hasFreshPrice(hotel: Hotel): boolean {
  const checkedAt = new Date(hotel.price_checked_at).getTime();
  const age = Date.now() - checkedAt;
  return age >= 0 && age <= PRICE_FRESHNESS_MS;
}

export function getCatalog(): Catalog {
  return catalog;
}

export function normalizeHotel(hotel: Hotel): HotelCandidate {
  return {
    ...hotel,
    address: `${hotel.prefecture}${hotel.city}${hotel.ward}${hotel.address_line}`,
  };
}

export function findHotels(filters: {
  city?: string;
  maxPrice?: number;
}): HotelCandidate[] {
  if (filters.city && !OSAKA_CITY_NAMES.has(filters.city.trim())) {
    return [];
  }

  return catalog.hotels
    .filter(hasFreshPrice)
    .filter(
      (hotel) =>
        filters.maxPrice === undefined || hotel.price_jpy <= filters.maxPrice,
    )
    .sort((a, b) => a.price_jpy - b.price_jpy || b.rating - a.rating)
    .slice(0, 20)
    .map(normalizeHotel);
}

export function selectCandidatesById(
  filters: { city?: string; maxPrice?: number },
  candidateIds: string[],
): HotelCandidate[] {
  const allowedIds = new Set(candidateIds);
  return findHotels(filters).filter((hotel) => allowedIds.has(hotel.id));
}
