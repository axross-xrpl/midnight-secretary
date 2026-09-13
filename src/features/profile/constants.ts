/**
 * 手配の優先度
 *
 * `user_profiles.priority` の CHECK 制約と同じ3値
 */
export const priorities = ["time", "price", "comfort"] as const;

export type Priority = (typeof priorities)[number];

/**
 * 居住地の選択肢 (47都道府県＋国外)
 *
 * 住居確認 (`residence`) の述語は値の一致で判定するため、自由入力にはしない
 * 値がそのまま `user_profiles.residence_pref` に入る
 */
export const residenceOptions = [
  "北海道",
  "青森県",
  "岩手県",
  "宮城県",
  "秋田県",
  "山形県",
  "福島県",
  "茨城県",
  "栃木県",
  "群馬県",
  "埼玉県",
  "千葉県",
  "東京都",
  "神奈川県",
  "新潟県",
  "富山県",
  "石川県",
  "福井県",
  "山梨県",
  "長野県",
  "岐阜県",
  "静岡県",
  "愛知県",
  "三重県",
  "滋賀県",
  "京都府",
  "大阪府",
  "兵庫県",
  "奈良県",
  "和歌山県",
  "鳥取県",
  "島根県",
  "岡山県",
  "広島県",
  "山口県",
  "徳島県",
  "香川県",
  "愛媛県",
  "高知県",
  "福岡県",
  "佐賀県",
  "長崎県",
  "熊本県",
  "大分県",
  "宮崎県",
  "鹿児島県",
  "沖縄県",
  "国外",
] as const;

export type ResidenceOption = (typeof residenceOptions)[number];

/** 都道府県ではない選択肢。画面では訳語を出す */
export const OVERSEAS_RESIDENCE = "国外";

/** 好み・趣味に選べる件数 */
export const MAX_GENRES = 10;

/** 好み・趣味の1件あたりの文字数 */
export const MAX_GENRE_LENGTH = 40;

/** 生年月日に入れられる最も古い日 */
export const MIN_BIRTH_DATE = "1900-01-01";
