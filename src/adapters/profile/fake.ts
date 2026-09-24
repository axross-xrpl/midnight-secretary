import type { TransportMode } from "@/domain/catalog";
import type { IsoDateTime } from "@/domain/identifiers";
import type { TravelerPreferences } from "@/domain/plan";
import type { ProfilePort } from "@/domain/profile";
import type { ProfileDto, ProfileSaveInput } from "@/features/profile/schemas";
import type {
  ProfileOwner,
  ProfileSettingsPort,
  ProfileWriteError,
} from "@/features/profile/settings-port";
import type { Result } from "@/lib/result";
import { err, ok } from "@/lib/result";
import { birthDateOf, preferencesOf } from "./dto";

/**
 * fake のプロフィールの初期値
 *
 * `profile` はまだ保存していない全ユーザに返す行で、省くと未登録として振る舞う
 * `preferredTransport` はプロフィールに列が無い交通手段の好みで、秘書に渡す好みにだけ付ける (demo の参考シナリオを新幹線にするため)
 */
export type FakeProfileSeed = {
  profile?: ProfileDto;
  now: () => IsoDateTime;
  preferredTransport?: TransportMode;
};

type FakeProfileState = {
  saved: Readonly<Record<string, ProfileDto>>;
};

// 保存した行はリクエストより長く残す必要があるので、このクロージャに閉じた入れ物へ代入する
const putProfile = (
  state: FakeProfileState,
  userId: string,
  profile: ProfileDto,
): void => {
  state.saved = { ...state.saved, [userId]: profile };
};

/**
 * 本画面が持つ列だけを取り出す (real と同じ)
 *
 * `email` は新規のときだけ決まり、更新では動かさない
 */
const profileValuesOf = (input: ProfileSaveInput) => {
  return {
    fullName: input.fullName,
    address: input.address,
    birthDate: input.birthDate,
    residencePref: input.residencePref,
    homeCity: input.homeCity,
    homeSpot: input.homeSpot,
    diningGenres: input.diningGenres,
    leisureGenres: input.leisureGenres,
    budget: input.budget,
    priority: input.priority,
    walletAddress: input.walletAddress,
  };
};

// 新規はまだ保存していないユーザだけで、seed の行はまだ誰のものでもないので数えない (real の INSERT ... ON CONFLICT DO NOTHING と同じ)
const insertProfile = (
  state: FakeProfileState,
  now: () => IsoDateTime,
  owner: ProfileOwner,
  input: ProfileSaveInput,
): Result<ProfileDto, ProfileWriteError> => {
  if (state.saved[owner.userId] !== undefined) {
    return err({ kind: "conflict" });
  }

  const created: ProfileDto = {
    email: owner.email,
    ...profileValuesOf(input),
    updatedAt: now(),
  };

  putProfile(state, owner.userId, created);

  return ok(created);
};

// 画面は seed の行を読んで出しているので、seed の行の updatedAt でも更新できる
const updateProfile = (
  state: FakeProfileState,
  seed: FakeProfileSeed,
  owner: ProfileOwner,
  input: ProfileSaveInput,
  updatedAt: string,
): Result<ProfileDto, ProfileWriteError> => {
  const current = state.saved[owner.userId] ?? seed.profile;

  if (current === undefined) {
    return err({ kind: "notFound" });
  }

  // real は timestamptz を 1 ミリ秒の幅で突き合わせるので、fake はミリ秒の一致で比べる
  if (Date.parse(current.updatedAt) !== Date.parse(updatedAt)) {
    return err({ kind: "conflict" });
  }

  const updated: ProfileDto = {
    email: current.email,
    ...profileValuesOf(input),
    updatedAt: seed.now(),
  };

  putProfile(state, owner.userId, updated);

  return ok(updated);
};

const saveProfile = (
  state: FakeProfileState,
  seed: FakeProfileSeed,
  owner: ProfileOwner,
  input: ProfileSaveInput,
): Result<ProfileDto, ProfileWriteError> => {
  if (input.updatedAt === undefined) {
    return insertProfile(state, seed.now, owner, input);
  }

  return updateProfile(state, seed, owner, input, input.updatedAt);
};

// 行から取り出した好みに、行に列が無い交通手段の好みを足す (行が無ければ好みも無いまま)
const withPreferredTransport = (
  preferences: TravelerPreferences | undefined,
  preferredTransport: TransportMode | undefined,
): TravelerPreferences | undefined => {
  if (preferences === undefined || preferredTransport === undefined) {
    return preferences;
  }

  return { ...preferences, preferredTransport };
};

/**
 * seed の 1 行を全ユーザに返し、保存したユーザにはその行を返すプロフィール
 *
 * 秘書の `ProfilePort` と設定画面の `ProfileSettingsPort` を同じ行で満たすので、設定画面で生年月日を保存すると次の年齢判定に効く
 * 秘書に渡す生年月日と好みは、real と同じく行から `dto.ts` の導き方で取り出す
 * 保存した行はメモリに残り、再起動すると seed に戻る
 * demo ではサーバ起動日から決めた生年月日 (`runtime.ts` の `demoBirthDate`) の行を seed にする
 * メールアドレスの重複は起こさない (行はユーザごとに 1 つで、他のユーザの行と突き合わせない)
 */
export const createFakeProfile = (
  seed: FakeProfileSeed,
): ProfilePort & ProfileSettingsPort => {
  const state: FakeProfileState = { saved: {} };

  const profileOf = (userId: string): ProfileDto | undefined => {
    return state.saved[userId] ?? seed.profile;
  };

  return {
    readBirthDate: async (userId) => birthDateOf(profileOf(userId)),
    readPreferences: async (userId) =>
      ok(
        withPreferredTransport(
          preferencesOf(profileOf(userId)),
          seed.preferredTransport,
        ),
      ),
    readProfile: async (userId) => ok(profileOf(userId)),
    saveProfile: async (owner, input) => saveProfile(state, seed, owner, input),
  };
};
