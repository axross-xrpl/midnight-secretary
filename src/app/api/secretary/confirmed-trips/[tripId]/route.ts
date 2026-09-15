import type { NextRequest } from "next/server";
import { handleDeleteConfirmedTrip } from "@/server/secretary/handlers";
import { secretaryRouteDeps } from "@/server/secretary/route-deps";

export const DELETE = async (
  request: NextRequest,
  context: RouteContext<"/api/secretary/confirmed-trips/[tripId]">,
): Promise<Response> => {
  const { tripId } = await context.params;

  return handleDeleteConfirmedTrip(request, tripId, secretaryRouteDeps);
};
