import "server-only";

import type {
  CatalogManagementPort,
  PlaceServiceRow,
  ServiceWriteError,
  TransportServiceRow,
} from "@/domain/catalog";
import type {
  PlaceServiceCreateInput,
  PlaceServiceUpdateInput,
  TransportServiceCreateInput,
  TransportServiceUpdateInput,
} from "@/features/services/schemas";
import type { Result } from "@/lib/result";

export type { ServiceWriteError } from "@/domain/catalog";

export const createTransportService = async (
  input: TransportServiceCreateInput,
  catalog: CatalogManagementPort,
): Promise<Result<TransportServiceRow, ServiceWriteError>> => {
  return catalog.createTransportService(input);
};

export const updateTransportService = async (
  id: string,
  input: TransportServiceUpdateInput,
  catalog: CatalogManagementPort,
): Promise<Result<TransportServiceRow, ServiceWriteError>> => {
  return catalog.updateTransportService(id, input);
};

export const disableTransportService = async (
  id: string,
  updatedAt: string,
  catalog: CatalogManagementPort,
): Promise<Result<TransportServiceRow, ServiceWriteError>> => {
  return catalog.disableTransportService(id, updatedAt);
};

export const createPlaceService = async (
  input: PlaceServiceCreateInput,
  catalog: CatalogManagementPort,
): Promise<Result<PlaceServiceRow, ServiceWriteError>> => {
  return catalog.createPlaceService(input);
};

export const updatePlaceService = async (
  id: string,
  input: PlaceServiceUpdateInput,
  catalog: CatalogManagementPort,
): Promise<Result<PlaceServiceRow, ServiceWriteError>> => {
  return catalog.updatePlaceService(id, input);
};

export const disablePlaceService = async (
  id: string,
  updatedAt: string,
  catalog: CatalogManagementPort,
): Promise<Result<PlaceServiceRow, ServiceWriteError>> => {
  return catalog.disablePlaceService(id, updatedAt);
};
