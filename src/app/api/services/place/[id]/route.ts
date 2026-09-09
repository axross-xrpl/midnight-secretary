import { z } from "zod";
import {
  placeServiceUpdateSchema,
  serviceDisableSchema,
} from "@/features/services/schemas";
import {
  databaseReadErrorResponse,
  databaseWriteErrorResponse,
  invalidRequestResponse,
  notFoundResponse,
  unauthorizedResponse,
} from "@/lib/api-response";
import { hasApiSession } from "@/lib/api-session";
import { readPlaceService } from "@/server/services/read-services";
import {
  disablePlaceService,
  updatePlaceService,
} from "@/server/services/write-services";
import { serviceWriteErrorResponse } from "@/server/services/write-response";

const idSchema = z.uuid();

export async function GET(
  _request: Request,
  context: RouteContext<"/api/services/place/[id]">,
) {
  if (!(await hasApiSession())) {
    return unauthorizedResponse();
  }

  const parsedId = idSchema.safeParse((await context.params).id);

  if (!parsedId.success) {
    return invalidRequestResponse(parsedId.error.flatten());
  }

  try {
    const service = await readPlaceService(parsedId.data);
    return service ? Response.json({ data: service }) : notFoundResponse();
  } catch (error) {
    return databaseReadErrorResponse(error);
  }
}

export async function PUT(
  request: Request,
  context: RouteContext<"/api/services/place/[id]">,
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

  const parsedBody = placeServiceUpdateSchema.safeParse(body);
  if (!parsedBody.success) {
    return invalidRequestResponse(parsedBody.error.flatten());
  }

  try {
    const result = await updatePlaceService(parsedId.data, parsedBody.data);
    return result.ok
      ? Response.json({ data: result.value })
      : serviceWriteErrorResponse(result.error);
  } catch (error) {
    return databaseWriteErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/services/place/[id]">,
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
    const result = await disablePlaceService(
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
