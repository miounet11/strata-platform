"use client";

import { createContext, useContext, useEffect, useState } from "react";

type LocaleAvailCtx = {
  locales: readonly string[] | null;
  setLocales: (locales: readonly string[] | null) => void;
};

const Ctx = createContext<LocaleAvailCtx>({ locales: null, setLocales: () => {} });

/**
 * Scoped locale availability for the language switcher.
 *
 * Passing the full `guideLocaleMap()` from `LocaleLayout` serialized every guide slug across
 * all 7 locales into every page's RSC payload (20+ KB per page × 51k pages). Instead, pages
 * that exist only in a subset of locales (`/guides/[slug]`, `/topics/[slug]`) mount
 * `<RegisterLocales locales={...} />`, sending only ~30 bytes on those specific pages.
 */
export function LocaleAvailabilityProvider({ children }: { children: React.ReactNode }) {
  const [locales, setLocales] = useState<readonly string[] | null>(null);
  return <Ctx.Provider value={{ locales, setLocales }}>{children}</Ctx.Provider>;
}

export function useAvailableLocales(): readonly string[] | null {
  return useContext(Ctx).locales;
}

export function RegisterLocales({ locales }: { locales: readonly string[] }) {
  const { setLocales } = useContext(Ctx);
  const key = locales.join(",");
  useEffect(() => {
    setLocales(locales);
    return () => setLocales(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setLocales]);
  return null;
}
