import {
  databaseReadErrorResponse,
  unauthorizedResponse,
} from "@/lib/api-response";
import { hasApiSession } from "@/lib/api-session";
import { settingsDeps } from "@/server/settings/deps";

export async function GET() {
  if (!(await hasApiSession())) {
    return unauthorizedResponse();
  }

  const cities = await settingsDeps().catalog.listSupportedCities();

  if (!cities.ok) {
    return databaseReadErrorResponse(cities.error.cause);
  }

  return Response.json({ data: cities.value });
}
