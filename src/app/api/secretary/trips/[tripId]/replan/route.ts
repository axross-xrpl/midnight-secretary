import type { NextRequest } from "next/server";
import { handleReplanTrip } from "@/server/secretary/handlers";
import { secretaryRouteDeps } from "@/server/secretary/route-deps";

export const POST = async (
  request: NextRequest,
  context: RouteContext<"/api/secretary/trips/[tripId]/replan">,
): Promise<Response> => {
  const { tripId } = await context.params;

  return handleReplanTrip(request, tripId, secretaryRouteDeps);
};
