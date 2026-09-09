/**
 * fetch と同じ形の関数
 *
 * I/O を引数で受け取るための型で、テストでは Stub を渡す
 */
export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;
