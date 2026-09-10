import { errorResponse, readJsonBody, RequestTooLargeError } from "@/lib/api";
import { findHotels } from "@/lib/catalog";
import {
  GeminiConfigurationError,
  isRateLimitError,
  requestProposal,
} from "@/lib/gemini";
import { proposalRequestSchema } from "@/lib/schemas";
import type { ProposalResponse } from "@/lib/types";

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

  const parsed = proposalRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "入力内容を確認してください");
  }

  const candidates = findHotels(parsed.data.filters);
  if (candidates.length === 0) {
    const response: ProposalResponse = {
      picks: [],
      message:
        "条件に合うホテルがカタログ内にありませんでした。上限価格を広げてお試しください。",
      fallback: false,
      candidates: [],
    };
    return Response.json(response);
  }

  try {
    const generated = await requestProposal(parsed.data.request, candidates);
    const candidateIds = new Set(candidates.map((candidate) => candidate.id));
    const validPicks =
      generated?.picks.filter((pick) => candidateIds.has(pick.id)) ?? [];

    if (validPicks.length === 0) {
      const cheapest = candidates[0];
      const response: ProposalResponse = {
        picks: [
          {
            id: cheapest.id,
            reason:
              "条件に最も近い候補として、価格が最も低いものを表示しました。",
          },
        ],
        message:
          "AIの回答を候補データと照合できなかったため、カタログから候補を選びました。",
        fallback: true,
        candidates,
      };
      return Response.json(response);
    }

    const response: ProposalResponse = {
      picks: validPicks,
      message: generated?.message ?? "条件に合うホテルを選びました。",
      fallback: false,
      candidates,
    };
    return Response.json(response);
  } catch (error) {
    console.error("[proposals] Gemini request failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof GeminiConfigurationError) {
      return errorResponse(500, "サーバーのAI設定を確認してください");
    }

    if (isRateLimitError(error)) {
      return errorResponse(429, "しばらく待って再試行してください");
    }

    return errorResponse(502, "AIとの通信に失敗しました");
  }
}
