// Qalb — LIVE YouTube Content Engine (client layer)
// ─────────────────────────────────────────────────────────────────
// User requirement: "Home page me millions naat qawwali chahiye,
// YouTube trending top-10 dikhna chahiye, naya content roz aana chahiye."
//
// DONO RUNTIME me kaam karta hai:
//   • APK (native)  → InnerTube DIRECT device-side (CapacitorHttp — no CORS)
//   • Web (browser) → hosted /api/yt-live route (server-side InnerTube —
//                     browser se YouTube CORS/bot-block karta hai)
//
// Har result me views + duration + published capture hote hain.
// localStorage cache (TTL per call type) → dobara mount par instant.
// Network fail → static VERIFIED pool fallback — app kabhi khali nahi.

import { Capacitor } from '@capacitor/core'
import { QALB } from '@/lib/qalb'
import { APP_BUILD } from '@/lib/app-build'
import type { QalbTrack } from '@/lib/types'
import { TRENDING_POOL, poolToTrack } from '@/lib/trending-pool'
import { islamicOnly } from '@/lib/itube'
import { filterSearchResults } from '@/lib/result-filter'
import { famousOnly, rankFamousFirst } from '@/lib/famous-channels'
import {
  innertubeSearchX,
  paramsFor,
  videosToTracks,
  fallbackTracksFor,
  type PageX,
} from '@/lib/innertube-x'
import type { QalbFolder } from '@/lib/folders'

// ── runtime split (search-client.ts jaisa pattern) ───────────────

function isNative(): boolean {
  try {
    return Boolean(Capacitor.isNativePlatform?.())
  } catch {
    return false
  }
}

/** ENRICHED search — native par direct InnerTube, web par hosted API */
async function searchX(
  q: string,
  params: string,
  continuation: string | null
): Promise<PageX | null> {
  if (isNative()) {
    return innertubeSearchX(q, params, continuation)
  }
  // web — hosted route (same-origin ya NEXT_PUBLIC_API_BASE)
  try {
    // relative apiBase ('' = same-origin) ke liye base URL zaroori hai
    const base = QALB.apiBase || window.location.origin
    const url = new URL(`${base}/api/yt-live`)
    if (q) url.searchParams.set('q', q)
    if (params) url.searchParams.set('sp', params)
    if (continuation) url.searchParams.set('cont', continuation)
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(14000),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = (await res.json()) as { videos?: PageX['videos']; continuation?: string | null }
    if (!data.videos) return null
    return { videos: data.videos, continuation: data.continuation ?? null }
  } catch {
    return null
  }
}

function timeoutPromise<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms)
    p.then(
      (v) => { clearTimeout(t); resolve(v) },
      () => { clearTimeout(t); resolve(null) },
    )
  })
}

// ── cache layer (localStorage, TTL) ──────────────────────────────

interface CacheEntry {
  ts: number
  tracks: QalbTrack[]
  continuation: string | null
}

// v0.5.43 — feed LOGIC badla (famous-first trending) → v1 ka purana cache
// invalid. USER REPORT: "update ke bavjud bhi same purana chal raha hai" —
// wajah: naye bundle me bhi purani cached feed (2h TTL) dikhti thi.
// FIX: prefix me FEED_LOGIC_VERSION (feed logic badalne par manual bump)
// + APP_BUILD.versionCode (har naya build apna fresh cache leta hai —
// OTA bundle lagte hi purana feed cache khud bypass ho jata hai).
const FEED_LOGIC_VERSION = 2
const CACHE_PREFIX = `qalb_live_v${FEED_LOGIC_VERSION}_${APP_BUILD.versionCode}__`

function readCache(key: string, ttlMs: number): CacheEntry | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return null
    const entry = JSON.parse(raw) as CacheEntry
    if (!entry || !Array.isArray(entry.tracks)) return null
    if (Date.now() - entry.ts > ttlMs) return null
    return entry
  } catch {
    return null
  }
}

function writeCache(key: string, tracks: QalbTrack[], continuation: string | null): void {
  if (typeof window === 'undefined') return
  try {
    const entry: CacheEntry = { ts: Date.now(), tracks: tracks.slice(0, 60), continuation }
    window.localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry))
  } catch {
    /* quota — cache optional hai */
  }
}

const FOLDER_TTL = 6 * 3600 * 1000 // 6h — folders instant re-open
const FEED_TTL = 2 * 3600 * 1000 // 2h — home feed live sections

// ── folder pages (browse-view ka core) ───────────────────────────

export interface FolderPage {
  tracks: QalbTrack[]
  continuation: string | null
  fromCache: boolean
}

/**
 * Folder ka pehla page — cache ho to instant (100+ scroll ke liye
 * continuation bhi cache me save hota hai).
 */
export async function fetchFolderPage(folder: QalbFolder): Promise<FolderPage> {
  const cache = readCache(`folder:${folder.id}`, FOLDER_TTL)
  if (cache && cache.tracks.length >= 8) {
    return { tracks: cache.tracks, continuation: cache.continuation, fromCache: true }
  }

  const sp = paramsFor(folder.sort, folder.period)
  const page = await timeoutPromise(searchX(folder.query, sp, null), 15000)
  let tracks = page ? videosToTracks(page.videos, folder.id) : []
  // paak-content guardian — curated queries par bhi safety
  tracks = filterSearchResults(tracks, false)

  // viral mood: is mahine ke results ko views ke hisaab se sort karo
  if (folder.viral) tracks = [...tracks].sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))

  if (tracks.length >= 5) {
    writeCache(`folder:${folder.id}`, tracks, page?.continuation ?? null)
    return { tracks, continuation: page?.continuation ?? null, fromCache: false }
  }

  // network fail → verified pool fallback (category-matched)
  return { tracks: fallbackTracksFor(folder.query, 24), continuation: null, fromCache: false }
}

/** Folder ka agla page — infinite scroll (UNLIMITED YouTube pagination) */
export async function fetchFolderMore(
  folder: QalbFolder,
  continuation: string
): Promise<FolderPage> {
  const page = await timeoutPromise(searchX('', '', continuation), 15000)
  if (!page) return { tracks: [], continuation: continuation, fromCache: false }
  let tracks = videosToTracks(page.videos, folder.id)
  tracks = filterSearchResults(tracks, false)
  if (folder.viral) tracks = [...tracks].sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))
  return { tracks, continuation: page.continuation ?? null, fromCache: false }
}

// ── live home feed (trending / fresh / mixes ke live sets) ───────

export interface LiveFeedData {
  /** YouTube ke is hafte ke sab se zyada dekhe gaye naat/qawwali — TOP 10 */
  trending: QalbTrack[]
  trendingLive: boolean
  /** brand new uploads (sort=date) — "naya kuch hai hi nahi" ka jawab */
  fresh: QalbTrack[]
  /** category-wise live sets — mixes/moods inhi se bante hain */
  categorySets: Partial<Record<'NAAT' | 'HAMD' | 'QAWWALI' | 'NASHEED', QalbTrack[]>>
  /** user ke top artist ka live set (taste-driven) */
  artistSet: { name: string; tracks: QalbTrack[] } | null
  ready: boolean
}

const CATEGORY_QUERIES: Array<{ cat: 'NAAT' | 'HAMD' | 'QAWWALI' | 'NASHEED'; q: string }> = [
  { cat: 'NAAT', q: 'naat sharif best' },
  { cat: 'QAWWALI', q: 'qawwali best mehfil' },
  { cat: 'NASHEED', q: 'islamic nasheed best' },
  { cat: 'HAMD', q: 'hamd e bari taala' },
]

const FRESH_QUERIES = ['new naat sharif', 'new qawwali', 'new nasheed']

// v0.5.43 — FAMOUS naat khwan/legends ke DIRECT queries. Broad queries
// (naat sharif/qawwali) month-window me bhi viral junk deti hain
// (live-test: "The Voice India", Zara-Disco muqabla, cartoons) — famous
// artists top 10 me ghaib. Ab har query ek famous naam target karti hai
// → results = unhi ki nayi launches (YouTube trending ke hisaab se).
const TREND_QUERIES = [
  'owais raza qadri new naat',
  'hafiz ahmed raza qadri new naat',
  'farhan ali qadri new naat',
  'milad raza qadri new naat',
  'rahat fateh ali khan qawwali',
  'nusrat fateh ali khan qawwali',
  'amjad sabri qawwali',
  'bukhari studio new naat',
]

/**
 * Poora live feed — parallel fetches, 2h cache, graceful fallback.
 * Home mount par ek dafa chalta hai; offline/stale par static pool.
 */
export async function getLiveFeed(topArtist: string | null): Promise<LiveFeedData> {
  const cacheKey = `feed:${topArtist ?? 'guest'}`
  const cached = readCache(cacheKey, FEED_TTL)
  if (cached && cached.continuation) {
    try {
      const sets = JSON.parse(cached.continuation) as LiveFeedData
      if (sets && sets.ready) return sets
    } catch {
      /* cache corrupt — fresh fetch */
    }
  }

  const empty: LiveFeedData = {
    trending: [],
    trendingLive: false,
    fresh: [],
    categorySets: {},
    artistSet: null,
    ready: false,
  }

  try {
    // ── 1. TRENDING — v0.5.43 FAMOUS-NEW-FIRST ──
    // user report: "ek hi chal rahi hai, YouTube trending ke hisaab se
    // nahi hai… sirf wahi naat aani chahiye jo famous channel par new
    // launching hui ho".
    //
    // Pehle: all-time views-sort → hamesha wahi classics (Afreen Afreen
    // 696M…) + broad queries ke month/week windows me viral junk (live
    // test: "The Voice India", Zara-Disco muqabla, cartoon naat).
    // Ab: har query ek famous naat khwan/legend DIRECT target karti hai
    // (viewCount+30d) → results = unhi ki nayi launches, views ke
    // hisaab se (YouTube trending ka proxy) + FAMOUS-FIRST ranking.
    const trendPages = await Promise.all([
      ...TREND_QUERIES.map((q) => timeoutPromise(searchX(q, paramsFor('', 'month'), null), 14000)),
    ])
    const trendTracks = islamicOnly(
      videosToTracks(trendPages.flatMap((p) => p?.videos ?? []), 'tr')
    ).filter((t) => (t.playCount ?? 0) > 0)

    // FAMOUS-FIRST — famous launches upar; famous < 8 ho to top-viewed
    // islamic recent se fill (Top 10 poora rahe — junk last me hi)
    const rankedAll = rankFamousFirst(trendTracks)
    const famousRanked = famousOnly(rankedAll)
    let trending = (famousRanked.length >= 8 ? famousRanked : rankedAll).slice(0, 10)

    // month kam pad jaye to year window ka backup (famous launches rare
    // weeks me — Urdu naat/qawwali supply na toote)
    if (trending.length < 8) {
      const yearPages = await Promise.all(
        TREND_QUERIES.slice(0, 4).map((q) => timeoutPromise(searchX(q, paramsFor('', 'year'), null), 14000))
      )
      const yearTracks = islamicOnly(
        videosToTracks(yearPages.flatMap((p) => p?.videos ?? []), 'tr')
      ).filter((t) => (t.playCount ?? 0) > 0)
      const merged = rankFamousFirst([...trendTracks, ...yearTracks])
      const mergedFamous = famousOnly(merged)
      if (merged.length > trending.length) {
        trending = (mergedFamous.length >= 8 ? mergedFamous : merged).slice(0, 10)
      }
    }

    // network bilkul fail → verified classics dikha do (kabhi khali nahi)
    const trendingLive = trending.length >= 5
    if (!trendingLive) {
      trending = [...TRENDING_POOL]
        .sort((a, b) => b.views - a.views)
        .slice(0, 10)
        .map((e, i) => poolToTrack(e, i))
    }

    // ── 2. FRESH — v0.5.43 SIRF famous-channel NEW launches ──
    // user report: "aaj ke naye kalam me kuch bhi aajat hai" — generic
    // date-sort random channels ke 0-view uploads la raha tha. Ab strict
    // famous-only (koi junk fill nahi — 0 mile to section chhup jata hai
    // aur buildFeed ka verified-pool fallback chalta hai).
    const freshPages = await Promise.all(
      FRESH_QUERIES.map((q) => timeoutPromise(searchX(q, paramsFor('date', ''), null), 14000))
    )
    const freshVideos = freshPages.flatMap((p) => p?.videos ?? [])
    const freshAll = islamicOnly(videosToTracks(freshVideos, 'fr'))
    const fresh = famousOnly(rankFamousFirst(freshAll)).slice(0, 30)

    // ── 3. CATEGORY SETS — mixes/moods ke liye (4 parallel, views sort) ──
    const catPages = await Promise.all(
      CATEGORY_QUERIES.map(({ q }) => timeoutPromise(searchX(q, paramsFor('views', ''), null), 14000))
    )
    const categorySets: LiveFeedData['categorySets'] = {}
    catPages.forEach((p, i) => {
      if (!p) return
      const tracks = islamicOnly(
        videosToTracks(p.videos, 'cat', CATEGORY_QUERIES[i].cat)
      )
      if (tracks.length) categorySets[CATEGORY_QUERIES[i].cat] = tracks.slice(0, 24)
    })

    // ── 4. ARTIST SET — taste-driven (sirf jab history ho) ──
    let artistSet: LiveFeedData['artistSet'] = null
    if (topArtist) {
      const page = await timeoutPromise(
        searchX(`${topArtist} best naat qawwali`, paramsFor('views', ''), null),
        14000
      )
      const tracks = page ? islamicOnly(videosToTracks(page.videos, 'art')) : []
      if (tracks.length >= 5) artistSet = { name: topArtist, tracks: tracks.slice(0, 20) }
    }

    const data: LiveFeedData = {
      trending,
      trendingLive,
      fresh,
      categorySets,
      artistSet,
      ready: true,
    }

    // cache SIRF real live data ka — network-fail fallback dobara try ho paye
    if (data.trendingLive) writeCache(cacheKey, [], JSON.stringify(data))
    return data
  } catch {
    return { ...empty, ready: true }
  }
}

// viewsLabel re-export — components isi se import karte hain
export { viewsLabel, fallbackTracksFor } from '@/lib/innertube-x'
