// Qalb — Islamic Reels data layer (v0.2.5)
// ─────────────────────────────────────────────────────────────────
// HYBRID content strategy (user approved):
//   1. Firestore `reels` collection  → aapki curated/pinned reels (sabse upar)
//   2. YouTube Shorts auto-fill      → har category ke Islamic queries
//
// 9:16 GUARANTEE (jugad, tested): youtubeShortsSearch() sirf
// shortsLockupViewModel items uthata hai — ye YouTube Shorts shelf se
// aate hain, YouTube khud inme sirf vertical Shorts hi rakhta hai.
// Landscape videos feed me aa hi nahi sakte.
//
// ISLAMIC GUARANTEE: queries sirf Islamic terms ki hain + `reelConfig/blocked`
// doc me jo videoId aap daalo wo hamesha filter ho jayega.
//
// LIKES: `reelMeta/likes` doc — map { videoId: count } — increment transform
// se atomic update (rules publish hone ke baad global counts chalege).

import { QALB } from '@/lib/qalb'
import { withNetTimeout } from '@/lib/remote-data'
import { youtubeShortsSearch, type RawShort } from '@/lib/youtube-search-source'
import { isNativeApp } from '@/plugins/qalb-native'

export interface ReelItem {
  videoId: string
  title: string
  views: string // "42K views" / channel name
  category: string // bayan | naat | status | info
  source: 'curated' | 'auto'
  thumb: string
}

// ── category queries (sirf Islamic — har query test ki hui hai) ──

const REEL_QUERIES: Record<string, string[]> = {
  bayan: ['sunni bayan', 'sunni ulama bayan', 'islamic bayan short video'],
  naat: ['naat status', 'naat sharif status', 'naat shorts'],
  status: ['islamic status video', 'islamic whatsapp status', 'islamic status shorts'],
  info: ['islamic informative video', 'islamic reminder shorts', 'islamic facts shorts'],
}

export const REEL_CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'bayan', label: 'Bayan' },
  { key: 'naat', label: 'Naat' },
  { key: 'status', label: 'Status' },
  { key: 'info', label: 'Info' },
]

const AUTO_PER_CATEGORY = 12 // feed size balanced rakhta hai (data bachao)
const CACHE_KEY = 'qalb_reels_cache_v1'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6 ghante

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

// ── curated reels (Firestore `reels` collection) ─────────────────

function toCuratedReel(raw: Record<string, unknown>): ReelItem | null {
  const videoId = String(raw.videoId ?? '').trim()
  if (!videoId) return null
  const active = raw.active === undefined ? true : Boolean(raw.active)
  if (!active) return null
  const category = ['bayan', 'naat', 'status', 'info'].includes(String(raw.category))
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

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] ?? arr[0]
}

async function autoReelsForCategory(
  category: string,
  blocked: Set<string>,
  seen: Set<string>
): Promise<ReelItem[]> {
  const queries = REEL_QUERIES[category]
  if (!queries?.length) return []
  const shorts = await shortsSearch(pick(queries)).catch(() => [] as RawShort[])
  const out: ReelItem[] = []
  for (const s of shorts) {
    if (out.length >= AUTO_PER_CATEGORY) break
    if (seen.has(s.videoId) || blocked.has(s.videoId)) continue
    seen.add(s.videoId)
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

// categories ko round-robin interleave karta hai — feed me mix dikhe
function interleave(groups: ReelItem[][]): ReelItem[] {
  const out: ReelItem[] = []
  let idx = 0
  while (true) {
    let added = false
    for (const g of groups) {
      if (idx < g.length) {
        out.push(g[idx])
        added = true
      }
    }
    if (!added) break
    idx++
  }
  return out
}

// ── public: feed load (6h cache) ─────────────────────────────────

interface ReelsCache {
  ts: number
  items: ReelItem[]
}

export interface ReelsFeed {
  items: ReelItem[]
  curatedCount: number
  blockedCount: number
}

export async function getReels(): Promise<ReelsFeed> {
  // 1. cache try
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) {
      const cached = JSON.parse(raw) as ReelsCache
      if (cached?.ts && Date.now() - cached.ts < CACHE_TTL_MS && Array.isArray(cached.items)) {
        return { items: cached.items, curatedCount: -1, blockedCount: 0 }
      }
    }
  } catch {
    /* cache corrupt → fresh load */
  }

  // 2. curated + blocked (parallel — fail hone par bhi auto feed chalti rahe)
  const [reelsDocs, blockedDoc] = await Promise.all([
    fsList('reels').catch(() => [] as FSDoc[]),
    fsGet('reelConfig', 'blocked')
      .then((d) => (d ? ((unwrap(d.fields?.ids) as string[] | null) ?? []) : []))
      .catch(() => [] as string[]),
  ])
  const blocked = new Set(blockedDoc.filter((x) => typeof x === 'string'))

  const rawDocs = reelsDocs
    .map(unwrapDoc)
    .filter((d) => {
      if (!String(d.videoId ?? '').trim()) return false
      if (blocked.has(String(d.videoId))) return false
      return d.active === undefined ? true : Boolean(d.active)
    })
    .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
  const curated = rawDocs
    .map(toCuratedReel)
    .filter((r): r is ReelItem => r !== null)
  const seen = new Set(curated.map((r) => r.videoId))

  // 3. auto-fill har category ke liye (parallel)
  const cats = Object.keys(REEL_QUERIES)
  const groups = await Promise.all(cats.map((c) => autoReelsForCategory(c, blocked, seen)))
  const items = [...curated, ...interleave(groups)]

  // 4. cache write (best-effort) — KHAALI feed cache NAHI karte
  //    (warna ek failed load 6 ghante tak "reels nahi mili" dikhta hai)
  if (items.length > 0) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), items } satisfies ReelsCache))
    } catch {
      /* storage full — koi baat nahi */
    }
  }

  return { items, curatedCount: curated.length, blockedCount: blocked.size }
}

/** Cache force-clear (pull-to-refresh ke liye) */
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
