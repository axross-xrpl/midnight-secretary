import type { SecretaryStore } from "@/domain/store";
import { ok } from "@/lib/result";

/**
 * ユーザ id をキーにしたメモリ上の store
 *
 * プロセス開始時は空で、再起動すると何も残らない
 * あるリクエストで書いた trip が次のリクエストで見えるよう、プロセスごとに 1 回だけ作る
 */
export const createFakeStore = (): SecretaryStore => {
  return {
    getTrip: async () => ok(undefined),
    listTrips: async () => ok([]),
    putTrip: async () => ok(undefined),
    getMandateLink: async () => ok(undefined),
    putMandateLink: async () => ok(undefined),
  };
};
