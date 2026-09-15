import type { CalendarPort } from "@/domain/calendar";
import type { FareCatalogPort } from "@/domain/catalog";
import type { TripId } from "@/domain/identifiers";
import type { IdentityPort } from "@/domain/identity";
import type { MandatePort } from "@/domain/mandate";
import type { PlannerPort } from "@/domain/planner";
import type { ProfilePort } from "@/domain/profile";
import type { SecretaryStore } from "@/domain/store";

/**
 * 新しい trip id を生成する
 *
 * id の生成は決定的でないので、引数で注入する
 */
export type NewTripId = () => TripId;

/**
 * use case が外の世界から必要とするものすべて
 *
 * real の adapter も Fake もこの型を満たす
 * リクエストごとに組み立てる
 */
export type SecretaryDeps = {
  calendar: CalendarPort;
  catalog: FareCatalogPort;
  planner: PlannerPort;
  mandate: MandatePort;
  store: SecretaryStore;
  identity: IdentityPort;
  profile: ProfilePort;
  newTripId: NewTripId;
};
