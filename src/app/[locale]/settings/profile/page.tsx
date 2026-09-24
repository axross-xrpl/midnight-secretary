import { getTranslations } from "next-intl/server";
import { secretaryContext } from "@/adapters/auth/session";
import { readAgeCredential } from "@/application/secretary";
import type { AgeCredentialInitial } from "@/components/settings/age-credential-card";
import { AgeCredentialCard } from "@/components/settings/age-credential-card";
import { ProfileForm } from "@/components/settings/profile-form";
import type { ProfileDto } from "@/features/profile/schemas";
import { requireSessionUser } from "@/lib/require-session";
import { settingsDeps } from "@/server/ports";
import {
  readGenreOptions,
  readHomeOptions,
  readProfile,
} from "@/server/profile/read-profile";

// プロフィールの行が無いときと、行はあるが生年月日が空のときを同じに扱う
const hasBirthDate = (profile: ProfileDto | null): boolean => {
  return profile !== null && profile.birthDate !== null;
};

// 読めなかったことを未発行と混ぜない (real では contract server が落ちているだけで読めなくなる)
const initialCredential = async (): Promise<AgeCredentialInitial> => {
  const context = await secretaryContext();

  if (!context.ok) {
    return { kind: "unavailable" };
  }

  const credential = await readAgeCredential(
    context.value.userId,
    context.value.deps,
  );

  if (!credential.ok) {
    return { kind: "unavailable" };
  }

  if (credential.value === undefined) {
    return { kind: "none" };
  }

  return {
    kind: "issued",
    credential: {
      identity: credential.value.identity,
      origin: credential.value.origin,
    },
  };
};

export default async function ProfileSettingsPage() {
  const user = await requireSessionUser();
  const deps = settingsDeps();

  const [profile, homeOptions, genreOptions, credential, t] = await Promise.all(
    [
      readProfile(user.userId, deps.profile),
      readHomeOptions(deps.catalog),
      readGenreOptions(deps.catalog),
      initialCredential(),
      getTranslations("ProfileSettings"),
    ],
  );

  return (
    <section className="flex flex-col px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <p className="text-sm font-medium text-accent">{t("eyebrow")}</p>
        <h2 className="mt-1 font-serif text-2xl font-medium">{t("title")}</h2>
        <p className="mt-2 max-w-2xl text-base text-muted">
          {t("description")}
        </p>
      </div>
      <div className="mb-6">
        <AgeCredentialCard
          initial={credential}
          hasBirthDate={hasBirthDate(profile)}
        />
      </div>
      <ProfileForm
        initialProfile={profile}
        email={user.email}
        defaultFullName={user.name}
        homeOptions={homeOptions}
        genreOptions={genreOptions}
      />
    </section>
  );
}
