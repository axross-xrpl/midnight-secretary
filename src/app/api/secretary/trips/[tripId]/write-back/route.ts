import type { NextRequest } from "next/server";
import { handleWriteBackTrip } from "@/server/secretary/handlers";
import { secretaryRouteDeps } from "@/server/secretary/route-deps";

export const POST = async (
  request: NextRequest,
  context: RouteContext<"/api/secretary/trips/[tripId]/write-back">,
): Promise<Response> => {
  const { tripId } = await context.params;

  return handleWriteBackTrip(request, tripId, secretaryRouteDeps);
};
