/**
 * undefined でないことを絞り込む型ガード(filter に参照で渡す)
 */
export const isDefined = <T>(value: T | undefined): value is T => {
  return value !== undefined;
};

/**
 * 変換して初めて成否が判る場合の filter + map 融合(Rust の filter_map 相当)
 *
 * parse 系の変換で成功した値だけを集める用途に使う。
 * 単なる条件絞り込み + 変換は filter -> map に分けること。
 */
export const filterMap = <T, U>(
  items: readonly T[],
  f: (item: T) => U | undefined,
): U[] => {
  return items.map(f).filter(isDefined);
};
