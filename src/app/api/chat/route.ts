import { errorResponse, readJsonBody, RequestTooLargeError } from "@/lib/api";
import { selectCandidatesById } from "@/lib/catalog";
import {
  GeminiConfigurationError,
  isRateLimitError,
  requestChat,
} from "@/lib/gemini";
import { chatRequestSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;

  try {
    body = await readJsonBody(request);
  } catch (error) {
    if (error instanceof RequestTooLargeError) {
      return errorResponse(413, "入力が長すぎます");
    }
    return errorResponse(400, "入力内容を確認してください");
  }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "入力内容を確認してください");
  }

  const candidates = selectCandidatesById(
    parsed.data.filters,
    parsed.data.candidateIds,
  );
  if (candidates.length === 0) {
    return errorResponse(400, "回答対象のホテルを確認できませんでした");
  }

  try {
    const message = await requestChat(candidates, parsed.data.messages);
    if (!message) {
      return errorResponse(502, "AIの応答を処理できませんでした");
    }
    return Response.json({ message });
  } catch (error) {
    if (error instanceof GeminiConfigurationError) {
      return errorResponse(500, "サーバーのAI設定を確認してください");
    }
    if (isRateLimitError(error)) {
      return errorResponse(429, "しばらく待って再試行してください");
    }
    return errorResponse(502, "AIとの通信に失敗しました");
  }
}
