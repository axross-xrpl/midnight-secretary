import "server-only";

import type {
  CatalogManagementPort,
  PlaceServiceRow,
  ServiceListFilters,
  ServiceListItem,
  TransportServiceRow,
} from "@/domain/catalog";
import { unwrapOrThrow } from "../unwrap";

export { serviceCategories } from "@/features/services/constants";
export type { ServiceListFilters, ServiceListItem } from "@/domain/catalog";

/**
 * サービス一覧を読む (種別の論理順、種別の中は名前順)
 */
export const readServices = async (
  filters: ServiceListFilters,
  catalog: CatalogManagementPort,
): Promise<ServiceListItem[]> => {
  return [...unwrapOrThrow(await catalog.listServices(filters))];
};

/**
 * 交通 1 行を id で読む (無ければ null)
 */
export const readTransportService = async (
  id: string,
  catalog: CatalogManagementPort,
): Promise<TransportServiceRow | null> => {
  return unwrapOrThrow(await catalog.getTransportService(id)) ?? null;
};

/**
 * 場所系 1 行を id で読む (無ければ null)
 */
export const readPlaceService = async (
  id: string,
  catalog: CatalogManagementPort,
): Promise<PlaceServiceRow | null> => {
  return unwrapOrThrow(await catalog.getPlaceService(id)) ?? null;
};

/**
 * 交通が到着する都市 (カタログの目的地と同じ一覧)
 */
export const readSupportedCities = async (
  catalog: CatalogManagementPort,
): Promise<string[]> => {
  return [...unwrapOrThrow(await catalog.listDestinations())];
};
