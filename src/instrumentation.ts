/**
 * サーバ起動時に source の変数を検査し、設定ミスを早く失敗させる
 *
 * runtime は process.env を読んで fake を組み立てるので、Node.js runtime でしか意味が無い
 */
export const register = async (): Promise<void> => {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { getSecretaryRuntime } = await import("@/adapters/runtime");

  getSecretaryRuntime();
};
