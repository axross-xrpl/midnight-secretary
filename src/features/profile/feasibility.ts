import type { VerificationKind } from "@/features/services/constants";
import { verificationKinds } from "@/features/services/constants";
import type { Priority } from "./constants";

/**
 * 手配に効くプロフィールの項目
 *
 * 画面が扱う `ProfileDto` とは別に、`nationality` を含む (本人確認の判定に要るため)
 * 表示だけの項目 (氏名・住所・メール) は持たない
 */
export type PlanningProfile = {
  birthDate: string | null;
  nationality: string | null;
  residencePref: string | null;
  homeCity: string;
  homeSpot: string | null;
  diningGenres: string[];
  leisureGenres: string[];
  budget: number | null;
  priority: Priority | null;
};

/** 除外の判定に要る候補の部分 */
export type VerifiableCandidate = {
  requiredVerifications: string[];
  ageLimit?: number;
  genre?: string;
};

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * JST での今日
 *
 * 年齢は暦日で決まるので、判定の基準日はタイムゾーンを固定して作る
 */
export const jstToday = (nowMs: number): string => {
  return new Date(nowMs + JST_OFFSET_MS).toISOString().slice(0, 10);
};

/**
 * `today` 時点の満年齢
 *
 * どちらも `YYYY-MM-DD`。誕生日が来ていなければ1つ引く
 */
export const ageOn = (birthDate: string, today: string): number => {
  const [year, month, day] = birthDate.split("-").map(Number);
  const [thisYear, thisMonth, thisDay] = today.split("-").map(Number);
  const years = thisYear - year;

  return thisMonth < month || (thisMonth === month && thisDay < day)
    ? years - 1
    : years;
};

const isVerificationKind = (value: string): value is VerificationKind => {
  return (verificationKinds as readonly string[]).includes(value);
};

/**
 * 利用者がその本人確認を満たせるか
 *
 * 述語の元になる列が空なら満たせない。プロフィール未登録も同じ扱い
 * (`db-design.md` §7.2 / §10 の `filter_feasible`)
 */
export const canSatisfy = (
  kind: VerificationKind,
  profile: PlanningProfile | null,
  ageLimit: number | undefined,
  today: string,
): boolean => {
  if (profile === null) {
    return false;
  }

  switch (kind) {
    case "age":
      return (
        profile.birthDate !== null &&
        (ageLimit === undefined || ageOn(profile.birthDate, today) >= ageLimit)
      );
    case "nationality":
      return profile.nationality !== null;
    case "residence":
      return profile.residencePref !== null;
  }
};

/** 除外した件数を本人確認の種類ごとに数えたもの */
export type ExclusionCounts = Partial<Record<VerificationKind, number>>;

export type FeasibilityResult<T> = {
  candidates: T[];
  excluded: ExclusionCounts;
};

/**
 * 満たせない本人確認を要求する候補を落とす
 *
 * 落とした理由は種類ごとに数えて返す。画面に「なぜ減ったか」を出すため、
 * 除外を黙って行わない
 */
export const filterFeasible = <T extends VerifiableCandidate>(
  candidates: T[],
  profile: PlanningProfile | null,
  today: string,
): FeasibilityResult<T> => {
  const excluded: ExclusionCounts = {};
  const kept: T[] = [];

  for (const candidate of candidates) {
    const unmet = candidate.requiredVerifications
      .filter(isVerificationKind)
      .find((kind) => !canSatisfy(kind, profile, candidate.ageLimit, today));

    if (unmet === undefined) {
      kept.push(candidate);
    } else {
      excluded[unmet] = (excluded[unmet] ?? 0) + 1;
    }
  }

  return { candidates: kept, excluded };
};

/**
 * 好みに合う候補を前に出す
 *
 * 絞り込まずに並べ替えるだけ。好みに合う候補が無いときに空にしないため
 */
export const orderByPreference = <T extends { genre?: string }>(
  candidates: T[],
  preferred: string[],
): T[] => {
  if (preferred.length === 0) {
    return candidates;
  }

  const wanted = new Set(preferred);
  const score = (candidate: T): number =>
    candidate.genre !== undefined && wanted.has(candidate.genre) ? 1 : 0;

  // sort は安定なので、好みに合うものだけが前に出て残りの順序は変わらない
  return [...candidates].sort((a, b) => score(b) - score(a));
};

/** 除外が起きた種類を、多い順ではなく固定の順序で返す */
export const excludedKinds = (
  excluded: ExclusionCounts,
): VerificationKind[] => {
  return verificationKinds.filter((kind) => (excluded[kind] ?? 0) > 0);
};
