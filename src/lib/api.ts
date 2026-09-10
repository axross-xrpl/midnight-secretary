const MAX_BODY_BYTES = 32_000;

export class RequestTooLargeError extends Error {}

export async function readJsonBody(request: Request): Promise<unknown> {
  const declaredSize = Number(request.headers.get("content-length") || 0);
  if (declaredSize > MAX_BODY_BYTES) {
    throw new RequestTooLargeError();
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new RequestTooLargeError();
  }

  return JSON.parse(text);
}

export function errorResponse(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}
