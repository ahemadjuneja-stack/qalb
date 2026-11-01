// Qalb — GET /api/yt-live?q=<query>&sp=<filter-key>&cont=<continuation>
// ─────────────────────────────────────────────────────────────────
// ENRICHED content engine ka SERVER-SIDE path (web runtime).
// Browser se YouTube direct fetch CORS block karta hai — isliye web par
// live-catalog.ts / itube.ts ye route hit karte hain (same-origin).
// APK native par wahi calls device-side direct jaati hain.
//
// v0.5.34 COMPLIANCE: engine ab official YouTube Data API v3 hai
// (innertube-x.ts → yt-data.ts). sp = friendly filter key:
// relevance|views|date|week|month|year
//
// ENRICHED results — views + duration + published included.
// Response 30 min in-memory cache (search-cache helpers).

import { NextResponse } from 'next/server'
import { cacheGet, cacheSet, cacheKey } from '@/lib/search-cache'
import { innertubeSearchX, SP, type RawVideoX, type SpKey } from '@/lib/innertube-x'

const CACHE_TTL = 30 * 60 * 1000 // 30 min — live content ko fresh rakhta hai

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const q = (searchParams.get('q') || '').trim()
    const cont = searchParams.get('cont')
    const spRaw = searchParams.get('sp') || 'videoOnly'

    // sp: friendly key (SP map) — unknown key → videoOnly default
    const sp = Object.prototype.hasOwnProperty.call(SP, spRaw)
      ? SP[spRaw as SpKey]
      : SP.videoOnly

    if (!q && !cont) {
      return NextResponse.json({ error: 'Missing q parameter' }, { status: 400 })
    }

    const key = cacheKey(['yt-live', cont ? `cont:${cont}` : q, sp])
    const cached = cacheGet<{ videos: RawVideoX[]; continuation: string | null }>(key)
    if (cached) {
      return NextResponse.json({
        videos: cached.videos,
        continuation: cached.continuation,
        source: 'cache',
      })
    }

    // server-side official Data API search (enriched)
    const page = await innertubeSearchX(q, sp, cont)
    if (!page) {
      return NextResponse.json({ videos: [], continuation: null, source: 'empty' })
    }

    const out = { videos: page.videos, continuation: page.continuation }
    cacheSet(key, out, CACHE_TTL)
    return NextResponse.json({ ...out, source: 'youtube-data' })
  } catch (e) {
    console.error('yt-live route error:', e)
    return NextResponse.json({ videos: [], continuation: null, source: 'error' })
  }
}

export const dynamic = 'force-dynamic'
