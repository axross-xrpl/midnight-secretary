import { errorResponse, readJsonBody, RequestTooLargeError } from "@/lib/api";
import { findHotelById } from "@/lib/catalog";
import { hotelBookingRequestSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;

  // 決済アダプターを呼び出す前に、決済リクエストを検証する。
  try {
    body = await readJsonBody(request);
  } catch (error) {
    if (error instanceof RequestTooLargeError) {
      return errorResponse(413, "入力が長すぎます");
    }
    return errorResponse(400, "決済条件を確認してください");
  }

  const parsed = hotelBookingRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "ホテル・宿泊日を確認してください");
  }

  // 決済前に、ホテルと金額をサーバー側の DB で再確認する。
  let hotel: Awaited<ReturnType<typeof findHotelById>>;

  try {
    hotel = await findHotelById(parsed.data.hotelId);
  } catch (error) {
    console.error("[bookings/pay] database read failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(503, "サービス情報を読み込めませんでした");
  }

  if (!hotel) {
    return errorResponse(404, "決済対象のホテルが見つかりませんでした");
  }

  const nights = Math.round(
    (Date.parse(`${parsed.data.checkOut}T00:00:00Z`) -
      Date.parse(`${parsed.data.checkIn}T00:00:00Z`)) /
      (24 * 60 * 60 * 1000),
  );

  // 後でこのレスポンスをMidnightのMandate・エスクローアダプターに置き換える。
  return Response.json(
    {
      status: "payment_failed",
      code: "MIDNIGHT_NOT_CONNECTED",
      message: "Midnight決済アダプターが未接続です",
      request: parsed.data,
      quotedAmountJpy: hotel.priceJpy * nights,
    },
    { status: 502 },
  );
}
