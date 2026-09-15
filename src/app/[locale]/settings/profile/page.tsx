import { getTranslations } from "next-intl/server";
import { secretaryContext } from "@/adapters/auth/session";
import { readAgeCredential } from "@/application/secretary";
import { AgeCredentialCard } from "@/components/settings/age-credential-card";
import { ProfileForm } from "@/components/settings/profile-form";
import type { ProfileDto } from "@/features/profile/schemas";
import { requireSessionUser } from "@/lib/require-session";
import type { AgeRegistrationResponse } from "@/lib/secretary-response";
import {
  readGenreOptions,
  readHomeOptions,
  readProfile,
} from "@/server/profile/read-profile";

// プロフィールの行が無いときと、行はあるが生年月日が空のときを同じに扱う
const hasBirthDate = (profile: ProfileDto | null): boolean => {
  return profile !== null && profile.birthDate !== null;
};

// 発行済みかどうかだけを初期値にするので、読めなかったときは未発行として出す (発行は二重に押されても壊れない)
const issuedCredential = async (): Promise<
  AgeRegistrationResponse | undefined
> => {
  const context = await secretaryContext();

  if (!context.ok) {
    return undefined;
  }

  const credential = await readAgeCredential(
    context.value.userId,
    context.value.deps,
  );

  if (!credential.ok || credential.value === undefined) {
    return undefined;
  }

  return {
    identity: credential.value.identity,
    registeredAt: credential.value.registeredAt,
  };
};

export default async function ProfileSettingsPage() {
  const user = await requireSessionUser();

  const [profile, homeOptions, genreOptions, credential, t] = await Promise.all(
    [
      readProfile(user.userId),
      readHomeOptions(),
      readGenreOptions(),
      issuedCredential(),
      getTranslations("ProfileSettings"),
    ],
  );

  return (
    <section className="flex flex-col px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <p className="text-sm font-medium text-[#185fa5]">{t("eyebrow")}</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">
          {t("title")}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          {t("description")}
        </p>
      </div>
      <div className="mb-6">
        <AgeCredentialCard
          {...(credential === undefined ? {} : { initial: credential })}
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
