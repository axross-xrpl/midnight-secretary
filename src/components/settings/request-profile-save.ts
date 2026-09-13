import { z } from "zod";
import type { ProfileDto, ProfileSaveInput } from "@/features/profile/schemas";
import { profileResponseSchema } from "@/features/profile/schemas";
import type { FetchLike } from "@/lib/http";
import type { Result } from "@/lib/result";
import { err, fromPromise, ok } from "@/lib/result";

/**
 * 保存できなかった理由
 *
 * 画面の出し分けはこの4つで足りる
 * - `invalid`: 項目ごとの赤字
 * - `conflict` / `notFound`: 再読み込みの案内
 * - `failed`: 再試行の案内
 */
export type ProfileSaveErrorKind =
  | "invalid"
  | "conflict"
  | "notFound"
  | "failed";

export type ProfileSaveError = {
  kind: ProfileSaveErrorKind;
  /** サーバが返した項目ごとのエラー。文言は画面側で引き当てる */
  fields: string[];
};

const issuesSchema = z.object({
  error: z.object({
    issues: z
      .object({ fieldErrors: z.record(z.string(), z.array(z.string())) })
      .optional(),
  }),
});

const failed = (): ProfileSaveError => {
  return { kind: "failed", fields: [] };
};

/**
 * プロフィール保存の Route Handler を呼び、応答をパースして返す
 *
 * ブラウザ側の境界なので、応答は unknown として受けてスキーマで確かめる
 */
export const requestProfileSave = async (
  fetchFn: FetchLike,
  input: ProfileSaveInput,
): Promise<Result<ProfileDto, ProfileSaveError>> => {
  const response = await fromPromise(
    fetchFn("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    failed,
  );

  if (!response.ok) {
    return response;
  }

  if (response.value.status === 409) {
    return err<ProfileSaveError>({ kind: "conflict", fields: [] });
  }

  if (response.value.status === 404) {
    return err<ProfileSaveError>({ kind: "notFound", fields: [] });
  }

  const body = await fromPromise(response.value.json(), failed);

  if (!body.ok) {
    return body;
  }

  if (response.value.status === 422) {
    const parsed = issuesSchema.safeParse(body.value);

    return err<ProfileSaveError>({
      kind: "invalid",
      fields: parsed.success
        ? Object.keys(parsed.data.error.issues?.fieldErrors ?? {})
        : [],
    });
  }

  if (!response.value.ok) {
    return err(failed());
  }

  const parsed = profileResponseSchema.safeParse(body.value);

  return parsed.success ? ok(parsed.data.data) : err(failed());
};
