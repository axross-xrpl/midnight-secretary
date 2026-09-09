import type { NewTripId } from "@/application/deps";
import type { EnvLike } from "@/application/sources";
import type { SecretaryFactories } from "@/application/wiring";
import type { CalendarEventId, IsoDateTime } from "@/domain/identifiers";
import type { FakeMandateIds } from "./mandate/fake";
import { createFakeCalendar, seedCalendarEvents } from "./calendar/fake";
import { createFakeCatalog, seedCatalog } from "./catalog/fake";
import { createFakeMandate } from "./mandate/fake";
import { createFakePlanner } from "./planner/fake";
import { createFakeStore } from "./store/fake";

/**
 * adapter に渡すプロセス全体の入力で、環境変数と開始時刻と id の生成関数
 *
 * id は非決定的なので注入する
 * 各レーンは自分の adapter が入るときに自分のフィールドを追加する
 */
export type ProcessResources = {
  env: EnvLike;
  startedAt: IsoDateTime;
  newTripId: NewTripId;
  newEventId: () => CalendarEventId;
  mandateIds: FakeMandateIds;
};

/**
 * composition root で、プロセスごとに 1 回呼ぶ
 *
 * Fake はここで 1 回だけ作り、メモリ上の状態を全リクエストで共有する
 * real の factory は最初は fake と同じで、各レーンが自分の持つ adapter で自分の `real` を差し替える
 */
export const createSecretaryFactories = (
  resources: ProcessResources,
): SecretaryFactories => {
  const fakeCalendar = createFakeCalendar({
    events: seedCalendarEvents(resources.startedAt),
    newEventId: resources.newEventId,
  });
  const fakeCatalog = createFakeCatalog(seedCatalog());
  const fakePlanner = createFakePlanner();
  const fakeMandate = createFakeMandate({
    mandates: [],
    ids: resources.mandateIds,
  });
  const fakeStore = createFakeStore();

  return {
    calendar: { real: () => fakeCalendar, fake: () => fakeCalendar },
    catalog: { real: () => fakeCatalog, fake: () => fakeCatalog },
    planner: { real: () => fakePlanner, fake: () => fakePlanner },
    mandate: { real: () => fakeMandate, fake: () => fakeMandate },
    store: { real: () => fakeStore, fake: () => fakeStore },
    newTripId: resources.newTripId,
  };
};
