import type { NextRequest } from "next/server";
import { handleConfirmReceipt } from "@/server/secretary/handlers";
import { secretaryRouteDeps } from "@/server/secretary/route-deps";

export const POST = async (
  request: NextRequest,
  context: RouteContext<"/api/secretary/trips/[tripId]/payments/[paymentRef]/confirm">,
): Promise<Response> => {
  const { tripId, paymentRef } = await context.params;

  return handleConfirmReceipt(request, tripId, paymentRef, secretaryRouteDeps);
};
