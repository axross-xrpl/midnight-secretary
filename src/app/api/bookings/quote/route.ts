import { findHotels } from "@/lib/catalog";
import { errorResponse, readJsonBody, RequestTooLargeError } from "@/lib/api";
import { hotelBookingRequestSchema } from "@/lib/schemas";
import type { HotelBookingQuote } from "@/lib/types";

export const dynamic = "force-dynamic";

// 検証済みの宿泊期間から、請求対象の宿泊数を計算する。
function nightsBetween(checkIn: string, checkOut: string): number {
  const start = Date.parse(`${checkIn}T00:00:00Z`);
  const end = Date.parse(`${checkOut}T00:00:00Z`);
  return Math.round((end - start) / (24 * 60 * 60 * 1000));
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;

  // フィールドを検証する前に、リクエストのサイズとJSON形式を確認する。
  try {
    body = await readJsonBody(request);
  } catch (error) {
    if (error instanceof RequestTooLargeError) {
      return errorResponse(413, "入力が長すぎます");
    }
    return errorResponse(400, "予約条件を確認してください");
  }

  const parsed = hotelBookingRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "ホテル・宿泊日を確認してください");
  }

  // ホテルと料金は必ずサーバー側のカタログから解決する。
  const hotel = findHotels({ city: "大阪市" }).find(
    (candidate) => candidate.id === parsed.data.hotelId,
  );
  if (!hotel) {
    return errorResponse(404, "予約可能なホテルが見つかりませんでした");
  }

  // クライアントから受け取った料金を信頼せず、ここで見積額を計算する。
  const nights = nightsBetween(parsed.data.checkIn, parsed.data.checkOut);
  const quote: HotelBookingQuote = {
    hotelId: hotel.id,
    hotelName: hotel.name,
    checkIn: parsed.data.checkIn,
    checkOut: parsed.data.checkOut,
    totalPriceJpy: hotel.price_jpy * nights,
    currency: "JPY",
    status: "quoted",
  };

  return Response.json({ quote, nightlyPriceJpy: hotel.price_jpy, nights });
}
