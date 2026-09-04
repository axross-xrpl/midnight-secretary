import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { notFound } from "next/navigation";
import * as rootParams from "next/root-params";

import { routing } from "./routing";

export default getRequestConfig(async () => {
  const requested = await rootParams.locale();

  if (!hasLocale(routing.locales, requested)) {
    notFound();
  }
  const locale = requested;

  return {
    locale,
    // Fixed time zone so server and client render the same date strings.
    timeZone: "Asia/Tokyo",
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
