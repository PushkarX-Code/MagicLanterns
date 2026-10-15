// Text helpers shared by the library, the player and search: comparing languages, and matching what
// someone types against titles and names despite typos, accents and punctuation.

// ---------- Languages ----------
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

// ---------- Fuzzy matching ----------

/** Lower case, accents removed ("Shōgun" → "shogun"), punctuation as spaces ("Spider-Man" → "spider man"). */
export function fold(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Edits (insert, delete, change, swap neighbours) to turn a into b, giving up past `max`. */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev2: number[] = []
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1)
      cur.push(v)
      rowMin = Math.min(rowMin, v)
    }
    if (rowMin > max) return max + 1
    prev2 = prev
    prev = cur
  }
  return prev[b.length]
}

// "Part 2", "Part Two" and "Part II" are the same film.
const NUMBERS: Record<string, string> = {
  one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
  ii: '2', iii: '3', iv: '4', vi: '6', vii: '7', viii: '8', ix: '9'
}

/** How well one typed word fits one word of a field: whole, start, typo, or not at all (0). */
function wordScore(q: string, w: string): number {
  if (w === q || (NUMBERS[w] ?? w) === (NUMBERS[q] ?? q)) return 1
  if (w.startsWith(q)) return q.length >= 2 ? 0.9 : 0.6
  const allowed = q.length >= 7 ? 2 : q.length >= 4 ? 1 : 0
  if (!allowed) return 0
  // A typo in a whole word, or in the part of a longer word typed so far.
  if (editDistance(q, w, allowed) <= allowed) return 0.75
  if (w.length > q.length && editDistance(q, w.slice(0, q.length), allowed) <= allowed) return 0.65
  return 0
}

/**
 * Scores a query against named fields (0 = no match). Every typed word must fit some word of some field;
 * words may also be run together ("spiderman" finds "Spider-Man"). Earlier fields weigh more.
 */
export function matchScore(query: string, fields: string[]): number {
  const q = fold(query)
  if (!q) return 0
  const folded = fields.map(fold)
  let best = 0
  folded.forEach((f, fi) => {
    if (!f) return
    const weight = 1 - Math.min(fi, 4) * 0.12
    if (f === q) best = Math.max(best, 100 * weight)
    else if (f.startsWith(q)) best = Math.max(best, 90 * weight)
    else if (f.replace(/ /g, '').startsWith(q.replace(/ /g, ''))) best = Math.max(best, 85 * weight)
  })
  // Word by word across all fields.
  const words = folded.map((f, fi) => ({ fi, words: f.split(' ').filter(Boolean) }))
  let total = 0
  for (const qw of q.split(' ')) {
    let wBest = 0
    for (const { fi, words: ws } of words) for (const w of ws) wBest = Math.max(wBest, wordScore(qw, w) * (1 - Math.min(fi, 4) * 0.12))
    if (!wBest) return best
    total += wBest
  }
  return Math.max(best, (total / q.split(' ').length) * 75)
}
