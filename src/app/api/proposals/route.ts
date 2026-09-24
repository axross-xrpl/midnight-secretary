import type {
  ExclusionCounts,
  PlanningProfile,
} from "@/features/profile/feasibility";
import {
  excludedKinds,
  filterFeasible,
  jstToday,
  orderByPreference,
} from "@/features/profile/feasibility";
import type { VerificationKind } from "@/features/services/constants";
import { errorResponse, readJsonBody, RequestTooLargeError } from "@/lib/api";
import { getApiSessionUser } from "@/lib/api-session";
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
import { settingsDeps } from "@/server/ports";
import { readPlanningProfile } from "@/server/profile/read-profile";

export const dynamic = "force-dynamic";

const VERIFICATION_LABELS: Record<VerificationKind, string> = {
  age: "年齢確認",
  nationality: "国籍確認",
  residence: "居住地確認",
};

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
 * 好みの並べ替えが入るため先頭が最安とは限らない。価格で選び直す
 */
function fallbackGroups(
  candidatesByKind: Record<ServiceKind, ServiceCandidate[]>,
): ProposalGroup[] {
  return serviceKinds.map((kind) => {
    const candidates = candidatesByKind[kind];
    const cheapest = candidates.reduce<ServiceCandidate | undefined>(
      (lowest, candidate) =>
        lowest === undefined || candidate.priceJpy < lowest.priceJpy
          ? candidate
          : lowest,
      undefined,
    );

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

const countCandidates = (
  candidatesByKind: Record<ServiceKind, ServiceCandidate[]>,
): number => {
  return serviceKinds.reduce(
    (sum, kind) => sum + candidatesByKind[kind].length,
    0,
  );
};

/**
 * 本人確認による候補の除外を行うか
 *
 * 現バージョンは**本人確認を満たせるかの判断も AI に委ねる**方針のため無効にしている。
 * 利用者の属性はプロンプトに渡し (`buildProposalPrompt`)、選ぶかどうかは AI が決める。
 *
 * 判定そのもの (`filterFeasible`) と、除外を利用者に知らせる経路 (`notice`) は
 * そのまま残してあるので、方針が変わればここを `true` に戻すだけで効く
 */
const FILTER_BY_VERIFICATION: boolean = false;

/**
 * プロフィールを候補に効かせる
 *
 * 1. 満たせない本人確認を要求する候補を落とす (`db-design.md` §10 の `filter_feasible`)
 *    — 現在は `FILTER_BY_VERIFICATION` で無効
 * 2. 好みのジャンルに合う候補を前に出す (絞り込まない。0件にしないため)
 */
function applyProfile(
  candidatesByKind: Record<ServiceKind, ServiceCandidate[]>,
  profile: PlanningProfile | null,
  today: string,
): {
  candidatesByKind: Record<ServiceKind, ServiceCandidate[]>;
  excluded: ExclusionCounts;
} {
  const excluded: ExclusionCounts = {};
  const preferredFor = (kind: ServiceKind): string[] => {
    if (profile === null) {
      return [];
    }

    if (kind === "restaurant") {
      return profile.diningGenres;
    }

    return kind === "leisure" ? profile.leisureGenres : [];
  };

  const applied = serviceKinds.map((kind) => {
    const feasible = FILTER_BY_VERIFICATION
      ? filterFeasible(candidatesByKind[kind], profile, today)
      : { candidates: candidatesByKind[kind], excluded: {} as ExclusionCounts };

    for (const [reason, count] of Object.entries(feasible.excluded)) {
      const verification = reason as VerificationKind;
      excluded[verification] = (excluded[verification] ?? 0) + count;
    }

    return [
      kind,
      orderByPreference(feasible.candidates, preferredFor(kind)),
    ] as const;
  });

  return {
    candidatesByKind: Object.fromEntries(applied) as Record<
      ServiceKind,
      ServiceCandidate[]
    >,
    excluded,
  };
}

/**
 * 候補が減った理由を利用者に伝える文
 *
 * 黙って減らすと「なぜこの候補が出ないのか」が分からなくなるため、必ず添える
 */
function exclusionNotice(
  excluded: ExclusionCounts,
  hasProfile: boolean,
): string | undefined {
  const kinds = excludedKinds(excluded);

  if (kinds.length === 0) {
    return undefined;
  }

  const detail = kinds
    .map((kind) => `${VERIFICATION_LABELS[kind]} ${excluded[kind]}件`)
    .join("、");

  return hasProfile
    ? `本人確認を満たせないため、${detail}を候補から除外しました。設定のプロフィールをご確認ください。`
    : `プロフィールが未登録のため、本人確認が必要な候補（${detail}）を除外しました。設定のプロフィールで登録できます。`;
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

  // サインインしていないときはプロフィールが無い状態として扱う
  const user = await getApiSessionUser();

  let candidatesByKind: Record<ServiceKind, ServiceCandidate[]>;
  let profile: PlanningProfile | null = null;

  try {
    [candidatesByKind, profile] = await Promise.all([
      findCandidatesByKind(parsed.data.filters),
      user === null
        ? Promise.resolve(null)
        : readPlanningProfile(user.userId, settingsDeps().profile),
    ]);
  } catch (error) {
    console.error("[proposals] database read failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(503, "サービス情報を読み込めませんでした");
  }

  const today = jstToday(Date.now());
  const found = countCandidates(candidatesByKind);
  const applied = applyProfile(candidatesByKind, profile, today);
  const notice = exclusionNotice(applied.excluded, profile !== null);
  const total = countCandidates(applied.candidatesByKind);

  if (total === 0) {
    const response: ProposalResponse = {
      message:
        found === 0
          ? "条件に合うサービスが見つかりませんでした。上限価格を広げてお試しください。"
          : "本人確認を満たせる候補がありませんでした。プロフィールをご確認ください。",
      fallback: false,
      groups: serviceKinds.map((kind) => ({ kind, picks: [], candidates: [] })),
      notice,
    };
    return Response.json(response);
  }

  try {
    const generated = await requestProposal(
      parsed.data.request,
      applied.candidatesByKind,
      profile,
      today,
    );
    const groups = serviceKinds.map((kind) =>
      groupFor(kind, applied.candidatesByKind[kind], generated),
    );
    const picked = groups.reduce((sum, group) => sum + group.picks.length, 0);

    if (picked === 0) {
      const response: ProposalResponse = {
        message:
          "AIの回答を候補データと照合できなかったため、DBから候補を選びました。",
        fallback: true,
        groups: fallbackGroups(applied.candidatesByKind),
        notice,
      };
      return Response.json(response);
    }

    const response: ProposalResponse = {
      message: generated?.message ?? "条件に合うサービスを選びました。",
      fallback: false,
      groups,
      notice,
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
