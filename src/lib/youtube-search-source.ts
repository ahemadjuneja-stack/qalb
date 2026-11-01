// Qalb — YouTube search source — OFFICIAL Data API v3 (v0.5.34)
// ─────────────────────────────────────────────────────────────────
// COMPLIANCE REWRITE: v0.5.33 tak ye file YouTube ka private InnerTube
// endpoint (/youtubei/v1) use karti thi — wo YouTube ke API Terms ke
// khilaaf tha. Ab saara search official YouTube Data API v3 se hota hai
// (yt-data.ts) — key: NEXT_PUBLIC_YOUTUBE_API_KEY (client) /
// YOUTUBE_API_KEY (server).
//
//   1) search.list  — video results (pageToken = continuation)
//   2) videos.list  — views/duration enrichment (1 unit)
//   3) shorts       — videoDuration=short + ≤61s filter
//
// Quota note: search = 100 units; free tier 10,000/day — doston wali
// app ke liye kaafi. Har response caller-level cache hota hai.

import type { QalbTrack } from '@/lib/types'
import { ytSearch, ytShortsSearch as dataShortsSearch } from '@/lib/yt-data'

export interface YTSearchPage {
  tracks: QalbTrack[]
  continuation: string | null // agla page load karne ka token (nextPageToken)
}

// Shorts raw item — reels feed (reels.ts) + /api/youtube-search use karte hain
export interface RawShort {
  videoId: string
  title: string
  views: string
}

/**
 * Main YouTube search — official Data API v3. `continuation` = Data API
 * ka nextPageToken (pehle InnerTube tokens the — v0.5.34 se schema badla).
 */
export async function youtubeSearchPage(
  q: string,
  continuation: string | null = null
): Promise<YTSearchPage> {
  const query = q.trim()
  if (!query && !continuation) return { tracks: [], continuation: null }

  const page = await ytSearch(query, {
    pageToken: continuation,
    maxResults: 25,
    type: 'video',
  }).catch(() => null)

  if (!page || !page.videos.length) return { tracks: [], continuation: null }

  const seen = new Set<string>()
  const tracks: QalbTrack[] = []
  page.videos.forEach((v, idx) => {
    if (seen.has(v.videoId)) return
    seen.add(v.videoId)
    tracks.push({
      id: `yt-${v.videoId}`,
      videoId: v.videoId,
      title: v.title,
      artist: v.channel,
      category: 'SEARCH',
      thumbnailUrl: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
      tags: `idx:${idx}`,
    })
  })

  return { tracks, continuation: page.nextPageToken }
}

/**
 * Sirf YouTube SHORT-STYLE videos (≤60s) — Islamic Reels feed.
 * Data API vertical-detection nahi deta, isliye videoDuration=short +
 * duration filter — landscape chhoti videos bhi aa sakti hain (rare).
 */
export async function youtubeShortsSearch(q: string): Promise<RawShort[]> {
  const query = q.trim()
  if (!query) return []
  try {
    return await dataShortsSearch(query)
  } catch {
    return []
  }
}
