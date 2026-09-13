/**
 * 提案の対象になるサービスの種別
 *
 * DB の `place_services.kind` と同じ値
 */
export type ServiceKind = "hotel" | "restaurant" | "leisure";

/**
 * AI に渡す候補 1 件
 *
 * `place_services` の行をそのまま写したもので、種別で使わない項目は落とす
 * `id` は DB の `code`（安定キー）
 */
export interface ServiceCandidate {
  id: string;
  kind: ServiceKind;
  name: string;
  itemName?: string;
  city: string;
  address: string;
  nearestStation: string;
  stationAccessMin: number;
  priceJpy: number;
  genre?: string;
  rating?: number;
  openFrom?: string;
  openTo?: string;
  checkinFrom?: string;
  checkoutBy?: string;
  breakfastIncluded?: boolean;
  hasAlcohol?: boolean;
  seats?: string;
  /** 利用に本人確認が要る場合の種類。空なら不要 */
  requiredVerifications: string[];
  ageLimit?: number;
}

export interface ProposalPick {
  id: string;
  reason: string;
}

/**
 * 種別ごとの提案
 *
 * `candidates` は AI に渡した候補そのもので、`picks` はその中から選ばれたもの
 */
export interface ProposalGroup {
  kind: ServiceKind;
  picks: ProposalPick[];
  candidates: ServiceCandidate[];
}

export interface ProposalResponse {
  message: string;
  fallback: boolean;
  groups: ProposalGroup[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// クライアントからはホテルと宿泊日だけ受け取り、料金はサーバーで解決する。
export interface HotelBookingRequest {
  hotelId: string;
  checkIn: string;
  checkOut: string;
}

// サーバーが作成し、後続の決済処理で利用する見積情報。
export interface HotelBookingQuote {
  hotelId: string;
  hotelName: string;
  checkIn: string;
  checkOut: string;
  totalPriceJpy: number;
  currency: "JPY";
  status: "quoted";
}
