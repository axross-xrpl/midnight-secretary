/** 拠点都市と、その都市で選べる起点 */
export type HomeOption = {
  city: string;
  spots: string[];
};

/** 好み・趣味に選べるジャンル */
export type GenreOptions = {
  dining: string[];
  leisure: string[];
};
