import {
  databaseReadErrorResponse,
  unauthorizedResponse,
} from "@/lib/api-response";
import { hasApiSession } from "@/lib/api-session";
import { readSupportedCities } from "@/server/services/read-services";

export async function GET() {
  if (!(await hasApiSession())) {
    return unauthorizedResponse();
  }

  try {
    return Response.json({ data: await readSupportedCities() });
  } catch (error) {
    return databaseReadErrorResponse(error);
  }
}
