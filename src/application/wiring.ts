import type { CalendarPort } from "@/domain/calendar";
import type { FareCatalogPort } from "@/domain/catalog";
import type { IsoDateTime } from "@/domain/identifiers";
import type { MandatePort } from "@/domain/mandate";
import type { PlannerPort } from "@/domain/planner";
import type { SecretaryStore } from "@/domain/store";
import type { NewTripId, SecretaryDeps } from "./deps";
import type { PortSource, PortSources } from "./sources";

/**
 * adapter が必要とするかもしれないリクエストごとの事実
 *
 * Google のトークンは、Google サインインでトークンを解決できたときにだけ存在する
 */
export type RequestContext = {
  now: IsoDateTime;
  googleAccessToken?: string;
};

/**
 * リクエスト 1 つに対して port を 1 つ組み立てる
 *
 * プロセス全体で共有する資源 (DB のハンドル、Fake の状態、Midnight の provider) はファクトリを作る時点でクロージャに閉じ込める
 */
export type PortFactory<P> = (context: RequestContext) => P;

/**
 * port 1 つを組み立てる 2 通りの方法
 *
 * 自分の port の `real` 側と `fake` 側は、そのレーンが持つ
 */
export type PortFactories<P> = {
  real: PortFactory<P>;
  fake: PortFactory<P>;
};

/**
 * composition root が知っているファクトリすべて
 *
 * プロセスごとに 1 回だけ組み立てる
 */
export type SecretaryFactories = {
  calendar: PortFactories<CalendarPort>;
  catalog: PortFactories<FareCatalogPort>;
  planner: PortFactories<PlannerPort>;
  mandate: PortFactories<MandatePort>;
  store: PortFactories<SecretaryStore>;
  newTripId: NewTripId;
};

/**
 * `source` が指すファクトリを選んで実行する
 */
export const selectPort = <P>(
  source: PortSource,
  factories: PortFactories<P>,
  context: RequestContext,
): P => {
  return factories[source](context);
};

/**
 * 解決済みの source とファクトリから、use case が受け取る deps を組み立てる
 *
 * `PortSources` を読むのはここだけで、use case はどれが Fake かを知らない
 */
export const buildSecretaryDeps = (
  _sources: PortSources,
  factories: SecretaryFactories,
  context: RequestContext,
): SecretaryDeps => {
  return {
    calendar: factories.calendar.fake(context),
    catalog: factories.catalog.fake(context),
    planner: factories.planner.fake(context),
    mandate: factories.mandate.fake(context),
    store: factories.store.fake(context),
    newTripId: factories.newTripId,
  };
};
