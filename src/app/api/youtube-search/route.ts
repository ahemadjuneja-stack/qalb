// Qalb — GET /api/youtube-search?q=<query>&cont=<continuation token>
// 1) YouTube InnerTube (UNLIMITED — koi API key nahi chahiye, server-side)
// 2) YOUTUBE_API_KEY env set ho → YouTube Data API v3 (embeddable-biased backup)
// 3) warna local verified library se keyword search (offline sandbox fallback)
// Response 1h in-memory cache me save hota hai.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cacheGet, cacheSet, cacheKey } from '@/lib/search-cache'
import { youtubeSearchPage } from '@/lib/youtube-search-source'
import type { QalbTrack } from '@/lib/types'

const CACHE_TTL = 60 * 60 * 1000 // 1h

interface YTSearchItem {
  id?: { videoId?: string }
  snippet?: {
    title?: string
    channelTitle?: string
    thumbnails?: { medium?: { url?: string }; high?: { url?: string } }
  }
}

async function searchYouTubeDataApi(q: string): Promise<QalbTrack[] | null> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) return null
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
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const data = await res.json()
    const items = (data.items ?? []) as YTSearchItem[]
    return items
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
    return null
  }
}

function tokens(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2)
}

async function searchLocalLibrary(q: string): Promise<QalbTrack[]> {
  const toks = tokens(q)
  const tracks = await db.track.findMany({
    orderBy: { playCount: 'desc' },
    take: 60,
  })
  const scored = tracks
    .map((t) => {
      const hay = `${t.title} ${t.artist} ${t.tags}`.toLowerCase()
      const score = toks.reduce((acc, tok) => acc + (hay.includes(tok) ? 1 : 0), 0)
      return { t, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.t.playCount ?? 0) - (a.t.playCount ?? 0))
    .slice(0, 12)

  if (scored.length === 0) {
    // koi match nahi — trending fallback
    return tracks
      .filter((t) => t.trending)
      .slice(0, 8)
      .map((t) => ({
        id: t.id,
        videoId: t.videoId,
        title: t.title,
        artist: t.artist,
        category: t.category,
        thumbnailUrl: t.thumbnailUrl,
        tags: t.tags,
        playCount: t.playCount,
      }))
  }

  return scored.map(({ t }) => ({
    id: t.id,
    videoId: t.videoId,
    title: t.title,
    artist: t.artist,
    category: t.category,
    thumbnailUrl: t.thumbnailUrl,
    tags: t.tags,
    playCount: t.playCount,
  }))
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const q = (searchParams.get('q') || '').trim()
    const cont = searchParams.get('cont')
    if (!q && !cont) {
      return NextResponse.json({ error: 'Missing q parameter' }, { status: 400 })
    }

    const key = cacheKey(['yt-search', cont ? `cont:${cont}` : q])
    const cached = cacheGet<{ tracks: QalbTrack[]; continuation: string | null }>(key)
    if (cached) {
      return NextResponse.json({
        tracks: cached.tracks,
        source: 'cache',
        continuation: cached.continuation,
      })
    }

    // 1) InnerTube — UNLIMITED, no key (server-side fetch, CORS nahi lagta)
    // 2) cont token ke saath sirf InnerTube hi pagination deta hai
    const page = await youtubeSearchPage(q, cont)
    if (page.tracks.length) {
      cacheSet(key, page, CACHE_TTL)
      return NextResponse.json({
        tracks: page.tracks,
        source: 'youtube',
        continuation: page.continuation,
      })
    }

    // 3) Data API backup (agar key ho) — sirf fresh search ke liye
    let tracks: QalbTrack[] | null = cont ? null : await searchYouTubeDataApi(q)
    if (tracks?.length) {
      cacheSet(key, { tracks, continuation: null }, CACHE_TTL)
      return NextResponse.json({ tracks, source: 'youtube', continuation: null })
    }

    // 4) library fallback
    tracks = cont ? [] : await searchLocalLibrary(q)
    return NextResponse.json({ tracks, source: 'library', continuation: null })
  } catch (e) {
    console.error('[api/youtube-search] error:', e)
    return NextResponse.json({ tracks: [], source: 'none', error: 'Search failed' }, { status: 500 })
  }
}
