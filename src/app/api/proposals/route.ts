import { errorResponse, readJsonBody, RequestTooLargeError } from "@/lib/api";
import { findCandidatesByKind } from "@/lib/catalog";
import {
  GeminiConfigurationError,
  isRateLimitError,
  requestProposal,
} from "@/lib/gemini";
import type { GeminiProposal } from "@/lib/schemas";
import { proposalRequestSchema, serviceKinds } from "@/lib/schemas";
import type {
  ProposalGroup,
  ProposalResponse,
  ServiceCandidate,
  ServiceKind,
} from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * AI が返した id を候補の集合と突き合わせる
 *
 * 候補に無い id は捨てる。実在しない施設が提案に混ざらないための最後の関門
 */
function groupFor(
  kind: ServiceKind,
  candidates: ServiceCandidate[],
  generated: GeminiProposal | null,
): ProposalGroup {
  const known = new Set(candidates.map((candidate) => candidate.id));
  const picks = (generated?.[kind] ?? []).filter((pick) => known.has(pick.id));

  return { kind, picks, candidates };
}

/**
 * AI の選択を使えなかったときに、種別ごとに 1 件だけ出す
 *
 * 候補は価格の安い順なので先頭を採る
 */
function fallbackGroups(
  candidatesByKind: Record<ServiceKind, ServiceCandidate[]>,
): ProposalGroup[] {
  return serviceKinds.map((kind) => {
    const candidates = candidatesByKind[kind];
    const cheapest = candidates[0];

    return {
      kind,
      picks:
        cheapest === undefined
          ? []
          : [
              {
                id: cheapest.id,
                reason:
                  "条件に最も近い候補として、価格が最も低いものを表示しました。",
              },
            ],
      candidates,
    };
  });
}

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

  let candidatesByKind: Record<ServiceKind, ServiceCandidate[]>;

  try {
    candidatesByKind = await findCandidatesByKind(parsed.data.filters);
  } catch (error) {
    console.error("[proposals] database read failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(503, "サービス情報を読み込めませんでした");
  }

  const total = serviceKinds.reduce(
    (sum, kind) => sum + candidatesByKind[kind].length,
    0,
  );

  if (total === 0) {
    const response: ProposalResponse = {
      message:
        "条件に合うサービスが見つかりませんでした。上限価格を広げてお試しください。",
      fallback: false,
      groups: serviceKinds.map((kind) => ({ kind, picks: [], candidates: [] })),
    };
    return Response.json(response);
  }

  try {
    const generated = await requestProposal(
      parsed.data.request,
      candidatesByKind,
    );
    const groups = serviceKinds.map((kind) =>
      groupFor(kind, candidatesByKind[kind], generated),
    );
    const picked = groups.reduce((sum, group) => sum + group.picks.length, 0);

    if (picked === 0) {
      const response: ProposalResponse = {
        message:
          "AIの回答を候補データと照合できなかったため、DBから候補を選びました。",
        fallback: true,
        groups: fallbackGroups(candidatesByKind),
      };
      return Response.json(response);
    }

    const response: ProposalResponse = {
      message: generated?.message ?? "条件に合うサービスを選びました。",
      fallback: false,
      groups,
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
