import "../globals.css";

// Minimal layout scoped to /dev/** only -- no nav, no auth/session provider,
// no i18n. This is a developer-only tool, deliberately outside the
// [locale] page tree (see src/proxy.ts's matcher).
export default function DevLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
