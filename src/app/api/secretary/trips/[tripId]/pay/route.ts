import type { NextRequest } from "next/server";
import { handlePayForTrip } from "@/server/secretary/handlers";
import { secretaryRouteDeps } from "@/server/secretary/route-deps";

export const POST = async (
  request: NextRequest,
  context: RouteContext<"/api/secretary/trips/[tripId]/pay">,
): Promise<Response> => {
  const { tripId } = await context.params;

  return handlePayForTrip(request, tripId, secretaryRouteDeps);
};
