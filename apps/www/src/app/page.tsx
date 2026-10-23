import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { routing } from "@/i18n/routing";

// `/` is a redirect, not a page: it has no h1, no description and no canonical because a
// visitor never reads it. Declaring noindex says so, which is what lets the audit treat it as
// intentional instead of reporting it as a malformed page.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function RootPage() {
  redirect(`/${routing.defaultLocale}`);
}
