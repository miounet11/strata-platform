import { LANGUAGES, type Language } from './i18n';

/**
 * Whether this machine is being used in mainland China. Language preference order alone is not
 * enough: Chinese Windows/macOS installs commonly list `en-US` first and `zh-CN` second, so
 * checking only the first tag would still hand those users an English interface.
 */
export function chinaRegion(
  tags?: readonly string[] | null,
  timeZone?: string | null,
): boolean {
  const tz = timeZone ?? (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
    } catch {
      return '';
    }
  })();
  if (/^(Asia\/(Shanghai|Chongqing|Harbin|Urumqi|Kashgar|Beijing))$/i.test(tz)) {
    return true;
  }
  return (tags ?? []).some((tag) => /^zh\b/i.test(String(tag)) && /[-_](CN|Hans)\b/i.test(String(tag)));
}

/**
 * The first start (nothing saved yet) opens in the language of the computer (#3723):
 * Chinese for users in China (even if en-US appears first), otherwise the first of the
 * browser's preferred languages that Stratat has. "pt-BR" is Portuguese, "zh-TW" is Chinese.
 * Null when none of them is offered.
 */
export function detectLanguage(
  tags: readonly string[] | null | undefined,
  options?: { timeZone?: string | null; checkChinaRegion?: boolean },
): Language | null {
  if (options?.checkChinaRegion && chinaRegion(tags, options.timeZone)) {
    return 'zh';
  }
  for (const raw of tags ?? []) {
    const base = String(raw).toLowerCase().split(/[-_]/)[0];
    const found = LANGUAGES.find(l => l.value === base);
    if (found) return found.value;
  }
  return null;
}

/** First-run UI language: Chinese in China, else the browser's preferred language, else English. */
export function firstRunLanguage(
  tags?: readonly string[] | null,
  timeZone?: string | null,
): Language {
  if (typeof navigator === 'undefined' && !tags && timeZone === undefined) return 'en';
  const list = tags ?? (typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language].filter(Boolean));
  return detectLanguage(list, { timeZone, checkChinaRegion: true }) ?? 'en';
}
