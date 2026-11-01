'use client'

// Qalb — iTube SMART ALGORITHM (v0.5.3) — "YouTube jaisa dimaag"
// ─────────────────────────────────────────────────────────────────
// User request: sirf naat NAHI — SARE islamic videos ka smart mix, jo
// user dekhta hai usi ke hisab se suggestions, aur HAR BAR screen
// kholne par naye videos (ek jaisa video dobara na dikhe).
//
// Pipeline:
//   1. CLASSIFY   — har video ka category title+channel se (12Islamic
//                   categories: naat, qawwali, bayan, tilawat, history,
//                   informative, movies, kids…)
//   2. TASTE      — watch events (video kholne par record) se
//                   recency-weighted category + channel scores
//   3. QUERY PLAN — top categories se queries + exploration (jo kam
//                   dekha) + fresh/trending — har round me variant
//                   rotate hota hai (day-seed + salt) → naya mix
//   4. SCORE      — taste 55% + quality(views) 20% + recency 12% +
//                   exploration 13% + jitter (har bar alag order)
//   5. DIVERSITY  — ek hi category ki 3+ videos ek ke baad ek nahi —
//                   YouTube-jaisa mixed feed
//   6. REPEAT-KILL— jo feed me dikh chuke wo ring-buffer me — agli
//                   feed me nahi aate (jab tak pool khatam na ho)
//
// HONEST NOTE: YouTube apni watch-history kisi 3rd-party app ko nahi
// deta (API scope hi nahi) — isliye algorithm in-app watch events se
// chalta hai: jitna user iTube use karega, utna smart hoga.

import type { QalbTrack } from '@/lib/types'
import { videosToTracks, fallbackTracksFor, SP, type PageX } from '@/lib/innertube-x'
import { islamicOnly, itubeSearchX } from '@/lib/itube'
import { fetchChannelVideos, fetchRelatedVideos } from '@/lib/itube-channels'
import { mulberry32 } from '@/lib/daily-trending'

// ── Categories (classification + query pools) ───────────────────

export interface ItubeCat {
  key: string
  label: string
  queries: string[]
  words: string[]
}

export const ITUBE_CATS: ItubeCat[] = [
  {
    key: 'NAAT',
    label: 'Naat',
    queries: ['best naat sharif', 'new naat 2026', 'top naat collection', 'mashhoor naat sharif', 'madina naat', 'sad naat sharif'],
    words: ['naat', 'nat sharif', 'naat shareef', 'naatkhawan', 'naat khawan'],
  },
  {
    key: 'QAWWALI',
    label: 'Qawwali',
    queries: ['best qawwali', 'sufi qawwali live', 'mehfil e qawwali', 'qawwali 2026', 'classic qawwali', 'ajmer sharif qawwali'],
    words: ['qawwali', 'qawali', 'kawwali', 'kawali', 'qawwal', 'kawwal', 'mehfil e sama', 'sufi kalam'],
  },
  {
    key: 'HAMD',
    label: 'Hamd',
    queries: ['hamd e bari taala', 'best hamd', 'hamd 2026', 'khuda ke hamd'],
    words: ['hamd', 'hamad', 'sana e', 'hamd o sana'],
  },
  {
    key: 'NASHEED',
    label: 'Nasheed',
    queries: ['islamic nasheed', 'best nasheed', 'nasheed 2026', 'arabic nasheed'],
    words: ['nasheed', 'nashid', 'islamic song', 'vocal islamic'],
  },
  {
    key: 'TILAWAT',
    label: 'Tilawat',
    queries: ['beautiful quran tilawat', 'best qirat', 'heart touching recitation', 'quran tilawat 2026'],
    words: ['tilawat', 'tilavat', 'quran', 'quran e pak', 'surah', 'surat', 'qirat', 'qiraat', 'recitation', 'hifz', 'qari', 'mishary', 'sudais'],
  },
  {
    key: 'BAYAN',
    label: 'Bayan',
    queries: ['islamic bayan', 'molana bayan', 'best bayan 2026', 'juma ki bayan', 'waaz islamic'],
    words: ['bayan', 'bayaaan', 'waaz', 'waz ful', 'islamic lecture', 'taqreer', 'dars', 'molana', 'maulana', 'mufti', 'molvi', 'allama', 'tariq jameel', 'dr israr', 'menk', 'saqib raza'],
  },
  {
    key: 'HADITH',
    label: 'Hadith',
    queries: ['hadith sharif', 'hadees explanation', 'sunnah of prophet', 'sahih bukhari'],
    words: ['hadith', 'hadees', 'ahadees', 'sunnah', 'sunnat', 'bukhari', 'tirmizi', 'muslim sharif'],
  },
  {
    key: 'DUA',
    label: 'Dua',
    queries: ['beautiful dua', 'powerful dua', 'morning dua', 'dua e mashlool'],
    words: ['dua', 'supplication', 'istikhara', 'istighfar', 'astaghfar', 'manzil', 'ayat ul kursi', 'ayatul kursi', 'durood', 'darood'],
  },
  {
    key: 'HISTORY',
    label: 'Islamic History',
    queries: ['islamic history', 'waqia karbala', 'seerat un nabi', 'sahaba stories', 'islamic documentary'],
    words: ['waqia', 'waqiya', 'qissa', 'kissa', 'seerat', 'seerah', 'sahaba', 'ghazwa', 'islamic history', 'history of islam', 'documentary', 'hazrat', 'sultan', 'badshahi'],
  },
  {
    key: 'INFO',
    label: 'Informative',
    queries: ['islamic wazifa', 'islamic masail', 'islamic facts', 'khwab ki tabeer', 'islamic question answer', 'rohani ilaj'],
    words: ['wazifa', 'wazife', 'amal', 'masail', 'masla', 'fiqh', 'fatwa', 'ruling', 'sawal jawab', 'benefit', 'faida', 'fayde', 'rohani', 'ilaj', 'ilaaj', 'tabeer', 'khwab', 'dream', 'informative', 'facts', 'kaise', 'kyu', 'kyun', 'tarika', 'remedy'],
  },
  {
    key: 'KIDS',
    label: 'Islamic Kids',
    queries: ['islamic cartoon', 'kids nasheed', 'islamic stories for kids'],
    words: ['islamic cartoon', 'kids', 'bacchon', 'bachon', 'bacho ke', 'animation', 'children', 'nursery islamic'],
  },
  {
    key: 'MOVIES',
    label: 'Series & Movies',
    queries: ['islamic movie', 'islamic series', 'ertugrul ghazi', 'kurulus osman', 'hazrat yousuf movie', 'salahuddin ayubi series'],
    words: ['movie', 'film', 'drama', 'series', 'episode', 'ertugrul', 'kurulus', 'osman', 'alp arslan', 'yunus emre', 'salahuddin', 'yousuf', 'yusuf', 'season'],
  },
]

const CAT_BY_KEY = new Map(ITUBE_CATS.map((c) => [c.key, c]))

/** compiled word matchers — includes() fast + phrase safe */
const CAT_MATCHERS: { key: string; re: RegExp }[] = ITUBE_CATS.map((c) => ({
  key: c.key,
  re: new RegExp(
    `\\b(?:${c.words
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'))
      .join('|')})`,
    'i'
  ),
}))

/** Title + channel se video ka category — pehla match (order = specificity) */
export function classifyVideo(title: string, channel: string): string {
  const text = `${title} ${channel}`
  for (const m of CAT_MATCHERS) if (m.re.test(text)) return m.key
  return 'ISLAMIC'
}

export function catLabel(key: string): string {
  return CAT_BY_KEY.get(key)?.label ?? 'Islamic'
}

// ── Watch events (iTube apni alag history — video OPEN par) ─────

export interface ItubeEvent {
  v: string // videoId
  c: string // category
  a: string // channel
  t: number // epoch ms
  d?: number // seconds watched (close/switch par flush hota hai)
  cid?: string // v0.5.25 — channel UC… (personalized feed usi channel ki videos laata hai)
}

const EVENTS_KEY = 'qalb_itube_events_v1'
const SEEN_KEY = 'qalb_itube_seen_v1'
const MAX_EVENTS = 500
const MAX_SEEN = 160
const HALF_LIFE_DAYS = 14

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as T
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota — ignore */
  }
}

export function recordItubeWatch(track: QalbTrack) {
  if (typeof window === 'undefined' || !track.videoId) return
  const list = readJson<ItubeEvent[]>(EVENTS_KEY, [])
  const last = list[list.length - 1]
  if (last && last.v === track.videoId && Date.now() - last.t < 30_000) return
  list.push({
    v: track.videoId,
    c: track.category || 'ISLAMIC',
    a: track.artist ?? '',
    t: Date.now(),
    cid: track.tags?.match(/ch:(UC[\w-]+)/)?.[1],
  })
  writeJson(EVENTS_KEY, list.slice(-MAX_EVENTS))
}

/**
 * v0.5.15 — WATCH-TIME TRAINING: video band/switch hone par kitna dekha
 * (seconds) LAST event me flush karo. Jitna dekha utna strong signal —
 * sirf click-karke-chhod-dena kam weight rakhega.
 */
export function updateLastWatchDuration(seconds: number) {
  if (typeof window === 'undefined' || !Number.isFinite(seconds) || seconds < 3) return
  const list = readJson<ItubeEvent[]>(EVENTS_KEY, [])
  if (!list.length) return
  const last = list[list.length - 1]
  // 2 min ke andar wale last event hi update hoga (naye events beech me
  // aa gaye to galat entry ko touch nahi karenge)
  if (Date.now() - last.t > 120_000) return
  last.d = Math.max(last.d ?? 0, Math.min(3600, Math.round(seconds)))
  writeJson(EVENTS_KEY, list)
}

export function clearItubeEvents() {
  writeJson(EVENTS_KEY, [])
}

/** v0.5.25 — sabse aakhri watch event (personalized "usi hisaab se" feed
 *  ke liye: us video ke LIVE YT-related + usi channel ki latest videos) */
export function getLastWatchedEvent(): ItubeEvent | null {
  const list = readJson<ItubeEvent[]>(EVENTS_KEY, [])
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i]?.v) return list[i]
  }
  return null
}

// ── Taste profile (recency-weighted) ────────────────────────────

export interface ItubeTaste {
  catScores: [string, number][]
  topCats: string[]
  chanScores: [string, number][]
  watched: Set<string>
  events: number
}

export function getItubeTaste(): ItubeTaste {
  const events = readJson<ItubeEvent[]>(EVENTS_KEY, [])
  const now = Date.now()
  const cat = new Map<string, number>()
  const chan = new Map<string, number>()
  const watched = new Set<string>()
  for (const e of events) {
    const days = Math.max(0, (now - e.t) / 86_400_000)
    // v0.5.15: watch-time factor — jitna dekha utna zyada weight
    // (na khola → 1x, 90s dekha → 1x, 3+ min → 2x cap)
    const durF = e.d && e.d > 0 ? Math.min(2, 0.5 + e.d / 60) : 1
    const w = Math.exp(-days / HALF_LIFE_DAYS) * durF
    if (e.c) cat.set(e.c, (cat.get(e.c) ?? 0) + w)
    if (e.a) chan.set(e.a, (chan.get(e.a) ?? 0) + w)
    watched.add(e.v)
  }
  const desc = (m: Map<string, number>) =>
    [...m.entries()].sort((x, y) => y[1] - x[1])
  const catScores = desc(cat)
  return {
    catScores,
    topCats: catScores.slice(0, 4).map(([k]) => k),
    chanScores: desc(chan),
    watched,
    events: events.length,
  }
}

// ── Repeat-kill ring ("har bar naya video" guarantee) ───────────

export function getSeenIds(): string[] {
  return readJson<string[]>(SEEN_KEY, [])
}

/** Feed me dikh chuke videoIds ring me daalo (purane khud-ba-khud utarte hain) */
export function markShown(ids: string[]) {
  if (!ids.length) return
  const ring = [...getSeenIds(), ...ids]
  writeJson(SEEN_KEY, ring.slice(-MAX_SEEN))
}

/** pool ko seen se hatao — pool thna ho to purani seen entry chhod do */
export function splitSeen(pool: QalbTrack[]): { fresh: QalbTrack[]; reused: QalbTrack[] } {
  const seen = new Set(getSeenIds())
  const fresh: QalbTrack[] = []
  const reused: QalbTrack[] = []
  for (const t of pool) (seen.has(t.videoId) ? reused : fresh).push(t)
  return { fresh, reused }
}

export { hashStr }

// ── Feed builder ────────────────────────────────────────────────

function searchOnce(q: string, params: string): Promise<PageX | null> {
  // itube.ts ka wrapper — native par InnerTube direct, web par hosted route
  return itubeSearchX(q, params, null)
}

/** "3 days ago" → recency score 0..1 (aaj 1, saal purana 0) */
function recencyScore(published: string): number {
  const m = published.match(/(\d+)\s*(hour|minute|day|week|month|year)/i)
  if (!m) return 0.25 // unknown — middle
  const n = Number(m[1])
  switch (m[2].toLowerCase()) {
    case 'minute': return 1
    case 'hour': return 1
    case 'day': return Math.max(0.4, 1 - n / 10)
    case 'week': return Math.max(0.25, 0.7 - n / 15)
    case 'month': return Math.max(0.1, 0.4 - n / 20)
    default: return 0
  }
}

interface Planned {
  cat: string
  query: string
  explore: boolean
}

function planQueries(taste: ItubeTaste, salt: number): Planned[] {
  const rnd = mulberry32(Math.floor(Date.now() / 3_600_000) + salt * 7919)
  const poolFor = (key: string) => CAT_BY_KEY.get(key)?.queries ?? ['islamic video']
  const pick = (key: string, i: number) =>
    poolFor(key)[Math.floor(rnd() * 1000 + i + salt) % poolFor(key).length]

  const plans: Planned[] = []
  const scored = taste.catScores.filter(([k]) => CAT_BY_KEY.has(k))

  if (taste.events < 5 || scored.length === 0) {
    // COLD START — balanced explore: har baar alag 5 categories.
    // v0.5.25: aadhe plans views-sort (explore:false → SP.views) —
    // naye user ko bhi FAMOUS content pehle dikhe (naat/qawwali ke
    // legends), aadhe videoOnly (chhoti channels ka discovery bhi)
    const rot = [...ITUBE_CATS.keys()]
    const start = Math.floor(rnd() * rot.length)
    for (let i = 0; i < 5; i++) {
      const cat = ITUBE_CATS[(start + i * 2 + salt) % ITUBE_CATS.length].key
      plans.push({ cat, query: pick(cat, i), explore: i % 2 !== 0 })
    }
    return plans
  }

  // WARM — top categories user ki pasand se, variant rotate
  const top = scored.slice(0, 3).map(([k]) => k)
  top.forEach((cat, i) => plans.push({ cat, query: pick(cat, i), explore: false }))

  // +1 mid interest (rank 3-6)
  const mid = scored[3 + (salt % 2)]?.[0]
  if (mid && !top.includes(mid)) plans.push({ cat: mid, query: pick(mid, 3), explore: false })

  // +1 EXPLORATION — jo user ne kam/kabhi nahi dekha (watch time badhe)
  const known = new Set(scored.slice(0, 5).map(([k]) => k))
  const strangers = ITUBE_CATS.filter((c) => !known.has(c.key))
  if (strangers.length) {
    const pickCat = strangers[Math.floor(rnd() * 1000 + salt) % strangers.length]
    plans.push({ cat: pickCat.key, query: pick(pickCat.key, 4), explore: true })
  }

  // +1 FRESH — is hafte ka naya islamic content
  plans.push({ cat: 'ISLAMIC', query: 'islamic video viral', explore: true })

  return plans
}

function scoreTracks(pool: QalbTrack[], taste: ItubeTaste, salt: number): QalbTrack[] {
  const maxCat = Math.max(1, taste.catScores[0]?.[1] ?? 1)
  const catW = new Map(taste.catScores.map(([k, v]) => [k, v / maxCat]))
  const top3 = new Set(taste.catScores.slice(0, 3).map(([k]) => k))

  const scored = pool.map((t) => {
    const tasteScore = taste.events < 5 ? 0.5 : (catW.get(t.category) ?? 0.12)
    const views = t.playCount ?? 0
    const quality = Math.min(1, Math.log10(views + 1) / 9)
    const recency = recencyScore(t.tags?.match(/pub:([^|]+)/)?.[1] ?? '')
    const explore = top3.has(t.category) || taste.events < 5 ? 0 : 0.5
    const chanFresh = taste.chanScores.some(([a]) => t.artist && a === t.artist) ? 0 : 0.08
    const jitter = mulberry32(hashStr(t.videoId + salt))()
    // v0.5.25 — famous-first: quality 0.2 → 0.3, jitter 0.18 → 0.06.
    // Pehle random-jitter zyada tha — isliye 10K-views wale naat famous
    // 100M walo se upar aa jate the (user complaint). Ab views bhi
    // quality ke barabar weight rakhti hai.
    const final =
      0.5 * tasteScore + 0.3 * quality + 0.06 * recency + 0.08 * (explore + chanFresh) + 0.06 * jitter
    return { t, final }
  })

  scored.sort((a, b) => b.final - a.final)
  let ranked = scored.map((s) => s.t)

  // DIVERSITY PASS — ek hi category ke max 2 lagatar (YouTube-jaisa mix)
  ranked = diversityPass(ranked, 2)
  return ranked
}

function diversityPass(list: QalbTrack[], maxRun: number): QalbTrack[] {
  const out: QalbTrack[] = []
  const rest = [...list]
  while (rest.length) {
    const lastCat = out.slice(-maxRun).map((t) => t.category)
    const blocked = new Set(lastCat)
    const idx = rest.findIndex((t) => !blocked.has(t.category))
    out.push(rest.splice(idx === -1 ? 0 : idx, 1)[0])
  }
  return out
}

function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export interface ItubeFeedResult {
  tracks: QalbTrack[]
  /** kitne events (watch history) se personalized hua — 0 = cold start */
  tasteEvents: number
}

/** v0.5.25 — sabse zyada dekha gaya channel (cid wala) — personalized
 *  feed usi channel ki latest videos bhi mila deta hai (YouTube-jaisa
 *  "aap ke channels se") */
function topWatchedChannel(): { cid: string; name: string } | null {
  const events = readJson<ItubeEvent[]>(EVENTS_KEY, [])
  const now = Date.now()
  const score = new Map<string, { w: number; name: string }>()
  for (const e of events) {
    if (!e.cid) continue
    const days = Math.max(0, (now - e.t) / 86_400_000)
    const durF = e.d && e.d > 0 ? Math.min(2, 0.5 + e.d / 60) : 1
    const w = Math.exp(-days / HALF_LIFE_DAYS) * durF
    const prev = score.get(e.cid)
    if (prev) prev.w += w
    else score.set(e.cid, { w, name: e.a || '' })
  }
  let best: { cid: string; name: string; w: number } | null = null
  for (const [cid, s] of score) {
    if (!best || s.w > best.w) best = { cid, name: s.name, w: s.w }
  }
  return best ? { cid: best.cid, name: best.name } : null
}

/**
 * iTube "Aap ke liye" feed — HAR CALL par naya mix:
 * taste queries + exploration + fresh, classify → score → diversity.
 * Repeat-kill view-side markShown() se hota hai (yahan sirf ranking).
 *
 * v0.5.25 — ASLI PERSONALIZATION (user report: "jo hum dekh rahe hai
 * contents us hisaab se nahi aaraha hai"). Generic taste-queries ke
 * SAATH ab do real signals bhi:
 *   (1) aakhri dekhi video ke LIVE YouTube related (next endpoint) —
 *       "is video ke baad log ye dekhte hain"
 *   (2) sabse zyada dekhe channel ki latest videos (browse endpoint)
 * Warm taste-queries ab VIEWS-SORT se chalti hain — pasand ki category
 * ke FAMOUS videos pehle aati hain.
 */
export async function buildItubeFeed(salt = 0): Promise<ItubeFeedResult> {
  const taste = getItubeTaste()
  const plans = planQueries(taste, salt)

  // v0.5.25 — warm queries views-sort (famous in taste), explore
  // videoOnly, fresh week (pehle jaisa)
  const settled = await Promise.allSettled(
    plans.map((p) =>
      searchOnce(p.query, p.cat === 'ISLAMIC' ? SP.week : p.explore ? SP.videoOnly : SP.views)
    )
  )

  // v0.5.25 — personalization fetches (last watched related + top channel)
  const lastEv = getLastWatchedEvent()
  const topChan = topWatchedChannel()
  const personal = await Promise.allSettled([
    lastEv?.v ? fetchRelatedVideos(lastEv.v, null) : Promise.resolve(null),
    topChan ? fetchChannelVideos(topChan.cid, null, topChan.name) : Promise.resolve(null),
  ])

  // sab fetches merge + dedupe (zyada views wali entry rakho)
  const byId = new Map<string, QalbTrack>()
  const mergeTracks = (tracks: QalbTrack[]) => {
    for (const track of tracks) {
      if (!track.videoId) continue
      const prev = byId.get(track.videoId)
      if (!prev || (track.playCount ?? 0) > (prev.playCount ?? 0)) byId.set(track.videoId, track)
    }
  }
  for (const r of settled) {
    if (r.status === 'fulfilled' && r.value) mergeTracks(videosToTracks(r.value.videos, 'itube'))
  }
  // personalized — aakhri video ke related (top 12) + top channel (top 8)
  const rel = personal[0].status === 'fulfilled' ? personal[0].value : null
  const chan = personal[1].status === 'fulfilled' ? personal[1].value : null
  if (rel?.tracks.length) mergeTracks(rel.tracks.slice(0, 12))
  if (chan?.tracks.length) mergeTracks(chan.tracks.slice(0, 8))

  // real category set karo + paak filter
  let pool = [...byId.values()].map((t) => ({
    ...t,
    category: classifyVideo(t.title, t.artist),
  }))
  pool = islamicOnly(pool)

  // network fail → trending pool fallback (app kabhi khali nahi)
  if (pool.length < 8) {
    pool = islamicOnly(fallbackTracksFor('islamic', 24))
  }

  const ranked = scoreTracks(pool, taste, salt)
  return { tracks: ranked, tasteEvents: taste.events }
}

/**
 * Watch-screen "Aage dekhein" — current video ke hisab se + user taste:
 * same category pehle, phir user ki pasand, phir baaki (mix guarantee).
 */
export function rankRelated(current: QalbTrack, pool: QalbTrack[], taste = getItubeTaste()): QalbTrack[] {
  const maxCat = Math.max(1, taste.catScores[0]?.[1] ?? 1)
  const catW = new Map(taste.catScores.map(([k, v]) => [k, v / maxCat]))
  const seenIds = new Set(getSeenIds())

  const scored = pool
    .filter((t) => t.videoId && t.videoId !== current.videoId)
    .map((t) => {
      const catMatch = t.category === current.category ? 0.55 : 0
      const tasteScore = catW.get(t.category) ?? 0.1
      const quality = Math.min(1, Math.log10((t.playCount ?? 0) + 1) / 9)
      const unseen = seenIds.has(t.videoId) ? 0 : 0.12
      // jitter per (current, candidate) pair — stable jab tak wahi video khuli hai
      const jitter = mulberry32(hashStr(t.videoId + current.videoId))()
      return { t, s: catMatch + 0.3 * tasteScore + 0.15 * quality + unseen + 0.2 * jitter }
    })
    .sort((a, b) => b.s - a.s)

  const ranked = scored.map((s) => s.t)
  return diversityPass(ranked, 3)
}
