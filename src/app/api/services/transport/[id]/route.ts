import { z } from "zod";
import {
  serviceDisableSchema,
  transportServiceUpdateSchema,
} from "@/features/services/schemas";
import {
  databaseReadErrorResponse,
  databaseWriteErrorResponse,
  invalidRequestResponse,
  notFoundResponse,
  unauthorizedResponse,
} from "@/lib/api-response";
import { hasApiSession } from "@/lib/api-session";
import { readTransportService } from "@/server/services/read-services";
import {
  disableTransportService,
  updateTransportService,
} from "@/server/services/write-services";
import { serviceWriteErrorResponse } from "@/server/services/write-response";

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

  try {
    const service = await readTransportService(parsedId.data);
    return service ? Response.json({ data: service }) : notFoundResponse();
  } catch (error) {
    return databaseReadErrorResponse(error);
  }
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

  try {
    const result = await updateTransportService(parsedId.data, parsedBody.data);
    return result.ok
      ? Response.json({ data: result.value })
      : serviceWriteErrorResponse(result.error);
  } catch (error) {
    return databaseWriteErrorResponse(error);
  }
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

  try {
    const result = await disableTransportService(
      parsedId.data,
      parsedBody.data.updatedAt,
    );
    return result.ok
      ? Response.json({ data: result.value })
      : serviceWriteErrorResponse(result.error);
  } catch (error) {
    return databaseWriteErrorResponse(error);
  }
}
