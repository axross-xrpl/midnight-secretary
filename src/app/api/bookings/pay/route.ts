import { errorResponse, readJsonBody, RequestTooLargeError } from "@/lib/api";
import { findHotels } from "@/lib/catalog";
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

  // 決済前に、ホテルと金額をサーバー側で再確認する。
  const hotel = findHotels({ city: "大阪市" }).find(
    (candidate) => candidate.id === parsed.data.hotelId,
  );
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
      quotedAmountJpy: hotel.price_jpy * nights,
    },
    { status: 502 },
  );
}
