import { profileSaveSchema } from "@/features/profile/schemas";
import {
  databaseWriteErrorResponse,
  invalidRequestResponse,
  unauthorizedResponse,
} from "@/lib/api-response";
import { getApiSessionUser } from "@/lib/api-session";
import { profileWriteErrorResponse } from "@/server/profile/write-response";
import { saveProfile } from "@/server/profile/write-profile";

export async function PUT(request: Request) {
  const user = await getApiSessionUser();

  if (user === null) {
    return unauthorizedResponse();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequestResponse({ formErrors: ["A JSON body is required"] });
  }

  const parsedBody = profileSaveSchema.safeParse(body);
  if (!parsedBody.success) {
    return invalidRequestResponse(parsedBody.error.flatten());
  }

  try {
    const result = await saveProfile(user, parsedBody.data);
    return result.ok
      ? Response.json({ data: result.value })
      : profileWriteErrorResponse(result.error);
  } catch (error) {
    return databaseWriteErrorResponse(error);
  }
}
