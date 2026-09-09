import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // "dev" excluded: /dev/contracts is a developer-only tool, not part of the
  // localized page tree.
  matcher: ["/((?!api|trpc|_next|_vercel|dev|.*\\..*).*)"],
};
