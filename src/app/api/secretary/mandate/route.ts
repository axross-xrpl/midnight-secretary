import type { NextRequest } from "next/server";
import { handleSetUpMandate } from "@/server/secretary/handlers";
import { secretaryRouteDeps } from "@/server/secretary/route-deps";

export const POST = async (request: NextRequest): Promise<Response> => {
  return handleSetUpMandate(request, secretaryRouteDeps);
};
