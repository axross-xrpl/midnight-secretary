import {
  invalidRequestResponse,
  unauthorizedResponse,
} from "@/lib/api-response";
import { hasApiSession } from "@/lib/api-session";
import { placeServiceCreateSchema } from "@/features/services/schemas";
import { serviceWriteErrorResponse } from "@/server/services/write-response";
import { settingsDeps } from "@/server/settings/deps";

export async function POST(request: Request) {
  if (!(await hasApiSession())) {
    return unauthorizedResponse();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequestResponse({ formErrors: ["A JSON body is required"] });
  }

  const parsedBody = placeServiceCreateSchema.safeParse(body);
  if (!parsedBody.success) {
    return invalidRequestResponse(parsedBody.error.flatten());
  }

  const result = await settingsDeps().catalog.createPlaceService(
    parsedBody.data,
  );
  return result.ok
    ? Response.json({ data: result.value }, { status: 201 })
    : serviceWriteErrorResponse(result.error);
}
