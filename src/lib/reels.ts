// Qalb — Islamic Reels data layer (v0.2.6)
// ─────────────────────────────────────────────────────────────────
// INSTAGRAM-STYLE MIX FEED (v0.2.6):
//   • Sab categories (bayan/naat/status/info) EK hi feed me mix —
//     koi filter chips nahi, seedha Instagram jaisa full-screen swipe
//   • INTEREST ALGORITHM: jis category ko user zyada dekhta hai uski
//     reels zyada dikhti hain (watch stats localStorage — smooth
//     weighted round-robin se feed order banta hai)
//   • REPEAT BLOCK: jis reel ko user 2.5s+ dekh chuka wo dobara nahi
//     aati — jab tak fresh pool na mile. Pool khatam → seen reset
//   • INFINITE: feed ke end se pehle background me next batch load
//     (rotating queries — har batch alag, koi duplicate nahi)
//
// 9:16 GUARANTEE: youtubeShortsSearch() sirf shortsLockupViewModel
// items uthata hai — YouTube khud inme sirf vertical Shorts rakhta hai.
//
// OFFLINE DOWNLOAD: InnerTube player endpoint (ANDROID client, IOS
// fallback) se progressive mp4 stream URL → native plugin MediaStore
// me save hota hai (Gallery → Movies → Qalb).
//
// LIKES: `reelMeta/likes` doc — increment transform (atomic).

import { QALB } from '@/lib/qalb'
import { withNetTimeout } from '@/lib/remote-data'
import { innertubePostJson, youtubeShortsSearch, type RawShort } from '@/lib/youtube-search-source'
import { isNativeApp } from '@/plugins/qalb-native'

export interface ReelItem {
  videoId: string
  title: string
  views: string // "42K views" / channel name
  category: string // bayan | naat | status | info
  source: 'curated' | 'auto'
  thumb: string
}

// ── categories + query pools (rotation se har load alag batch) ──

const CATEGORIES = ['bayan', 'naat', 'status', 'info'] as const

const REEL_QUERIES: Record<string, string[]> = {
  bayan: [
    'sunni bayan',
    'sunni ulama bayan',
    'islamic bayan short video',
    'sunni scholar bayan shorts',
    'islamic waaz shorts',
    'deeni bayan status',
  ],
  naat: [
    'naat status',
    'naat sharif status',
    'naat shorts',
    'new naat status',
    'urdu naat short video',
    'naat e rasool status',
  ],
  status: [
    'islamic status video',
    'islamic whatsapp status',
    'islamic status shorts',
    'allah status video',
    'islamic quote status',
    'deen status shorts',
  ],
  info: [
    'islamic informative video',
    'islamic reminder shorts',
    'islamic facts shorts',
    'deeni maloomat short',
    'islamic info shorts',
    'islamic knowledge video',
  ],
}

const AUTO_PER_CATEGORY = 12
const CACHE_KEY = 'qalb_reels_cache_v1'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6 ghante
const SEEN_KEY = 'qalb_reel_seen_v1'
const SEEN_CAP = 500
const STATS_KEY = 'qalb_reel_watch_v1'
const QROT_KEY = 'qalb_reel_qrot_v1'
const DL_KEY = 'qalb_reel_downloads_v1'
// v0.3.1: pichle session ke top reels — naye session me sabse NEECHE bhejte
// hain (user rule: app kholte hi pehli reel hamesha nayi ho)
const LAST_TOP_KEY = 'qalb_reel_lasttop_v1'
// module-load = naya session (app kill → WebView naya process)
let sessionFeedBuilt = false

// ── Firestore REST (public-read pattern — remote-data.ts jaisa) ──

const FS_BASE = () =>
  `https://firestore.googleapis.com/v1/projects/${QALB.firebaseProjectId}/databases/(default)/documents`

type FSValue = Record<string, unknown>
type FSDoc = { name?: string; fields?: Record<string, FSValue> }

function unwrap(v: FSValue | undefined): unknown {
  if (!v) return null
  if ('stringValue' in v) return v.stringValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return Number(v.doubleValue)
  if ('booleanValue' in v) return v.booleanValue
  if ('mapValue' in v) {
    const fields = (v.mapValue as { fields?: Record<string, FSValue> }).fields ?? {}
    return Object.fromEntries(Object.entries(fields).map(([k, val]) => [k, unwrap(val)]))
  }
  if ('arrayValue' in v) {
    const vals = (v.arrayValue as { values?: FSValue[] }).values ?? []
    return vals.map(unwrap)
  }
  return null
}

function unwrapDoc(doc: FSDoc): Record<string, unknown> & { id: string } {
  const fields = doc.fields ?? {}
  const flat = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, unwrap(v)]))
  const id = doc.name?.split('/').pop() ?? ''
  return { ...flat, id }
}

async function fsList(collectionId: string): Promise<FSDoc[]> {
  const res = await withNetTimeout(
    fetch(`${FS_BASE()}/${collectionId}?pageSize=200`, { cache: 'no-store' })
  )
  if (!res.ok) throw new Error(`reels fs ${collectionId}: ${res.status}`)
  const json = (await res.json()) as { documents?: FSDoc[] }
  return json.documents ?? []
}

async function fsGet(collectionId: string, docId: string): Promise<FSDoc | null> {
  const res = await withNetTimeout(fetch(`${FS_BASE()}/${collectionId}/${docId}`, { cache: 'no-store' }))
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`reels fs ${collectionId}/${docId}: ${res.status}`)
  return (await res.json()) as FSDoc
}

async function getBlockedIds(): Promise<Set<string>> {
  return fsGet('reelConfig', 'blocked')
    .then((d) => {
      const ids = d ? ((unwrap(d.fields?.ids) as string[] | null) ?? []) : []
      return new Set(ids.filter((x) => typeof x === 'string'))
    })
    .catch(() => new Set<string>())
}

// ── curated reels (Firestore `reels` collection) ─────────────────

function toCuratedReel(raw: Record<string, unknown>): ReelItem | null {
  const videoId = String(raw.videoId ?? '').trim()
  if (!videoId) return null
  const active = raw.active === undefined ? true : Boolean(raw.active)
  if (!active) return null
  const category = (CATEGORIES as readonly string[]).includes(String(raw.category))
    ? String(raw.category)
    : 'naat'
  return {
    videoId,
    title: String(raw.title ?? 'Qalb Reel'),
    views: String(raw.channel ?? 'Qalb • Pinned'),
    category,
    source: 'curated',
    thumb: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  }
}

// ── auto reels (YouTube Shorts — guaranteed 9:16) ────────────────

/**
 * Shorts search routing:
 *   native (APK) → direct InnerTube (CapacitorHttp — CORS bypass)
 *   web/hosted   → /api/youtube-search?shorts=1 (server-side InnerTube)
 *                  apiBase na ho (static preview) → direct (fail → [])
 */
async function shortsSearch(q: string): Promise<RawShort[]> {
  if (isNativeApp()) {
    const direct = await youtubeShortsSearch(q).catch(() => [] as RawShort[])
    if (direct.length) return direct
  }
  if (QALB.apiBase) {
    try {
      const res = await withNetTimeout(
        fetch(`${QALB.apiBase}/api/youtube-search?shorts=1&q=${encodeURIComponent(q)}`, {
          cache: 'no-store',
        }),
        12_000
      )
      if (res.ok) {
        const json = (await res.json()) as { shorts?: RawShort[] }
        if (Array.isArray(json.shorts)) return json.shorts
      }
    } catch {
      /* fallback below */
    }
  }
  if (!isNativeApp()) return youtubeShortsSearch(q)
  return []
}

// query rotation — har fetch cycle me har category ki NEXT query
function getRot(): number {
  try {
    return Number(localStorage.getItem(QROT_KEY) ?? '0') || 0
  } catch {
    return 0
  }
}

function bumpRot() {
  try {
    localStorage.setItem(QROT_KEY, String(getRot() + 1))
  } catch {
    /* private mode */
  }
}

function rotatingQuery(category: string): string {
  const pool = REEL_QUERIES[category] ?? []
  if (!pool.length) return ''
  const idx = (getRot() + CATEGORIES.indexOf(category as (typeof CATEGORIES)[number])) % pool.length
  return pool[idx] ?? pool[0]
}

async function autoReelsForCategory(
  category: string,
  blocked: Set<string>,
  exclude: Set<string>
): Promise<ReelItem[]> {
  const q = rotatingQuery(category)
  if (!q) return []
  const shorts = await shortsSearch(q).catch(() => [] as RawShort[])
  const out: ReelItem[] = []
  for (const s of shorts) {
    if (out.length >= AUTO_PER_CATEGORY) break
    if (exclude.has(s.videoId) || blocked.has(s.videoId)) continue
    out.push({
      videoId: s.videoId,
      title: s.title,
      views: s.views || 'Short',
      category,
      source: 'auto',
      thumb: `https://i.ytimg.com/vi/${s.videoId}/hqdefault.jpg`,
    })
  }
  return out
}

function dedupeById(items: ReelItem[]): ReelItem[] {
  const seen = new Set<string>()
  const out: ReelItem[] = []
  for (const it of items) {
    // v0.2.7: undefined/null/garbage entries kahin se bhi aa jayein — feed me ja hi nahi sakti
    if (!it || typeof it !== 'object' || !it.videoId) continue
    if (seen.has(it.videoId)) continue
    seen.add(it.videoId)
    out.push(it)
  }
  return out
}

// ── INTEREST ALGORITHM ───────────────────────────────────────────
// Watch stats (localStorage): { category: kitni baar dekhi }
// Smooth weighted round-robin — weight(c) = 1 + watches(c).
// Zyada dekhne wali category ke items feed me baar-baar ghus te hain,
// baaki categories bhi chalte rehti hain (koi category gayab nahi).

type WatchStats = Record<string, number>

function getWatchStats(): WatchStats {
  try {
    const raw = localStorage.getItem(STATS_KEY)
    const obj = raw ? (JSON.parse(raw) as WatchStats) : {}
    return obj && typeof obj === 'object' ? obj : {}
  } catch {
    return {}
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function applyInterestOrder(items: ReelItem[]): ReelItem[] {
  const stats = getWatchStats()
  const groups = new Map<string, ReelItem[]>()
  for (const c of CATEGORIES) groups.set(c, shuffle(items.filter((i) => i.category === c)))
  // baaki (unknown) categories bhi mix me rakhо — bina unke curated kho jayega
  const others = shuffle(items.filter((i) => !(CATEGORIES as readonly string[]).includes(i.category)))
  if (others.length) groups.set('__other', others)

  const picked: Record<string, number> = {}
  const weight = (c: string) => 1 + (stats[c] ?? 0)
  const out: ReelItem[] = []
  const total = items.length
  while (out.length < total) {
    let best: string | null = null
    let bestScore = -1
    for (const c of groups.keys()) {
      const g = groups.get(c)!
      const pi = picked[c] ?? 0
      if (pi >= g.length) continue
      const score = weight(c) / (pi + 1)
      if (score > bestScore) {
        bestScore = score
        best = c
      }
    }
    if (!best) break
    // v0.2.7 FIX: picked[best] pehle initialize karo — `undefined++` = NaN
    // hota hai aur NaN index se `undefined` feed me ghus ke crash karta tha
    const idx = picked[best] ?? 0
    const g = groups.get(best)!
    if (!g[idx]) break // safety — kabhi undefined push na ho
    out.push(g[idx])
    picked[best] = idx + 1
  }
  return out.filter((r): r is ReelItem => Boolean(r && r.videoId))
}

/** Reel 2.5s+ dekhi gayi → seen mark + category interest badhao */
export function recordReelWatch(videoId: string, category: string) {
  try {
    // seen set (repeat block)
    const seen = getSeenReels()
    seen.add(videoId)
    const arr = [...seen]
    const trimmed = arr.slice(Math.max(0, arr.length - SEEN_CAP))
    localStorage.setItem(SEEN_KEY, JSON.stringify(trimmed))
  } catch {
    /* private mode */
  }
  try {
    const stats = getWatchStats()
    stats[category] = (stats[category] ?? 0) + 1
    localStorage.setItem(STATS_KEY, JSON.stringify(stats))
  } catch {
    /* private mode */
  }
}

function getSeenReels(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    const arr = raw ? (JSON.parse(raw) as string[]) : []
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

function clearSeen() {
  try {
    localStorage.removeItem(SEEN_KEY)
  } catch {
    /* ignore */
  }
}

// ── feed load (cache-first → instant; seen-filter; fresh pool) ──

interface ReelsCache {
  ts: number
  items: ReelItem[]
}

function readCache(): ReelItem[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const cached = JSON.parse(raw) as ReelsCache
    if (cached?.ts && Date.now() - cached.ts < CACHE_TTL_MS && Array.isArray(cached.items)) {
      return cached.items
    }
  } catch {
    /* cache corrupt → fresh load */
  }
  return null
}

function writeCache(items: ReelItem[]) {
  if (!items.length) return // KHAALI feed cache NAHI (failed load 6h tak na dikhe)
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), items } satisfies ReelsCache))
  } catch {
    /* storage full */
  }
}

async function fetchPool(seen: Set<string>): Promise<ReelItem[]> {
  bumpRot() // agli baar ke liye queries rotate
  const blocked = await getBlockedIds()
  const [reelsDocs] = await Promise.all([fsList('reels').catch(() => [] as FSDoc[])])
  const curated = reelsDocs
    .map(unwrapDoc)
    .filter((d) => {
      if (!String(d.videoId ?? '').trim()) return false
      if (blocked.has(String(d.videoId))) return false
      return d.active === undefined ? true : Boolean(d.active)
    })
    .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
    .map(toCuratedReel)
    .filter((r): r is ReelItem => r !== null)
  const exclude = new Set<string>([...seen, ...blocked])
  for (const c of curated) exclude.add(c.videoId)

  const groups = await Promise.all(CATEGORIES.map((c) => autoReelsForCategory(c, blocked, exclude)))
  return dedupeById([...curated, ...groups.flat()])
}

export interface ReelsFeed {
  items: ReelItem[]
}

/**
 * Feed load — INSTAGRAM STYLE:
 *  1. cache se pool → dekhi hui reels hatao → interest order
 *  2. cache pool khatam (sab dekh li) → fresh network pool
 *  3. network fail → purana cache (repeat allowed, khali se behtar)
 */
/**
 * v0.3.1 — Naye session ki pehli feed me pichle session ke top reels ko
 * sabse neeche bhejo (har app-open par pehli reel NAYI lage).
 */
function demoteLastTop(items: ReelItem[]): ReelItem[] {
  try {
    if (sessionFeedBuilt) return items // isi session me feed ban chuki — koi demote nahi
    sessionFeedBuilt = true
    const raw = localStorage.getItem(LAST_TOP_KEY)
    const lastTop: string[] = raw ? (JSON.parse(raw) as string[]) : []
    if (!Array.isArray(lastTop) || !lastTop.length) return items
    const top = new Set(lastTop.filter((x) => typeof x === 'string'))
    if (!top.size) return items
    const front = items.filter((i) => !top.has(i.videoId))
    const back = items.filter((i) => top.has(i.videoId))
    return [...front, ...back]
  } catch {
    return items
  }
}

function saveLastTop(items: ReelItem[]) {
  try {
    localStorage.setItem(
      LAST_TOP_KEY,
      JSON.stringify(items.slice(0, 3).map((i) => i.videoId))
    )
  } catch {
    /* private mode */
  }
}

export async function getReels(): Promise<ReelsFeed> {
  const seen = getSeenReels()
  const cached = readCache()
  let pool: ReelItem[] | null = null

  if (cached) {
    // v0.2.7: cached pool me corrupt/undefined entries ho to bhi safe
    const clean = cached.filter(
      (i): i is ReelItem => Boolean(i && typeof i === 'object' && i.videoId)
    )
    const usable = dedupeById(clean.filter((i) => !seen.has(i.videoId)))
    if (usable.length >= 8) pool = usable
    // pool khatam — niche fresh network load hoga
  }

  if (!pool) {
    try {
      const fresh = await fetchPool(seen)
      if (fresh.length > 0) {
        writeCache(fresh)
        pool = fresh
      }
    } catch {
      /* network fail → niche cache fallback */
    }
  }

  if (!pool && cached?.length) {
    // v0.3.1 FIX (repeat-reel bug): network fail par seen WIPE NAHI karte —
    // pehle wahi reels dobara dikhna shuru ho jati thi. Jitne unseen bache
    // hain wahi dikhao; sach me sab dekh liye to hi repeat (order shuffled).
    const unseen = dedupeById(cached.filter((i) => !seen.has(i.videoId)))
    if (unseen.length >= 8) {
      pool = unseen
    } else {
      clearSeen()
      pool = dedupeById(cached)
    }
  }

  if (!pool || !pool.length) return { items: [] }
  const items = demoteLastTop(applyInterestOrder(pool))
  saveLastTop(items)
  return { items }
}

/**
 * INFINITE feed — end se 4 reel pehle next batch silently load.
 * Rotating queries + seen∪current exclusion = koi duplicate nahi.
 */
export async function loadMoreReels(current: ReelItem[]): Promise<ReelItem[]> {
  const seen = getSeenReels()
  const blocked = await getBlockedIds()
  const exclude = new Set<string>([...seen, ...blocked, ...current.map((i) => i.videoId)])
  bumpRot()
  const groups = await Promise.all(CATEGORIES.map((c) => autoReelsForCategory(c, blocked, exclude)))
  const more = dedupeById(groups.flat()).filter((m) => !exclude.has(m.videoId))
  if (more.length) {
    // cache pool bhi badhao (agla boot isi pool se chalega)
    const cached = readCache() ?? []
    writeCache(dedupeById([...cached, ...more]).slice(0, 150))
  }
  return applyInterestOrder(more)
}

/** Cache force-clear (pull-to-refresh / retry ke liye) */
export function clearReelsCache() {
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    /* ignore */
  }
}

// ── likes (global count — reelMeta/likes) ────────────────────────

const LIKED_KEY = 'qalb_reel_likes'

/** Mere liked reels (per-device, localStorage) */
export function getMyLikedReels(): Set<string> {
  try {
    const raw = localStorage.getItem(LIKED_KEY)
    const arr = raw ? (JSON.parse(raw) as string[]) : []
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

export function setReelLiked(videoId: string, liked: boolean) {
  try {
    const set = getMyLikedReels()
    if (liked) set.add(videoId)
    else set.delete(videoId)
    localStorage.setItem(LIKED_KEY, JSON.stringify([...set]))
  } catch {
    /* private mode */
  }
}

/** Global like counts read — { videoId: count } */
export async function getLikeCounts(): Promise<Record<string, number>> {
  const doc = await fsGet('reelMeta', 'likes')
  if (!doc) return {}
  const map = unwrap(doc.fields?.likes)
  if (!map || typeof map !== 'object') return {}
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(map as Record<string, unknown>)) {
    out[k] = Number(v ?? 0)
  }
  return out
}

/**
 * Like/unlike — Firestore increment transform (atomic).
 * Rules publish hone tak ye fail ho sakta hai — silent (local count hi dikhega).
 */
export async function likeReelRemote(videoId: string, delta: 1 | -1): Promise<void> {
  // fieldPath me videoId backtick-quoted (videoId me `-` hota hai)
  const fieldPath = `likes.\`${videoId}\``
  const res = await withNetTimeout(
    fetch(`${FS_BASE()}:commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        writes: [
          {
            transform: {
              document: `projects/${QALB.firebaseProjectId}/databases/(default)/documents/reelMeta/likes`,
              fieldTransforms: [{ fieldPath, increment: { integerValue: String(delta) } }],
            },
          },
        ],
      }),
    }),
    10_000
  )
  if (!res.ok) throw new Error(`reel like: ${res.status}`)
}

// ── OFFLINE DOWNLOAD (native APK — MediaStore Movies/Qalb) ───────

/**
 * Reel ka progressive mp4 (360p, video+audio ek file) stream URL.
 * InnerTube player endpoint — ANDROID client pehle (clean URLs),
 * IOS fallback. Fail hone par null (UI "abhi download nahi ho sakti").
 */
const CLIENT_TRIES = [
  {
    key: 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w',
    headers: {
      'User-Agent': 'com.google.android.youtube/19.09.37 (Linux; U; Android 14) gzip',
      'X-YouTube-Client-Name': '3',
      'X-YouTube-Client-Version': '19.09.37',
    },
    client: {
      clientName: 'ANDROID',
      clientVersion: '19.09.37',
      androidSdkVersion: 34,
      hl: 'en',
      gl: 'IN',
    },
  },
  {
    key: 'AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc',
    headers: {
      'User-Agent': 'com.google.ios.youtube/19.09.3 (iPhone14,3; U; CPU iOS 15_6 like Mac OS X) gzip',
      'X-YouTube-Client-Name': '5',
      'X-YouTube-Client-Version': '19.09.3',
    },
    client: {
      clientName: 'IOS',
      clientVersion: '19.09.3',
      deviceModel: 'iPhone14,3',
      hl: 'en',
      gl: 'IN',
    },
  },
]

/* eslint-disable @typescript-eslint/no-explicit-any */

function pickStreamUrl(data: any): string | null {
  const formats = data?.streamingData?.formats
  if (!Array.isArray(formats)) return null
  const usable = formats.filter(
    (f: any) => f && typeof f.url === 'string' && String(f.mimeType ?? '').includes('mp4')
  )
  if (!usable.length) return null
  // itag 18 = 360p mp4 (video+audio) — reels ke liye perfect size
  const pick18 = usable.find((f: any) => f.itag === 18)
  const pick22 = usable.find((f: any) => f.itag === 22)
  return String((pick18 ?? pick22 ?? usable[0]).url)
}

export async function getReelStreamUrl(videoId: string): Promise<string | null> {
  for (const t of CLIENT_TRIES) {
    const data = await innertubePostJson(
      `https://www.youtube.com/youtubei/v1/player?key=${t.key}&prettyPrint=false`,
      t.headers,
      {
        context: { client: t.client },
        videoId,
        contentCheckOk: true,
        racyCheckOk: true,
      }
    ).catch(() => null)
    if (!data) continue
    const status = String(data?.playabilityStatus?.status ?? '')
    if (status && status !== 'OK') continue
    const url = pickStreamUrl(data)
    if (url) return url
  }
  return null
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ── downloaded registry (per-device) ─────────────────────────────

export function getDownloadedReels(): Set<string> {
  try {
    const raw = localStorage.getItem(DL_KEY)
    const arr = raw ? (JSON.parse(raw) as string[]) : []
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

export function markReelDownloaded(videoId: string) {
  try {
    const set = getDownloadedReels()
    set.add(videoId)
    localStorage.setItem(DL_KEY, JSON.stringify([...set]))
  } catch {
    /* private mode */
  }
}
