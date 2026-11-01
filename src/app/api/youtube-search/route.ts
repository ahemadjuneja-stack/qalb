// Qalb — GET /api/youtube-search?q=<query>&cont=<continuation token>
// ─────────────────────────────────────────────────────────────────
// v0.5.34 COMPLIANCE: search ab SIRF official YouTube Data API v3 se
// (pehle InnerTube primary tha — YouTube API Terms ke khilaaf).
//   1) YouTube Data API v3 (yt-data.ts — key: YOUTUBE_API_KEY env)
//   2) warna local verified library se keyword search (offline fallback)
// Response 1h in-memory cache me save hota hai (quota bachata hai).

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cacheGet, cacheSet, cacheKey } from '@/lib/search-cache'
import { youtubeSearchPage, youtubeShortsSearch, type RawShort } from '@/lib/youtube-search-source'
import { filterSearchResults } from '@/lib/result-filter'
import type { QalbTrack } from '@/lib/types'

const CACHE_TTL = 60 * 60 * 1000 // 1h

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
    const strict = searchParams.get('strict') === '1'

    // ── SHORTS mode (Islamic Reels feed) ──
    // Data API: videoDuration=short + ≤61s filter. result-filter yahan
    // skip — queries khud Islamic-specific hain + app-side block-list
    // (`reelConfig/blocked`) user control deta hai.
    if (searchParams.get('shorts') === '1') {
      if (!q) return NextResponse.json({ error: 'Missing q parameter' }, { status: 400 })
      const sKey = cacheKey(['yt-shorts', q])
      const sCached = cacheGet<RawShort[]>(sKey)
      if (sCached) return NextResponse.json({ shorts: sCached, source: 'cache' })
      const shorts = await youtubeShortsSearch(q)
      cacheSet(sKey, shorts, CACHE_TTL)
      return NextResponse.json({
        shorts,
        source: shorts.length ? 'youtube-data' : 'empty',
      })
    }

    if (!q && !cont) {
      return NextResponse.json({ error: 'Missing q parameter' }, { status: 400 })
    }

    const key = cacheKey(['yt-search', cont ? `cont:${cont}` : q, strict ? 'strict' : 'loose'])
    const cached = cacheGet<{ tracks: QalbTrack[]; continuation: string | null }>(key)
    if (cached) {
      return NextResponse.json({
        tracks: cached.tracks,
        source: 'cache',
        continuation: cached.continuation,
      })
    }

    // 1) Official YouTube Data API v3 (search.list + videos.list enrich)
    // 2) pageToken continuation officially supported
    const page = await youtubeSearchPage(q, cont)
    const filtered = filterSearchResults(page.tracks, strict)
    if (filtered.length) {
      const pageOut = { tracks: filtered, continuation: page.continuation }
      cacheSet(key, pageOut, CACHE_TTL)
      return NextResponse.json({
        tracks: filtered,
        source: 'youtube-data',
        continuation: page.continuation,
      })
    }

    // 3) library fallback (key missing / quota khatam / koi result nahi)
    const tracks: QalbTrack[] = cont ? [] : await searchLocalLibrary(q)
    return NextResponse.json({ tracks, source: 'library', continuation: null })
  } catch (e) {
    console.error('[api/youtube-search] error:', e)
    return NextResponse.json({ tracks: [], source: 'none', error: 'Search failed' }, { status: 500 })
  }
}
