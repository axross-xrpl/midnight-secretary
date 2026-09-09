/**
 * door-to-door の算出
 *
 * 交通は「乗車時間」だけでは比べられない。拠点から目的地までの移動と待ちを含めた
 * 所要と総額でないと、新幹線と航空の速さ・安さが逆転することが見えない
 *
 *   所要 = 拠点→出発地点 + 乗車前の待ち + 乗車 + 降車後 + 到着地点→目的地
 *   総額 = 運賃 + 前後アクセスの運賃
 *
 * 交通の行が内訳を自己完結して持つため、移動条件のテーブルを参照しない
 */

/**
 * 算出に使う交通の列だけを取り出した形
 */
export type TransportLeg = {
  originAccessMin: number;
  boardingBufferMin: number;
  durationMin: number;
  /** 航空の荷物受取など。鉄道は 0 か未設定 */
  arrivalBufferMin: number | null;
  destinationAccessMin: number;
  priceJpyc: number;
  /** 前後アクセスの運賃合計 */
  accessFareJpyc: number | null;
};

/**
 * door-to-door の内訳
 *
 * 表示の順序が「拠点を出てから目的地に着くまで」と同じになるよう並べている
 */
export type DoorToDoorBreakdown = {
  originAccessMin: number;
  boardingBufferMin: number;
  durationMin: number;
  arrivalBufferMin: number;
  destinationAccessMin: number;
};

export type DoorToDoor = {
  /** 総所要 (分) */
  totalMin: number;
  /** 総額 (円) */
  totalJpyc: number;
  breakdown: DoorToDoorBreakdown;
};

export const doorToDoor = (leg: TransportLeg): DoorToDoor => {
  const breakdown: DoorToDoorBreakdown = {
    originAccessMin: leg.originAccessMin,
    boardingBufferMin: leg.boardingBufferMin,
    durationMin: leg.durationMin,
    // 未設定は 0 として扱う (鉄道は降車後の待ちが無い)
    arrivalBufferMin: leg.arrivalBufferMin ?? 0,
    destinationAccessMin: leg.destinationAccessMin,
  };

  return {
    totalMin:
      breakdown.originAccessMin +
      breakdown.boardingBufferMin +
      breakdown.durationMin +
      breakdown.arrivalBufferMin +
      breakdown.destinationAccessMin,
    totalJpyc: leg.priceJpyc + (leg.accessFareJpyc ?? 0),
    breakdown,
  };
};

/**
 * 分を時と分に分ける
 *
 * 表示の文言はロケールごとに変わるので、ここでは数値のまま返す
 */
export type DurationParts = {
  hours: number;
  minutes: number;
};

export const toDurationParts = (totalMin: number): DurationParts => {
  return {
    hours: Math.floor(totalMin / 60),
    minutes: totalMin % 60,
  };
};
