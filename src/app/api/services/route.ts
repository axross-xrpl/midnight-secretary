import { z } from "zod";
import {
  databaseReadErrorResponse,
  invalidRequestResponse,
  unauthorizedResponse,
} from "@/lib/api-response";
import { hasApiSession } from "@/lib/api-session";
import {
  readServices,
  serviceCategories,
} from "@/server/services/read-services";

const optionalTrimmedText = (maximumLength: number) =>
  z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.string().trim().min(1).max(maximumLength).optional(),
  );

const querySchema = z.object({
  category: z.enum(serviceCategories).optional(),
  city: optionalTrimmedText(80),
  q: optionalTrimmedText(80),
  active: z
    .enum(["true", "false", "all"])
    .transform((value) =>
      value === "all" ? ("all" as const) : value === "true",
    )
    .optional(),
});

export async function GET(request: Request) {
  if (!(await hasApiSession())) {
    return unauthorizedResponse();
  }

  const searchParams = new URL(request.url).searchParams;
  const parsedQuery = querySchema.safeParse({
    category: searchParams.get("category") ?? undefined,
    city: searchParams.get("city") ?? undefined,
    q: searchParams.get("q") ?? undefined,
    active: searchParams.get("active") ?? undefined,
  });

  if (!parsedQuery.success) {
    return invalidRequestResponse(parsedQuery.error.flatten());
  }

  try {
    const services = await readServices({
      category: parsedQuery.data.category,
      city: parsedQuery.data.city,
      query: parsedQuery.data.q,
      active: parsedQuery.data.active,
    });

    return Response.json({ data: services });
  } catch (error) {
    return databaseReadErrorResponse(error);
  }
}
