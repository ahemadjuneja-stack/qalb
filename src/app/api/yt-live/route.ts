// Qalb — GET /api/yt-live?q=<query>&sp=<innertube params>&cont=<continuation>
// ─────────────────────────────────────────────────────────────────
// LIVE content engine ka SERVER-SIDE path (web runtime).
// Browser se YouTube direct fetch CORS/bot-block hota hai — isliye web
// par live-catalog.ts ye route hit karta hai (same-origin, no CORS).
// APK native par wahi calls device-side direct jaati hain (CapacitorHttp).
//
// ENRICHED results — views + duration + published time included.
// Response 30 min in-memory cache (search-cache helpers).
// Ye route FILTERED search support karta hai: sp = views|date|week|month|year|video

import { NextResponse } from 'next/server'
import { cacheGet, cacheSet, cacheKey } from '@/lib/search-cache'
import { innertubeSearchX, SP, type RawVideoX, type SpKey } from '@/lib/innertube-x'

const CACHE_TTL = 30 * 60 * 1000 // 30 min — live content ko fresh rakhta hai

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const q = (searchParams.get('q') || '').trim()
    const cont = searchParams.get('cont')
    const spRaw = searchParams.get('sp') || 'video'

    // sp: friendly key ya raw params token dono accept
    const sp = Object.prototype.hasOwnProperty.call(SP, spRaw)
      ? SP[spRaw as SpKey]
      : spRaw.startsWith('Eg') || spRaw.startsWith('CAM')
        ? spRaw
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

    // server-side InnerTube — UNLIMITED, no API key
    const page = await innertubeSearchX(q, sp, cont)
    if (!page) {
      return NextResponse.json({ videos: [], continuation: null, source: 'empty' })
    }

    const out = { videos: page.videos, continuation: page.continuation }
    cacheSet(key, out, CACHE_TTL)
    return NextResponse.json({ ...out, source: 'innertube' })
  } catch (e) {
    console.error('yt-live route error:', e)
    return NextResponse.json({ videos: [], continuation: null, source: 'error' })
  }
}

export const dynamic = 'force-dynamic'
