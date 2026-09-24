import type { IsoDate, IsoDateTime, UserId } from "@/domain/identifiers";
import { mustParse, parseIsoDateTime } from "@/domain/identifiers.parse";
import type { TravelerPreferences } from "@/domain/plan";
import type {
  ProfileOwner,
  ProfilePort,
  ProfileSettingsPort,
  ProfileWriteError,
} from "@/domain/profile";
import type { ProfileDto, ProfileSaveInput } from "@/features/profile/schemas";
import type { Result } from "@/lib/result";
import { err, ok } from "@/lib/result";
import { birthDateOf, planningProfileOf, preferencesOf } from "./dto";

/**
 * Fake のプロフィールが全ユーザに返す値
 *
 * `birthDate` も `preferences` も無ければ未登録として振る舞う
 * `email` と `seededAt` は seed のプロフィールを画面に出すときの値、`now` は保存時の時計 (省くと `seededAt`)
 */
export type FakeProfileSeed = {
  birthDate?: IsoDate;
  preferences?: TravelerPreferences;
  email?: string;
  seededAt?: IsoDateTime;
  now?: () => IsoDateTime;
};

const DEFAULT_EMAIL = "demo@example.com";

const DEFAULT_SEEDED_AT: IsoDateTime = mustParse(
  parseIsoDateTime("1970-01-01T00:00:00.000Z"),
);

type FakeProfileState = {
  saved: Readonly<Record<UserId, ProfileDto>>;
};

// 好みの出発地は都市として持ち、起点は空にする (real の `preferencesOf` は起点が無ければ都市を使う)
const seededProfileOf = (seed: FakeProfileSeed): ProfileDto | undefined => {
  if (seed.birthDate === undefined && seed.preferences === undefined) {
    return undefined;
  }

  return {
    email: seed.email ?? DEFAULT_EMAIL,
    fullName: null,
    address: null,
    birthDate: seed.birthDate ?? null,
    residencePref: null,
    homeCity: seed.preferences?.homeStation ?? "",
    homeSpot: null,
    diningGenres: [...(seed.preferences?.diningGenres ?? [])],
    leisureGenres: [...(seed.preferences?.leisureGenres ?? [])],
    budget: null,
    priority: null,
    walletAddress: null,
    updatedAt: seed.seededAt ?? DEFAULT_SEEDED_AT,
  };
};

// 保存した行はリクエストより長く残す必要があるので、このクロージャに閉じた入れ物へ代入する
const putProfile = (
  state: FakeProfileState,
  userId: UserId,
  profile: ProfileDto,
): void => {
  state.saved = { ...state.saved, [userId]: profile };
};

const savedValuesOf = (input: ProfileSaveInput) => {
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

const save = (
  state: FakeProfileState,
  seeded: ProfileDto | undefined,
  now: () => IsoDateTime,
  owner: ProfileOwner,
  input: ProfileSaveInput,
): Result<ProfileDto, ProfileWriteError> => {
  const stored = state.saved[owner.userId];
  const current = stored ?? seeded;

  if (input.updatedAt === undefined && current !== undefined) {
    return err({ kind: "conflict" });
  }

  if (input.updatedAt !== undefined && current === undefined) {
    return err({ kind: "notFound" });
  }

  if (
    input.updatedAt !== undefined &&
    current !== undefined &&
    Date.parse(current.updatedAt) !== Date.parse(input.updatedAt)
  ) {
    return err({ kind: "conflict" });
  }

  // email は最初に行ができるときだけ決まる (seed の行はこのユーザのものになる)
  const profile: ProfileDto = {
    email: stored?.email ?? owner.email,
    ...savedValuesOf(input),
    updatedAt: now(),
  };

  putProfile(state, owner.userId, profile);

  return ok(profile);
};

/**
 * seed の 1 つのプロフィールを全ユーザに返し、保存したユーザにはその行を返すプロフィール
 *
 * demo ではサーバ起動日から決めた生年月日 (`runtime.ts` の `demoBirthDate`) を全ユーザに返す
 * 保存した行はメモリに残り、再起動すると seed に戻る
 * 保存前の生年月日と好みは seed をそのまま、保存後は real と同じ導き方で行から読む
 */
export const createFakeProfile = (
  seed: FakeProfileSeed,
): ProfilePort & ProfileSettingsPort => {
  const state: FakeProfileState = { saved: {} };
  const seeded = seededProfileOf(seed);
  const now = seed.now ?? (() => seed.seededAt ?? DEFAULT_SEEDED_AT);

  const profileOf = (userId: UserId): ProfileDto | undefined => {
    return state.saved[userId] ?? seeded;
  };

  return {
    readBirthDate: async (userId) => {
      const stored = state.saved[userId];

      return stored === undefined ? ok(seed.birthDate) : birthDateOf(stored);
    },
    readPreferences: async (userId) => {
      const stored = state.saved[userId];

      return ok(
        stored === undefined ? seed.preferences : preferencesOf(stored),
      );
    },
    readProfile: async (userId) => ok(profileOf(userId)),
    readPlanningProfile: async (userId) => {
      const profile = profileOf(userId);

      return ok(profile === undefined ? undefined : planningProfileOf(profile));
    },
    saveProfile: async (owner, input) => save(state, seeded, now, owner, input),
  };
};
