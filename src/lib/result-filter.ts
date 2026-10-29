// Qalb — Result-Level Content Filter (Layer 3)
// ─────────────────────────────────────────────────────────────────
// Query guard (search-rules.ts) sirf QUERY dekhta hai — lekin YouTube
// ambiguous queries (jaise koi naam "Salman") par film songs/bhajan
// bhi lauta deta hai. Ye filter HAR RESULT ka title+channel jaanchta hai:
//
//   1. HARD BLOCK — non-Islamic religious ya film/pop marker
//      (title ya channel me) → KABHI pass nahi
//   2. ISLAMIC MARKER — naat/hamd/qawwali/madina/artist names → pass
//   3. NEUTRAL result (koi marker nahi) → sirf non-strict queries me pass
//
// STRICT mode (ambiguous queries) me neutral results bhi hide —
// isliye "Salman" par sirf Islamic results dikhte hain.
//
// CLIENT-SAFE: koi server-only import nahi — APK + hosted dono use karte.

import type { QalbTrack } from '@/lib/types'
import { RELIGIOUS_BLOCK, ENTERTAINMENT_BLOCK } from '@/lib/search-rules'

// Channel/label hard-block — ye channels film/pop/bhajan ka ghar hain
// (NOTE: plain "t-series" BLOCK NAHI — T-Series par naats bhi hain;
// sirf "t-series films" block hota hai)
const CHANNEL_BLOCK = [
  'yrf', 'yash raj films', 'yash raj music', 't-series films',
  'tseries films', 't series films', 'zee music', 'sony music india',
  'sony music', 'saregama', 'tips official', 'tips music',
  'pen bhakti', 'pen movies', 'pen studio', 'shemaroo', 'rajshri',
  'eros now', 'eros international', 'vishesh films',
  'dharma productions', 'nadiadwala', 'red chillies', 'excel movies',
  'star plus', 'set india', 'colors tv', 'zee tv', 'andtv', 'sab tv',
  'voot', 'jio cinema', 'wave music', '9xm', 'b4u', 'mtv',
  'gulshan kumar', 'bhakti', 'full movie', 'movies', 'dua lipa',
]

// Islamic markers — title/channel me ye word ho to result PAAK hai
// (genre words + deen words + naat khawan artists + phrases)
const ISLAMIC_MARKERS = [
  // genres
  'naat', 'hamd', 'hamad', 'qawwali', 'qawali', 'kawwali', 'kawali',
  'nasheed', 'nashid', 'noha', 'nauha', 'manqabat', 'marsiya', 'sufi',
  'kalam', 'kalaam', 'islamic', 'islam', 'deen', 'madani',
  // deen words
  'durood', 'darood', 'salawat', 'azan', 'adhan', 'azaan', 'namaz',
  'ramzan', 'ramadan', 'eid', 'milad', 'karbala', 'muharram', 'khwaja',
  'gharib nawaz', 'ajmer', 'madina', 'madinah', 'makkah', 'mecca',
  'kaaba', 'kaba', 'haram', 'masjid', 'nabi', 'rasool', 'rasul',
  'mustafa', 'mujtaba', 'muhammad', 'mohammad', 'mohammed', 'allah',
  'allahu', 'rabb', 'maula', 'mawla', 'hussain', 'quran', 'koran',
  'surah', 'ayat', 'dua', 'tasbih', 'hafiz', 'qari', 'hifz', 'tilawat',
  'qirat', 'qiraat', 'hadith', 'hadees', 'taqwa', 'iman', 'umrah',
  'hajj', 'zakah', 'zakat', 'jannah', 'aqeedah', 'paak',
  // sufi kalam phrases / titles
  'qalandar', 'tajdar', 'tajdaar', 'ghaus', 'gause', 'ya ali',
  'ali ali', 'maula ali', 'mola ali', 'ali maula', 'ya hussain',
  'ya rasool', 'ya rasul', 'ya nabi', 'lam yati', 'mast qalandar',
  'jhoole laal', 'lal meri', 'sehwan', 'bulleh shah', 'bulleya',
  'sultan bahu', 'waris shah', 'kalam e', 'naat shareef', 'naat sharif',
  'mehfil e', 'shah e', 'ahle', 'ahl e', 'ziarat',
  // NOTE: 'darbar' marker me NAHI — Rajinikanth ki "Darbar" movie
  // ghalat pass ho jati (ajmer/khwaja/gharib nawaz already cover karte)
  // naat khawan / Islamic artists (jo YouTube par islamic content dete hain)
  'nusrat fateh', 'rahat fateh', 'abida parveen', 'sabri brothers',
  'amjad sabri', 'aziz mian', 'owais raza', 'hafiz ahmed raza',
  'zain zohaib', 'maher zain', 'sami yusuf',
  'zain bhikha', 'ahmed bukhatir', 'mesut kurtis', 'mishary',
  'abdul basit', 'abdul rahman al sudais', 'sudais', 'qawwal',
  'naat khawan', 'naatkwan', 'alhaj', 'naat academy', 'naat studio',
  'islamic video', 'islamic status',
]

function escapeTerm(t: string): string {
  return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function compileList(terms: string[]): RegExp {
  return new RegExp(`\\b(?:${terms.map(escapeTerm).join('|')})\\b`, 'i')
}

// ek dafa compile — har result par reuse
const RE_RELIGIOUS = compileList(RELIGIOUS_BLOCK)
const RE_ENTERTAINMENT = compileList(ENTERTAINMENT_BLOCK)
const RE_CHANNEL = compileList(CHANNEL_BLOCK)
const RE_ISLAMIC = compileList(ISLAMIC_MARKERS)

export function isBlockedResult(text: string): boolean {
  return RE_RELIGIOUS.test(text) || RE_ENTERTAINMENT.test(text) || RE_CHANNEL.test(text)
}

export function hasIslamicMarker(text: string): boolean {
  return RE_ISLAMIC.test(text)
}

/**
 * Search results ko paak karo:
 *  - hard-block (religious/film/channel) → hamesha drop
 *  - Islamic marker → hamesha keep
 *  - neutral → sirf non-strict queries me keep
 */
export function filterSearchResults(tracks: QalbTrack[], strict: boolean): QalbTrack[] {
  if (!tracks.length) return tracks
  return tracks.filter((t) => {
    const text = `${t.title ?? ''} ${t.artist ?? ''}`.toLowerCase()
    if (isBlockedResult(text)) return false
    if (hasIslamicMarker(text)) return true
    return !strict
  })
}
