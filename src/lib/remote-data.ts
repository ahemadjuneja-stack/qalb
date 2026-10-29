// Qalb — Smart Data Layer (Step 5 backend wiring)
// ─────────────────────────────────────────────────────────────────
// Web (Next.js server chal raha hai)  → API routes se data (same-origin/hosted)
// APK  (static export, no server)     → Firestore REST API DIRECT
//
// Strategy har fetcher me:
//   1. Try ${API_BASE}/api/...  (web preview + hosted backend)
//   2. Fallback: Firestore REST (public read) — APK me yehi primary hai
//
// Isse "push → update" loop 100% self-contained hota hai: Firestore me
// sirf public-read rules chahiye, koi server zaroori nahi.

import { QALB } from '@/lib/qalb'
import { BUNDLED_PLAYLISTS } from '@/lib/bundled-library'
import { CURATED_PLAYLISTS } from '@/lib/curated-playlists'
import type { AppVersionInfo, QalbProduct, QalbPlaylist, QalbTrack } from '@/lib/types'

// ── Firestore REST helpers ───────────────────────────────────────

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
  if ('timestampValue' in v) return v.timestampValue
  if ('arrayValue' in v) {
    const vals = (v.arrayValue as { values?: FSValue[] }).values ?? []
    return vals.map(unwrap)
  }
  if ('mapValue' in v) {
    const fields = (v.mapValue as { fields?: Record<string, FSValue> }).fields ?? {}
    return Object.fromEntries(Object.entries(fields).map(([k, val]) => [k, unwrap(val)]))
  }
  return null
}

function unwrapDoc(doc: FSDoc): Record<string, unknown> & { id: string } {
  const fields = doc.fields ?? {}
  const flat = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, unwrap(v)]))
  const id = doc.name?.split('/').pop() ?? ''
  return { ...flat, id }
}

async function fsListDocs(collection: string, signal?: AbortSignal): Promise<FSDoc[]> {
  const res = await fetch(`${FS_BASE()}/${collection}?pageSize=200`, {
    signal,
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`firestore ${collection}: ${res.status}`)
  const json = (await res.json()) as { documents?: FSDoc[] }
  return json.documents ?? []
}

// Network promise ko timeout wrap karta hai — CapacitorHttp ka known issue:
// cold-start pe native promise kabhi-kabhi settle nahi hota (hang) → caller
// hamesha recover kar sake. AbortSignal.timeout purane WebView me nahi hai,
// isliye Promise.race pattern (har jagah kaam karta hai).
export function withNetTimeout<T>(p: Promise<T>, ms = 10_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('network-timeout')), ms)
    p.then(
      (v) => { clearTimeout(t); resolve(v) },
      (e) => { clearTimeout(t); reject(e) }
    )
  })
}

async function fsGetDoc(collection: string, docId: string): Promise<FSDoc | null> {
  const res = await withNetTimeout(
    fetch(`${FS_BASE()}/${collection}/${docId}`, { cache: 'no-store' })
  )
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`firestore ${collection}/${docId}: ${res.status}`)
  return (await res.json()) as FSDoc
}

// ── normalizers (Firestore doc → app types) ──────────────────────

function normalizeTags(raw: unknown): string {
  if (Array.isArray(raw)) return raw.join(',')
  return typeof raw === 'string' ? raw : ''
}

function toTrack(d: Record<string, unknown>): QalbTrack {
  return {
    id: String(d.id ?? ''),
    videoId: String(d.videoId ?? ''),
    title: String(d.title ?? 'Unknown'),
    artist: String(d.artist ?? 'Unknown'),
    category: String(d.category ?? 'NAAT'),
    thumbnailUrl: (d.thumbnailUrl as string | null) ?? null,
    tags: normalizeTags(d.tags),
    playCount: Number(d.playCount ?? 0),
  }
}

function toProduct(d: Record<string, unknown>): QalbProduct {
  return {
    id: String(d.id ?? ''),
    name: String(d.name ?? ''),
    description: String(d.description ?? ''),
    price: Number(d.price ?? 0),
    originalPrice: (d.originalPrice as number | null) ?? null,
    category: String(d.category ?? 'GIFTS'),
    emoji: String(d.emoji ?? '🎁'),
    gradient: String(d.gradient ?? 'from-emerald-800 to-emerald-950'),
    rating: Number(d.rating ?? 4.6),
    reviews: Number(d.reviews ?? 0),
    inStock: Boolean(d.inStock ?? true),
    featured: Boolean(d.featured ?? false),
  }
}

function docIdFrom(name: string | undefined): string {
  return name?.split('/').pop() ?? ''
}

// ── 1. App version (in-app updater ka core) ──────────────────────

export async function fetchAppVersionFromFirestore(): Promise<AppVersionInfo | null> {
  // NOTE: error yahan swallow NAHI karte — update-engine ko fail pata hona
  // chahiye taake wo auto-retry chala sake (warna "update nahi aata" bug).
  const doc = await fsGetDoc('appVersions', 'latest')
  if (!doc) return null
  const d = unwrapDoc(doc)
  if (!d.versionCode && !d.versionName) return null
  return {
    versionCode: Number(d.versionCode ?? 0),
    versionName: String(d.versionName ?? ''),
    apkUrl: String(d.apkUrl ?? ''),
    releaseNotes: (d.releaseNotes as string | null) ?? null,
    mandatory: Boolean(d.mandatory ?? false),
    publishedAt: String(d.publishedAt ?? ''),
  }
}

// ── 2. Playlists ─────────────────────────────────────────────────

export async function fetchPlaylistsSmart(): Promise<QalbPlaylist[]> {
  // 1) hosted API (web preview / deployed backend)
  try {
    const res = await fetch(`${QALB.apiBase}/api/playlists`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const data = (await res.json()) as { playlists?: QalbPlaylist[] }
      if (data.playlists?.length) return data.playlists
    }
  } catch {
    /* fallback to Firestore */
  }

  // 2) Firestore REST — playlists + tracks resolve karke
  try {
    const [plDocs, trDocs] = await Promise.all([
      fsListDocs('playlists'),
      fsListDocs('tracks'),
    ])
    const tracksById = new Map<string, QalbTrack>()
    for (const doc of trDocs) {
      const t = toTrack(unwrapDoc(doc))
      if (t.videoId) tracksById.set(t.id, t)
    }

    const playlists = plDocs
      .map((doc) => {
        const d = unwrapDoc(doc)
        const rawTracks = Array.isArray(d.tracks) ? d.tracks : []
        const tracks = rawTracks
          .map((ref) => {
            const r = ref as { trackId?: string }
            return r?.trackId ? tracksById.get(r.trackId) : undefined
          })
          .filter((t): t is QalbTrack => Boolean(t))
        return {
          id: String(d.id),
          slug: String(d.slug ?? docIdFrom(doc.name)),
          name: String(d.name ?? 'Playlist'),
          description: (d.description as string | null) ?? null,
          coverEmoji: String(d.coverEmoji ?? '🕌'),
          accentColor: String(d.accentColor ?? '#10B981'),
          tracks,
          _featured: Boolean(d.featured ?? false),
          _sortOrder: Number(d.sortOrder ?? 99),
        }
      })
      .filter((p) => p.tracks.length > 0)
      .sort(
        (a, b) =>
          Number(b._featured) - Number(a._featured) || a._sortOrder - b._sortOrder
      )
      .map(({ _featured, _sortOrder, ...p }) => p)

    // Firestore khali hai → curated playlists (verified pool se, HAMESHA bhari)
    // phir bundled starter library (APK first install ka last resort)
    return playlists.length > 0 ? playlists : CURATED_PLAYLISTS
  } catch {
    // Network/rules fail → bhi curated dikha do, app kabhi khali na lage
    return CURATED_PLAYLISTS.length > 0 ? CURATED_PLAYLISTS : BUNDLED_PLAYLISTS
  }
}

// ── 3. Products (Islamic Store) ──────────────────────────────────

export async function fetchProductsSmart(category?: string): Promise<QalbProduct[]> {
  // 1) hosted API
  try {
    const qs = category && category !== 'ALL' ? `?category=${encodeURIComponent(category)}` : ''
    const res = await fetch(`${QALB.apiBase}/api/products${qs}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const data = (await res.json()) as { products?: QalbProduct[] }
      if (data.products?.length) return data.products
    }
  } catch {
    /* fallback to Firestore */
  }

  // 2) Firestore REST
  try {
    const docs = await fsListDocs('products')
    let products = docs.map((doc) => toProduct(unwrapDoc(doc)))
    if (category && category !== 'ALL') {
      products = products.filter((p) => p.category === category)
    }
    return products.sort((a, b) => Number(b.featured) - Number(a.featured) || b.rating - a.rating)
  } catch {
    return []
  }
}

// ── 4. Track search (Firestore REST — APK ka search fallback) ────

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2)
}

export async function searchTracksFromFirestore(q: string): Promise<QalbTrack[]> {
  try {
    const docs = await fsListDocs('tracks')
    const toks = tokenize(q)
    const tracks = docs.map((doc) => toTrack(unwrapDoc(doc)))
    const scored = tracks
      .map((t) => {
        const hay = `${t.title} ${t.artist} ${t.tags ?? ''}`.toLowerCase()
        const score = toks.reduce((acc, tok) => acc + (hay.includes(tok) ? 1 : 0), 0)
        return { t, score }
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || (b.t.playCount ?? 0) - (a.t.playCount ?? 0))
      .slice(0, 12)
      .map(({ t }) => t)
    return scored
  } catch {
    return []
  }
}
