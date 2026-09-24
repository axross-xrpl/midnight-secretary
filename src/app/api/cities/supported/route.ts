import {
  databaseReadErrorResponse,
  unauthorizedResponse,
} from "@/lib/api-response";
import { hasApiSession } from "@/lib/api-session";
import { settingsDeps } from "@/server/ports";
import { readSupportedCities } from "@/server/services/read-services";

export async function GET() {
  if (!(await hasApiSession())) {
    return unauthorizedResponse();
  }

  try {
    return Response.json({
      data: await readSupportedCities(settingsDeps().catalog),
    });
  } catch (error) {
    return databaseReadErrorResponse(error);
  }
}
