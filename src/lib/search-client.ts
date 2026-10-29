// Qalb — Smart Search Client Layer (APK-SAFE + UNLIMITED)
// ─────────────────────────────────────────────────────────────────
// APK static export hota hai — andar koi Next.js server NAHI hota.
//
// VALIDATION:
//   1. hosted /api/search      (sirf web — API base set ho)
//   2. ruleBasedValidate()     (device pe hi — APK primary)
//
// TRACK SEARCH:
//   native (APK):
//     1. YouTube InnerTube/scrape DIRECT — UNLIMITED, koi API key nahi
//     2. YouTube Data API v3 direct  (agar NEXT_PUBLIC key ho)
//     3. Firestore REST tracks       (verified library)
//     4. Bundled starter library     (offline last resort)
//   web:
//     1. hosted /api/youtube-search  (server-side InnerTube bhi chalata hai)
//     2. Firestore → bundled
//
// Har step fail hone par agla step chalta hai — "Network masla" kabhi
// nahi aayega jab tak device pe internet hai.

import { Capacitor } from '@capacitor/core'
import { QALB } from '@/lib/qalb'
import { ruleBasedValidate } from '@/lib/search-rules'
import { filterSearchResults } from '@/lib/result-filter'
import { searchTracksFromFirestore } from '@/lib/remote-data'
import { searchBundledLibrary } from '@/lib/bundled-library'
import { youtubeSearchPage } from '@/lib/youtube-search-source'
import type { QalbTrack, SearchValidationResult } from '@/lib/types'

function isNative(): boolean {
  try {
    return Boolean(Capacitor.isNativePlatform?.())
  } catch {
    return false
  }
}

// ── 1. Validation ────────────────────────────────────────────────

export async function validateSmart(query: string): Promise<SearchValidationResult> {
  const q = query.trim()
  if (!q) {
    return {
      valid: false,
      category: null,
      refinedQuery: null,
      reason: 'Khaali search query.',
      provider: 'rules',
    }
  }

  // APK me hosted API base khali hota hai → seedha device-side rules
  // (fast, deterministic, koi network wait nahi)
  if (!(isNative() && !QALB.apiBase)) {
    try {
      const res = await fetch(`${QALB.apiBase}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
        signal: AbortSignal.timeout(6000),
      })
      if (res.ok) {
        const data = (await res.json()) as SearchValidationResult
        if (typeof data.valid === 'boolean') {
          return {
            ...data,
            // AI guardian strict flag nahi bhejta → category hi intent hai:
            // category null = ambiguous query = strict result filtering
            strict: typeof data.strict === 'boolean' ? data.strict : !data.category,
          }
        }
      }
    } catch {
      /* APK me yahan fail hoga → rules fallback */
    }
  }

  // device-side rule guardian — hamesha kaam karta hai
  return ruleBasedValidate(q)
}

// ── 2. YouTube Data API direct (device se — sirf agar key ho) ────

interface YTSearchItem {
  id?: { videoId?: string }
  snippet?: {
    title?: string
    channelTitle?: string
    thumbnails?: { medium?: { url?: string }; high?: { url?: string } }
  }
}

async function searchYouTubeDirect(q: string): Promise<QalbTrack[]> {
  const key = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY
  if (!key) return []
  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/search')
    url.searchParams.set('part', 'snippet')
    url.searchParams.set('type', 'video')
    url.searchParams.set('videoEmbeddable', 'true')
    url.searchParams.set('maxResults', '15')
    url.searchParams.set('q', q)
    url.searchParams.set('relevanceLanguage', 'ur')
    url.searchParams.set('regionCode', 'IN')
    url.searchParams.set('safeSearch', 'strict')
    url.searchParams.set('key', key)
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return []
    const data = (await res.json()) as { items?: YTSearchItem[] }
    return (data.items ?? [])
      .filter((i) => i.id?.videoId)
      .map((i, idx) => ({
        id: `yt-${i.id!.videoId}`,
        videoId: i.id!.videoId!,
        title: i.snippet?.title ?? 'Unknown',
        artist: i.snippet?.channelTitle ?? 'YouTube',
        category: 'SEARCH',
        thumbnailUrl:
          i.snippet?.thumbnails?.high?.url ?? i.snippet?.thumbnails?.medium?.url ?? null,
        tags: `idx:${idx}`,
      }))
  } catch {
    return []
  }
}

// ── 3. Combined track search ─────────────────────────────────────

export type SearchSource = 'youtube' | 'cache' | 'library' | 'bundled'

export interface SmartSearchResult {
  tracks: QalbTrack[]
  source: SearchSource
  continuation: string | null // aur results load karne ka token
}

export async function youtubeSearchSmart(
  q: string,
  continuation: string | null = null,
  strict = false
): Promise<SmartSearchResult> {
  // pagination mode → sirf YouTube ka agla page (koi hosted/library nahi)
  if (continuation) {
    const page = await youtubeSearchPage(q, continuation)
    return {
      tracks: filterSearchResults(page.tracks, strict),
      source: 'youtube',
      continuation: page.continuation,
    }
  }

  if (isNative()) {
    // APK: UNLIMITED YouTube search — pehle ye (no key, no quota)
    const page = await youtubeSearchPage(q, null)
    const filtered = filterSearchResults(page.tracks, strict)
    if (filtered.length) {
      return { tracks: filtered, source: 'youtube', continuation: page.continuation }
    }
    // backup: Data API (agar YT_API_KEY secret set ho)
    const yt = filterSearchResults(await searchYouTubeDirect(q), strict)
    if (yt.length) return { tracks: yt, source: 'youtube', continuation: null }
  } else {
    // web / hosted backend (server-side InnerTube bhi chalata hai)
    try {
      const res = await fetch(
        `${QALB.apiBase}/api/youtube-search?q=${encodeURIComponent(q)}&strict=${strict ? 1 : 0}`,
        { signal: AbortSignal.timeout(10000) }
      )
      if (res.ok) {
        const data = (await res.json()) as {
          tracks?: QalbTrack[]
          source?: SearchSource
          continuation?: string | null
        }
        if (data.tracks?.length) {
          return {
            tracks: filterSearchResults(data.tracks, strict),
            source: data.source === 'youtube' ? 'youtube' : 'library',
            continuation: data.continuation ?? null,
          }
        }
      }
    } catch {
      /* APK → next step */
    }
  }

  // Firestore verified library (REST — rules public read)
  const fsTracks = await searchTracksFromFirestore(q)
  if (fsTracks.length) return { tracks: fsTracks, source: 'library', continuation: null }

  // bundled starter library (offline fallback)
  return { tracks: searchBundledLibrary(q), source: 'bundled', continuation: null }
}
