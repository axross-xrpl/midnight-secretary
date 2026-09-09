import type { ServiceCategory } from "@/features/services/constants";
import { isTransportCategory } from "@/features/services/constants";
import type { ServiceDetailDto } from "@/features/services/schemas";
import {
  placeServiceDetailResponseSchema,
  transportServiceDetailResponseSchema,
} from "@/features/services/schemas";
import type { FetchLike } from "@/lib/http";
import type { Result } from "@/lib/result";
import { err, fromPromise, ok } from "@/lib/result";

/**
 * 詳細を読めなかった理由
 *
 * 画面では「もう一度試す」か「一覧を読み直す」かの案内が変わるだけなので、
 * 見つからない場合とそれ以外の2つに分けている
 */
export type ServiceDetailErrorKind = "notFound" | "failed";

const failed = (): ServiceDetailErrorKind => {
  return "failed";
};

const detailPath = (category: ServiceCategory, id: string): string => {
  const segment = isTransportCategory(category) ? "transport" : "place";

  return `/api/services/${segment}/${id}`;
};

/**
 * サービス詳細の Route Handler を呼び、応答をパースして返す
 *
 * ブラウザ側の境界なので、応答は unknown として受けてスキーマで確かめる
 * 参照先のテーブルは種別から決まるので、呼び出し側は id と種別だけを渡す
 */
export const requestServiceDetail = async (
  fetchFn: FetchLike,
  category: ServiceCategory,
  id: string,
): Promise<Result<ServiceDetailDto, ServiceDetailErrorKind>> => {
  const response = await fromPromise(fetchFn(detailPath(category, id)), failed);

  if (!response.ok) {
    return response;
  }

  if (response.value.status === 404) {
    return err<ServiceDetailErrorKind>("notFound");
  }

  if (!response.value.ok) {
    return err(failed());
  }

  const body = await fromPromise(response.value.json(), failed);

  if (!body.ok) {
    return body;
  }

  if (isTransportCategory(category)) {
    const parsed = transportServiceDetailResponseSchema.safeParse(body.value);

    return parsed.success
      ? ok<ServiceDetailDto>({ kind: "transport", service: parsed.data.data })
      : err(failed());
  }

  const parsed = placeServiceDetailResponseSchema.safeParse(body.value);

  return parsed.success
    ? ok<ServiceDetailDto>({ kind: "place", service: parsed.data.data })
    : err(failed());
};
