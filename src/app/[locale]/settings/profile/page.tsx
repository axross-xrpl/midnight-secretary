import { getTranslations } from "next-intl/server";
import { ProfileForm } from "@/components/settings/profile-form";
import { requireSessionUser } from "@/lib/require-session";
import {
  readGenreOptions,
  readHomeOptions,
  readProfile,
} from "@/server/profile/read-profile";

export default async function ProfileSettingsPage() {
  const user = await requireSessionUser();

  const [profile, homeOptions, genreOptions, t] = await Promise.all([
    readProfile(user.userId),
    readHomeOptions(),
    readGenreOptions(),
    getTranslations("ProfileSettings"),
  ]);

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
