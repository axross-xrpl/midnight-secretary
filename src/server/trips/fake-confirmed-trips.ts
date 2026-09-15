import type {
  ConfirmedTrip,
  ConfirmedTripItem,
} from "@/features/trips/confirmed-trip";

type ItemSeed = Omit<ConfirmedTripItem, "id" | "seq" | "price"> & {
  quantity: number;
};

// 明細の id と並び順、確定額 (単価 × 数量) は旅程ごとに機械的に決まるので、種から組み立てる
// `price = unitPrice * quantity` は DB の CHECK と同じ関係 (`db-design.md` §8)
const itemsOf = (
  tripId: string,
  seeds: readonly ItemSeed[],
): readonly ConfirmedTripItem[] => {
  return seeds.map((seed, index) => ({
    ...seed,
    id: `${tripId}-item-${index + 1}`,
    seq: index + 1,
    price: seed.unitPrice * seed.quantity,
  }));
};

const OSAKA_STAY: ConfirmedTrip = {
  id: "fake-trip-osaka-stay",
  title: "大阪出張",
  originCity: "東京",
  destinationCity: "大阪",
  startDate: "2026-09-20",
  endDate: "2026-09-21",
  items: itemsOf("fake-trip-osaka-stay", [
    {
      category: "rail",
      name: "JR東海道新幹線 のぞみ221号",
      unitPrice: 14520,
      quantity: 1,
      startAt: "2026-09-20T01:00:00.000Z",
      endAt: "2026-09-20T03:30:00.000Z",
      status: "booked",
      bookingRef: "RAIL-20260920-0001",
    },
    {
      category: "hotel",
      name: "ホテルB 大阪梅田",
      unitPrice: 16000,
      quantity: 1,
      startAt: "2026-09-20T06:00:00.000Z",
      endAt: "2026-09-21T02:00:00.000Z",
      status: "booked",
      bookingRef: "HOTEL-20260920-0002",
    },
    {
      category: "restaurant",
      name: "中華料理 陳家",
      unitPrice: 8000,
      quantity: 1,
      startAt: "2026-09-20T10:00:00.000Z",
      endAt: "2026-09-20T12:00:00.000Z",
      status: "booked",
      bookingRef: "REST-20260920-0003",
    },
    {
      category: "leisure",
      name: "京セラドーム大阪 野球観戦",
      unitPrice: 5500,
      quantity: 1,
      startAt: "2026-09-21T04:00:00.000Z",
      endAt: "2026-09-21T08:00:00.000Z",
      status: "paid",
      bookingRef: null,
    },
    {
      category: "rail",
      name: "JR東海道新幹線 のぞみ330号",
      unitPrice: 14520,
      quantity: 1,
      startAt: "2026-09-21T09:00:00.000Z",
      endAt: "2026-09-21T11:30:00.000Z",
      status: "booked",
      bookingRef: "RAIL-20260921-0004",
    },
  ]),
};

const OSAKA_DAY_TRIP: ConfirmedTrip = {
  id: "fake-trip-osaka-day",
  title: "大阪 日帰り商談",
  originCity: "東京",
  destinationCity: "大阪",
  startDate: "2026-08-05",
  endDate: null,
  items: itemsOf("fake-trip-osaka-day", [
    {
      category: "air",
      name: "ANA 017便",
      unitPrice: 13000,
      quantity: 1,
      startAt: "2026-08-04T23:00:00.000Z",
      endAt: "2026-08-05T00:10:00.000Z",
      status: "booked",
      bookingRef: "AIR-20260805-0001",
    },
    {
      category: "restaurant",
      name: "中華 天心",
      unitPrice: 2200,
      quantity: 2,
      startAt: "2026-08-05T03:00:00.000Z",
      endAt: "2026-08-05T04:00:00.000Z",
      status: "booked",
      bookingRef: "REST-20260805-0002",
    },
    {
      category: "air",
      name: "ANA 038便",
      unitPrice: 13000,
      quantity: 1,
      startAt: "2026-08-05T10:00:00.000Z",
      endAt: "2026-08-05T11:15:00.000Z",
      status: "booked",
      bookingRef: "AIR-20260805-0003",
    },
  ]),
};

/**
 * 確定旅程の fake (`SECRETARY_STORE=fake` のときに画面へ出すもの)
 *
 * 中身は `basic-spec.md` §2 のデモシナリオ (大阪出張・宿泊＋観光) に合わせてあり、
 * 名称と価格は seed 済みのサービス行から写した
 * 一覧と同じく出発日の新しい順で返す
 */
export function fakeConfirmedTrips(): readonly ConfirmedTrip[] {
  return [OSAKA_STAY, OSAKA_DAY_TRIP];
}
