import type { NextRequest } from "next/server";
import { handleApproveTrip } from "@/server/secretary/handlers";
import { secretaryRouteDeps } from "@/server/secretary/route-deps";

export const POST = async (
  request: NextRequest,
  context: RouteContext<"/api/secretary/trips/[tripId]/approve">,
): Promise<Response> => {
  const { tripId } = await context.params;

  return handleApproveTrip(request, tripId, secretaryRouteDeps);
};
