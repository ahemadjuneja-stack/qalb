// Qalb — Smart Search Client Layer (APK-SAFE)
// ─────────────────────────────────────────────────────────────────
// APK static export hota hai — andar koi Next.js server NAHI hota.
// Isliye client-side search chain:
//
//   VALIDATION:
//     1. hosted /api/search      (web preview / deployed backend)
//     2. ruleBasedValidate()     (device pe hi — APK primary)
//
//   TRACK SEARCH:
//     1. hosted /api/youtube-search  (web preview)
//     2. YouTube Data API v3 DIRECT  (device se, NEXT_PUBLIC_YOUTUBE_API_KEY)
//     3. Firestore REST tracks       (verified library)
//     4. Bundled starter library     (offline last resort)
//
// Har step fail hone par agla step chalta hai — "Network masla" kabhi
// nahi aayega jab tak device pe internet hai.

import { QALB } from '@/lib/qalb'
import { ruleBasedValidate } from '@/lib/search-rules'
import { searchTracksFromFirestore } from '@/lib/remote-data'
import { searchBundledLibrary } from '@/lib/bundled-library'
import type { QalbTrack, SearchValidationResult } from '@/lib/types'

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

  // 1) hosted AI guardian (sirf web / hosted backend pe chalega)
  try {
    const res = await fetch(`${QALB.apiBase}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q }),
      signal: AbortSignal.timeout(10000),
    })
    if (res.ok) {
      const data = (await res.json()) as SearchValidationResult
      if (typeof data.valid === 'boolean') return data
    }
  } catch {
    /* APK me yahan fail hoga → rules fallback */
  }

  // 2) device-side rule guardian — hamesha kaam karta hai
  return ruleBasedValidate(q)
}

// ── 2. YouTube Data API direct (device se) ───────────────────────

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

export async function youtubeSearchSmart(
  q: string
): Promise<{ tracks: QalbTrack[]; source: SearchSource }> {
  // 1) hosted API (web preview / deployed backend, 1h cache bhi wahan hai)
  try {
    const res = await fetch(
      `${QALB.apiBase}/api/youtube-search?q=${encodeURIComponent(q)}`,
      { signal: AbortSignal.timeout(10000) }
    )
    if (res.ok) {
      const data = (await res.json()) as { tracks?: QalbTrack[]; source?: SearchSource }
      if (data.tracks?.length) {
        return { tracks: data.tracks, source: data.source === 'youtube' ? 'youtube' : 'library' }
      }
    }
  } catch {
    /* APK → next step */
  }

  // 2) YouTube Data API direct device se (APK me real YouTube search)
  const yt = await searchYouTubeDirect(q)
  if (yt.length) return { tracks: yt, source: 'youtube' }

  // 3) Firestore verified library (REST — rules public read)
  const fsTracks = await searchTracksFromFirestore(q)
  if (fsTracks.length) return { tracks: fsTracks, source: 'library' }

  // 4) bundled starter library (offline fallback)
  return { tracks: searchBundledLibrary(q), source: 'bundled' }
}
