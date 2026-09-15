import type { RequestFailure } from "@/components/chat/types";
import type { FetchLike } from "@/lib/http";
import type { Result } from "@/lib/result";
import { err, fromPromise, ok } from "@/lib/result";
import type { AgeRegistrationResponse } from "@/lib/secretary-response";
import {
  parseAgeCredentialResponse,
  parseSecretaryFailure,
} from "@/lib/secretary-response";

const AGE_CREDENTIAL_PATH = "/api/secretary/age-credential";

const networkFailure = (): RequestFailure => {
  return { code: "network" };
};

const schemaFailure = (): RequestFailure => {
  return { code: "schema" };
};

// 読み取りと発行は method だけが違うので、応答の扱いをここにまとめる
const requestAgeCredential = async (
  fetchFn: FetchLike,
  method: "GET" | "POST",
): Promise<Result<AgeRegistrationResponse | undefined, RequestFailure>> => {
  const response = await fromPromise(
    fetchFn(AGE_CREDENTIAL_PATH, { method }),
    networkFailure,
  );

  if (!response.ok) {
    return response;
  }

  const payload = await fromPromise(response.value.json(), schemaFailure);

  if (!payload.ok) {
    return payload;
  }

  if (!response.value.ok) {
    return err(parseSecretaryFailure(payload.value));
  }

  const credential = parseAgeCredentialResponse(payload.value);

  if (!credential.ok) {
    return err(schemaFailure());
  }

  return ok(credential.value);
};

/**
 * `GET /api/secretary/age-credential`
 *
 * 発行済みの年齢確認証明書を読む (body は無い)
 * 未発行は undefined
 */
export const requestReadAgeCredential = async (
  fetchFn: FetchLike,
): Promise<Result<AgeRegistrationResponse | undefined, RequestFailure>> => {
  return requestAgeCredential(fetchFn, "GET");
};

/**
 * `POST /api/secretary/age-credential`
 *
 * 年齢確認証明書を発行する (body は無い)
 * 発行済みなら同じ証明書が返るので、二重に押されても壊れない
 */
export const requestIssueAgeCredential = async (
  fetchFn: FetchLike,
): Promise<Result<AgeRegistrationResponse, RequestFailure>> => {
  const issued = await requestAgeCredential(fetchFn, "POST");

  if (!issued.ok) {
    return issued;
  }

  if (issued.value === undefined) {
    return err(schemaFailure());
  }

  return ok(issued.value);
};
