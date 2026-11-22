import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

/**
 * Pass only the requested top-level translation namespaces to a client subtree.
 *
 * `LocaleLayout` only sends `nav` and `footer` (~2 KB) so the other ~28 KB of `messages/*.json`
 * is never duplicated into the RSC payload of 50,000 static pages. Pages with interactive client
 * components wrap them with `<ClientMessages namespaces={["benchmarks"]} />`.
 */
export async function ClientMessages({
  namespaces,
  children,
}: {
  namespaces: string[];
  children: React.ReactNode;
}) {
  const all = (await getMessages()) as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const ns of namespaces) {
    if (ns in all) picked[ns] = all[ns];
  }
  return <NextIntlClientProvider messages={picked}>{children}</NextIntlClientProvider>;
}
