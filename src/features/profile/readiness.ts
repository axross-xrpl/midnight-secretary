/**
 * 本画面から満たせる本人確認の種類
 *
 * `db-design.md` §7.2 の3種のうち、国籍確認は MVP では画面を持たないため対象外
 */
export const profileVerifications = ["age", "residence"] as const;

export type ProfileVerification = (typeof profileVerifications)[number];

export type VerificationReadiness = {
  kind: ProfileVerification;
  ready: boolean;
};

type ReadinessSource = {
  birthDate: string | null;
  residencePref: string | null;
};

const isFilled = (value: string | null): boolean => {
  return value !== null && value !== "";
};

/**
 * 入力中の値から、どの本人確認を満たせるかを出す
 *
 * 述語の元になる列が空だと、その確認を要求するサービスは候補から外れる
 * (`db-design.md` §10 の `filter_feasible`)
 */
export const verificationReadiness = (
  source: ReadinessSource,
): VerificationReadiness[] => {
  return [
    { kind: "age", ready: isFilled(source.birthDate) },
    { kind: "residence", ready: isFilled(source.residencePref) },
  ];
};
