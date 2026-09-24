import { z } from "zod";
import {
  serviceDisableSchema,
  transportServiceUpdateSchema,
} from "@/features/services/schemas";
import {
  databaseReadErrorResponse,
  invalidRequestResponse,
  notFoundResponse,
  unauthorizedResponse,
} from "@/lib/api-response";
import { hasApiSession } from "@/lib/api-session";
import { serviceWriteErrorResponse } from "@/server/services/write-response";
import { settingsDeps } from "@/server/settings/deps";

const idSchema = z.uuid();

export async function GET(
  _request: Request,
  context: RouteContext<"/api/services/transport/[id]">,
) {
  if (!(await hasApiSession())) {
    return unauthorizedResponse();
  }

  const parsedId = idSchema.safeParse((await context.params).id);

  if (!parsedId.success) {
    return invalidRequestResponse(parsedId.error.flatten());
  }

  const service = await settingsDeps().catalog.getTransportService(
    parsedId.data,
  );

  if (!service.ok) {
    return databaseReadErrorResponse(service.error.cause);
  }

  return service.value === undefined
    ? notFoundResponse()
    : Response.json({ data: service.value });
}

export async function PUT(
  request: Request,
  context: RouteContext<"/api/services/transport/[id]">,
) {
  if (!(await hasApiSession())) {
    return unauthorizedResponse();
  }

  const parsedId = idSchema.safeParse((await context.params).id);
  if (!parsedId.success) {
    return invalidRequestResponse(parsedId.error.flatten());
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequestResponse({ formErrors: ["A JSON body is required"] });
  }

  const parsedBody = transportServiceUpdateSchema.safeParse(body);
  if (!parsedBody.success) {
    return invalidRequestResponse(parsedBody.error.flatten());
  }

  const result = await settingsDeps().catalog.updateTransportService(
    parsedId.data,
    parsedBody.data,
  );
  return result.ok
    ? Response.json({ data: result.value })
    : serviceWriteErrorResponse(result.error);
}

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/services/transport/[id]">,
) {
  if (!(await hasApiSession())) {
    return unauthorizedResponse();
  }

  const parsedId = idSchema.safeParse((await context.params).id);
  if (!parsedId.success) {
    return invalidRequestResponse(parsedId.error.flatten());
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequestResponse({ formErrors: ["A JSON body is required"] });
  }

  const parsedBody = serviceDisableSchema.safeParse(body);
  if (!parsedBody.success) {
    return invalidRequestResponse(parsedBody.error.flatten());
  }

  const result = await settingsDeps().catalog.disableTransportService(
    parsedId.data,
    parsedBody.data.updatedAt,
  );
  return result.ok
    ? Response.json({ data: result.value })
    : serviceWriteErrorResponse(result.error);
}
