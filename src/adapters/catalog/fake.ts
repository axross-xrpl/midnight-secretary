import type {
  FareCatalogPort,
  LodgingOffer,
  TransportOffer,
} from "@/domain/catalog";
import { ok } from "@/lib/result";

/**
 * Fake のカタログが返す運賃
 *
 * fake と real のデータが一致するよう、NeonDB の seed を写している
 */
export type FakeCatalogSeed = {
  transport: readonly TransportOffer[];
  lodging: readonly LodgingOffer[];
};

/**
 * 東京発の大阪と福岡の往復で、ホテルはそれぞれ 1 軒
 *
 * 価格は JPY で固定
 * NeonDB の seed と同じ行
 * demo preset に限らず、カタログの port が fake のときは常に使う
 */
export const seedCatalog = (): FakeCatalogSeed => {
  return { transport: [], lodging: [] };
};

/**
 * seed を読むだけのカタログ
 *
 * `findOffers` は出発地と目的地と日付を厳密に一致させる
 */
export const createFakeCatalog = (_seed: FakeCatalogSeed): FareCatalogPort => {
  return {
    listDestinations: async () => ok([]),
    findOffers: async () => ok({ outbound: [], inbound: [], lodging: [] }),
  };
};
