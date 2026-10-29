// Qalb — Rule-based content guardian (CLIENT-SAFE)
// Yeh module sirf pure logic hai — koi server-only import nahi (no env, no SDK).
// APK (static export) aur server dono jagah use hota hai.
//
// USER RULE (v0.2.1-26): SIRF ISLAMIC content — Naat, Hamd, Sufi Qawwali,
// Nasheed, Sufi kalam. Bollywood/Hollywood songs, Bhajan, ya KISI BHI doosre
// religion ka content KABHI allow nahi.
//
// Teen layers (ye file Layer 1 + 2 hai; result-level filter result-filter.ts):
//   L1 QUERY GUARD — non-Islamic religious + entertainment terms wali query
//      seedha BLOCK (valid=false) — YouTube tak jaati hi nahi
//   L2 STRICT FLAG — query Islamic-intent wali hai ya ambiguous (jaise koi
//      naam)? Ambiguous queries par result-filter STRICT mode me chalta hai
//   L3 (result-filter.ts) — har YouTube result: Islamic marker chahiye warna
//      hide (strict) / hard-block hamesha

import type { SearchValidationResult } from '@/lib/types'

// ── L1: Query-level BLOCK list ────────────────────────────────────
// Non-Islamic religious content — HAMESHA block, kabhi allow nahi.
// NOTE: 'kali' (Kali Kali Zulfon qawwali), 'saif' (Saif-ul-Malook kalam),
// 'kailash' (Kailash Kher sufi), 'khuda' (qawwali me common) — jaan boojh
// kar SKIP hain warna Islamic kalam block ho jate.
export const RELIGIOUS_BLOCK = [
  // Hindu devotional
  'bhagvan', 'bhagwan', 'bhagawan', 'bhagban', 'bhagvat', 'bhagavat',
  'ishwar', 'parmeshwar', 'parameshwar', 'vishnu', 'bishnu',
  'krishna', 'krishan', 'kishan', 'kanhaiya', 'kanha', 'gopal', 'govind',
  'radha', 'radhe', 'sita', 'ram', 'rama', 'ramayan', 'ramayana',
  'ramlila', 'ramleela', 'mahabharat', 'mahabharata', 'gita', 'geeta',
  'puran', 'purana', 'ved', 'veda', 'upanishad', 'mantra', 'tantra',
  'aarti', 'arti', 'pooja', 'puja', 'bhajan', 'bhakti', 'mandir',
  'temple', 'dham', 'tirth', 'yatra', 'havan', 'yagya', 'japa',
  'mahadev', 'shiv', 'shiva', 'shambhu', 'shankar', 'bholenath',
  'om', 'namah', 'ganesha', 'ganesh', 'ganpati', 'vinayak', 'kartikey',
  'murugan', 'ayyappa', 'hanuman', 'bajrang', 'balaji', 'mahavir',
  'dukh bhanjan', 'parvati', 'gauri', 'durga', 'lakshmi', 'laxmi',
  'saraswati', 'gayatri', 'navratri', 'diwali', 'holi', 'janmashtami',
  'shivratri', 'chalisa', 'stotra', 'shloka', 'devi', 'jagran',
  'jai shri', 'jai shree', 'vande mataram', 'jai hind', 'desh bhakti',
  'deshbhakti', 'jan gan man', 'national anthem',
  // Christian devotional
  'jesus', 'christ', 'christian', 'bible', 'gospel', 'church',
  'catholic', 'hallelujah', 'yahweh', 'holy ghost', 'ave maria', 'mary',
  'god',
  // Sikh devotional
  'guru nanak', 'gurbani', 'kirtan', 'granth', 'khalsa', 'waheguru',
  'vaheguru', 'gurudwara', 'gurdwara',
  // Other
  'buddha', 'buddhist', 'kabbalah', 'torah',
]

// Film / pop / secular entertainment — query level bhi block
export const ENTERTAINMENT_BLOCK = [
  'bollywood', 'lollywood', 'hollywood', 'tollywood', 'kollywood',
  'movie', 'movies', 'film', 'filmi', 'filmy', 'trailer', 'teaser',
  'netflix', 'web series', 'box office',
  'official song', 'video song', 'full song', 'new song', 'audio song',
  'sad song', 'love song', 'romantic', 'breakup', 'sad status',
  'love status', 'alone status',
  'pop', 'rock', 'rap', 'hip hop', 'hiphop', 'edm', 'dj', 'remix',
  'mashup', 'dance', 'club', 'gaana', 'gana',
  'comedy', 'podcast', 'interview', 'actor', 'actress',
  // film/celebrity names (jo queries YouTube par film songs laati hain)
  // NOTE: 'party' JAAN BOOJH KAR skip — "Qawwal Party" jaisi Islamic
  // mehfils block na ho jayein
  'salman khan', 'shahrukh', 'sharukh', 'shah rukh', 'srk', 'aamir khan',
  'akshay kumar', 'hrithik', 'ajay devgn', 'varun dhawan', 'ranbir',
  'ranveer', 'priyanka', 'deepika', 'alia bhatt', 'katrina', 'kareena',
  'aishwarya', 'anushka', 'shraddha', 'kriti sanon', 'nora fatehi',
  'jacqueline', 'kartik aryan', 'arijit', 'honey singh', 'yo yo honey',
  'guru randhawa', 'justin bieber', 'taylor swift', 'ed sheeran',
  'billie eilish', 'eminem', 'kpop', 'k-pop', 'bts', 'dua lipa',
  'ariana grande', 'selena gomez', 'billboard', 'rajinikanth',
  // film songs jo Islamic words se shuru hote hain (result-level bhi)
  'allah duhai',
]

// Query-level combined list (L1)
export const BLOCKED_TERMS = [...RELIGIOUS_BLOCK, ...ENTERTAINMENT_BLOCK]

// ── L2: Islamic intent — query me ye word hai to STRICT mode OFF ──
export const ISLAMIC_INTENT = [
  'naat', 'naats', 'hamd', 'hamad', 'qawwali', 'qawali', 'kawwali',
  'kawali', 'nasheed', 'nashid', 'noha', 'nauha', 'manqabat', 'marsiya',
  'salam', 'sufi', 'kalam', 'kalaam', 'islamic', 'islam', 'deen',
  'durood', 'darood', 'salawat', 'azan', 'adhan', 'azaan', 'namaz',
  'salah', 'ramzan', 'ramadan', 'eid', 'milad', 'karbala', 'muharram',
  'meraj', 'khwaja', 'gharib nawaz', 'ajmer', 'madina', 'madinah',
  'madani', 'makkah', 'mecca', 'kaaba', 'kaba', 'haram', 'masjid',
  'nabi', 'rasool', 'rasul', 'mustafa', 'mujtaba', 'muhammad',
  'mohammad', 'mohammed', 'allah', 'allahu', 'rab', 'rabb', 'maula',
  'mawla', 'hussain', 'taqwa', 'iman', 'zakat', 'hajj', 'umrah',
  'quran', 'surah', 'ayat', 'dua', 'tasbih', 'jannah', 'aqeedah',
]

// ── compiled regex helpers (word-boundary — substring nahi, warna
// "pyare nabi" me "pyar" match ho jata) ────────────────────────────

function escapeTerm(t: string): string {
  return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function compileList(terms: string[]): RegExp {
  return new RegExp(`\\b(?:${terms.map(escapeTerm).join('|')})\\b`, 'i')
}

// sirf yahan use ke liye — ek dafa compile, har query par reuse
const RE_RELIGIOUS = compileList(RELIGIOUS_BLOCK)
const RE_ENTERTAINMENT = compileList(ENTERTAINMENT_BLOCK)
const RE_INTENT = compileList(ISLAMIC_INTENT)

export function queryHasIslamicIntent(q: string): boolean {
  return RE_INTENT.test(q.toLowerCase())
}

export function matchBlockedTerm(q: string): string | null {
  const lower = q.toLowerCase()
  if (RE_RELIGIOUS.test(lower)) {
    const m = lower.match(RE_RELIGIOUS)
    return m?.[0] ?? 'non-Islamic'
  }
  if (RE_ENTERTAINMENT.test(lower)) {
    const m = lower.match(RE_ENTERTAINMENT)
    return m?.[0] ?? 'non-Islamic'
  }
  return null
}

// Category sirf UI/badge ke liye — blocking isse decide nahi hoti
function detectCategory(q: string): SearchValidationResult['category'] {
  if (/qaww?ali|kaww?ali|qwal|sufi/.test(q)) return 'QAWWALI'
  if (/\bnaats?\b|\bnoha\b|\bmanqabat\b|\bhamd|\bhumd\b|\bnasheed|\bnashid\b/.test(q)) {
    return /\bnaats?\b|\bnoha\b|\bmanqabat\b/.test(q) ? 'NAAT' : 'HAMD'
  }
  if (/\bnasheed|\bnashid|\bdarood|\bdurood|\bsalam\b/.test(q)) return 'NASHEED'
  if (/madina|madinah|makkah|allah|\brab\b|\brabbi/.test(q)) return 'HAMD'
  return null
}

export function ruleBasedValidate(query: string): SearchValidationResult {
  const q = query.toLowerCase().trim()

  // L1: non-Islamic religious / entertainment query → seedha BLOCK
  const blocked = matchBlockedTerm(q)
  if (blocked) {
    return {
      valid: false,
      category: null,
      refinedQuery: null,
      reason: `"${blocked}" non-Islamic content hai — Qalb sirf Naat, Hamd, Sufi Qawwali aur Nasheed dikhata hai.`,
      provider: 'rules',
      strict: true,
    }
  }

  // L2: query Islamic-intent wali hai ya ambiguous?
  // Ambiguous (jaise koi naam) → strict=true → result filter har result
  // par Islamic marker mangega (Bollywood/bhajan results UI tak nahi pahunchte)
  const strict = !queryHasIslamicIntent(q)

  return {
    valid: true,
    category: detectCategory(q),
    refinedQuery: query.trim(),
    reason: strict
      ? 'Paak kalaam search — results sirf Islamic content tak filter honge.'
      : 'Paak kalaam search — allowed.',
    provider: 'rules',
    strict,
  }
}
