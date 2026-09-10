export type HotelType =
  | "hotel"
  | "business_hotel"
  | "ryokan"
  | "hostel"
  | "capsule_hotel";

export type MealCondition = "none" | "breakfast" | "half_board" | "full_board";

export interface Hotel {
  id: string;
  name: string;
  name_kana?: string;
  hotel_type: HotelType;
  description: string;
  official_url?: string;
  image_url?: string;
  source_url: string;
  verified_at: string;
  postal_code: string;
  prefecture: "大阪府";
  city: "大阪市";
  ward: string;
  address_line: string;
  latitude?: number;
  longitude?: number;
  nearest_station: string;
  station_lines?: string[];
  walk_minutes: number;
  access_note?: string;
  price_jpy: number;
  price_unit: "per_room_per_night";
  occupancy: number;
  tax_included: boolean;
  service_fee_included: boolean;
  meal_condition: MealCondition;
  price_note?: string;
  price_checked_at: string;
  rating: number;
  rating_scale: number;
  review_count: number;
  review_source: string;
  review_source_url: string;
  rating_checked_at: string;
  reputation_summary?: string;
  services: string[];
  amenities: string[];
  features: string[];
  supported_languages?: string[];
  check_in_from: string;
  check_in_until?: string;
  check_out_until: string;
}

export interface Catalog {
  schema_version: "1.0";
  updated_at: string;
  currency: "JPY";
  hotels: Hotel[];
}

export interface HotelCandidate extends Hotel {
  address: string;
}

export interface ProposalPick {
  id: string;
  reason: string;
}

export interface ProposalResponse {
  picks: ProposalPick[];
  message: string;
  fallback: boolean;
  candidates: HotelCandidate[];
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
