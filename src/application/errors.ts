import type { CalendarError } from "@/domain/calendar";
import type { CatalogError } from "@/domain/catalog";
import type { CalendarEventId, MandateId, TripId } from "@/domain/identifiers";
import type { IdentityError } from "@/domain/identity";
import type { MandateError } from "@/domain/mandate";
import type { MoneyError } from "@/domain/money";
import type { PlanAssemblyError } from "@/domain/plan";
import type { PlannerError } from "@/domain/planner";
import type { ProfileError } from "@/domain/profile";
import type { StoreError } from "@/domain/store";
import type { TripStatus } from "@/domain/trip";

/**
 * use case 自身が検出する失敗 (状態の順序、見つからないもの、承認の前提)
 *
 * `ageCredentialMissing` は年齢確認証明書を発行しないまま年齢制限つきの計画を承認しようとしたとき
 * `birthDateMissing` はその証明書を発行しようとしたのにプロフィールに生年月日が無いとき
 * 証明の結果が「成人ではない」ことは失敗ではなく、trip に記録して組み直しを待つ
 * `replanNotNeeded` はその記録の無い提案済みの trip を組み直そうとしたとき
 * `notPaid` は支払い済み (paid / written) でない trip の受取を確認しようとしたとき
 */
export type FlowError =
  | { kind: "noMandate" }
  | { kind: "mandateExists"; mandateId: MandateId }
  | { kind: "eventNotFound"; eventId: CalendarEventId }
  | { kind: "eventAlreadyArranged"; eventId: CalendarEventId; tripId: TripId }
  | { kind: "tripNotFound"; tripId: TripId }
  | {
      kind: "wrongStatus";
      tripId: TripId;
      expected: TripStatus;
      actual: TripStatus;
    }
  | { kind: "privateSettlementUnsupported"; tripId: TripId }
  | { kind: "ageCredentialMissing"; tripId: TripId }
  | { kind: "birthDateMissing" }
  | { kind: "replanNotNeeded"; tripId: TripId }
  | { kind: "notPaid"; tripId: TripId };

/**
 * use case で起こりうる期待される失敗を、発生元のタグ付きで表す
 *
 * UI は `source` をメッセージの名前空間に、`kind` をメッセージのキーに対応づける
 * この `source` は失敗がどの port から来たかを指し、sources.ts の real / fake を選ぶ source とは別の意味
 */
export type SecretaryError =
  | { source: "calendar"; error: CalendarError }
  | { source: "catalog"; error: CatalogError }
  | { source: "planner"; error: PlannerError }
  | { source: "plan"; error: PlanAssemblyError }
  | { source: "mandate"; error: MandateError }
  | { source: "money"; error: MoneyError }
  | { source: "store"; error: StoreError }
  | { source: "flow"; error: FlowError }
  | { source: "identity"; error: IdentityError }
  | { source: "profile"; error: ProfileError };
