import {
  databaseWriteErrorResponse,
  invalidRequestResponse,
  unauthorizedResponse,
} from "@/lib/api-response";
import { hasApiSession } from "@/lib/api-session";
import { settingsDeps } from "@/server/ports";
import { transportServiceCreateSchema } from "@/features/services/schemas";
import { createTransportService } from "@/server/services/write-services";
import { serviceWriteErrorResponse } from "@/server/services/write-response";

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

  const parsedBody = transportServiceCreateSchema.safeParse(body);
  if (!parsedBody.success) {
    return invalidRequestResponse(parsedBody.error.flatten());
  }

  try {
    const result = await createTransportService(
      parsedBody.data,
      settingsDeps().catalog,
    );
    return result.ok
      ? Response.json({ data: result.value }, { status: 201 })
      : serviceWriteErrorResponse(result.error);
  } catch (error) {
    return databaseWriteErrorResponse(error);
  }
}
