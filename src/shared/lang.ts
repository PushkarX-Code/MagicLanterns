// Languages arrive as two-letter codes, three-letter codes of either kind (fre/fra) or English names
// in file names. They're compared by a common two-letter key.

const KEYS: Record<string, string> = {
  english: 'en', eng: 'en', en: 'en', spanish: 'es', spa: 'es', es: 'es', french: 'fr', fre: 'fr', fra: 'fr', fr: 'fr',
  german: 'de', ger: 'de', deu: 'de', de: 'de', italian: 'it', ita: 'it', it: 'it', portuguese: 'pt', por: 'pt', pt: 'pt',
  brazilian: 'pt', japanese: 'ja', jpn: 'ja', ja: 'ja', korean: 'ko', kor: 'ko', ko: 'ko', chinese: 'zh', chi: 'zh', zho: 'zh',
  zh: 'zh', hindi: 'hi', hin: 'hi', hi: 'hi', russian: 'ru', rus: 'ru', ru: 'ru', arabic: 'ar', ara: 'ar', ar: 'ar',
  dutch: 'nl', dut: 'nl', nld: 'nl', nl: 'nl', swedish: 'sv', swe: 'sv', sv: 'sv', polish: 'pl', pol: 'pl', pl: 'pl',
  turkish: 'tr', tur: 'tr', tr: 'tr', bengali: 'bn', ben: 'bn', bn: 'bn', tamil: 'ta', tam: 'ta', ta: 'ta', telugu: 'te',
  tel: 'te', te: 'te', indonesian: 'id', ind: 'id', thai: 'th', tha: 'th', th: 'th', vietnamese: 'vi', vie: 'vi', vi: 'vi',
  greek: 'el', gre: 'el', ell: 'el', el: 'el', hebrew: 'he', heb: 'he', he: 'he', czech: 'cs', cze: 'cs', ces: 'cs', cs: 'cs',
  danish: 'da', dan: 'da', da: 'da', finnish: 'fi', fin: 'fi', fi: 'fi', norwegian: 'no', nor: 'no', no: 'no',
  hungarian: 'hu', hun: 'hu', hu: 'hu', romanian: 'ro', rum: 'ro', ron: 'ro', ro: 'ro', ukrainian: 'uk', ukr: 'uk', uk: 'uk',
  malay: 'ms', may: 'ms', msa: 'ms', ms: 'ms'
}

/** The two-letter key for a code or name; unknown words give null (or the word itself unless `strict`). */
export function langKey(code: string | null | undefined, strict = false): string | null {
  if (!code) return null
  const c = code.toLowerCase()
  return KEYS[c] ?? (strict ? null : c)
}

export const sameLanguage = (a: string | null | undefined, b: string | null | undefined): boolean => !!a && !!b && langKey(a) === langKey(b)
