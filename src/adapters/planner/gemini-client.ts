import "server-only";

import { GoogleGenAI } from "@google/genai";
import type { PlannerError } from "@/domain/planner";
import { err, fromPromise, fromThrowable } from "@/lib/result";
import type { GenerateJson } from "./gemini";

/**
 * `GEMINI_MODEL` を省いたときに使うモデル
 *
 * Wave 1 の間は 1 つに固定する
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

const llmError = (cause: unknown): PlannerError => {
  return { kind: "llm", cause };
};

// 本文が JSON として読めないのは形の失敗として扱う
const invalidJson = (): PlannerError => {
  return {
    kind: "schema",
    issues: [{ path: [], message: "response is not JSON" }],
  };
};

/**
 * `@google/genai` で JSON を生成する `GenerateJson` を作る
 *
 * `apiKey` が無ければ呼ばれたときに `llm` の失敗を返す (起動は止めない)
 * 通信の失敗や 429 は `cause` にそのまま入れる
 * `@google/genai` を呼ぶのはこのファイルだけ
 */
export const geminiGenerate = (
  apiKey: string | undefined,
  model: string,
): GenerateJson => {
  return async (prompt, responseJsonSchema) => {
    if (apiKey === undefined) {
      return err(llmError("GEMINI_API_KEY is not set"));
    }

    // ライブラリの境界なので class の生成を許す
    const client = new GoogleGenAI({ apiKey });
    const response = await fromPromise(
      client.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: "application/json", responseJsonSchema },
      }),
      llmError,
    );

    if (!response.ok) {
      return response;
    }

    const text = response.value.text?.trim() ?? "";

    return fromThrowable((): unknown => JSON.parse(text), invalidJson);
  };
};
