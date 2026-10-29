// Qalb — UNLIMITED YouTube search source (NO API KEY needed)
// ─────────────────────────────────────────────────────────────────
// YouTube Data API ki quota/key ki zaroorat NAHI — YouTube ka apna
// web InnerTube endpoint use hota hai (wahi jo youtube.com khud use
// karta hai). Isliye jo bhi naat/hamd/qawwali/kalam search karo —
// sab milega. UNLIMITED.
//
//   1) POST /youtubei/v1/search   (WEB client JSON — pagination support)
//   2) GET  /results?search_query (HTML → ytInitialData parse fallback)
//
// Native (APK): CapacitorHttp — CORS bypass hota hai.
// Web: normal fetch (CORS block ho to hosted /api/youtube-search
// server-side wahi same parser use karta hai).

import type { QalbTrack } from '@/lib/types'

// YouTube web client ki PUBLIC key — youtube.com ke source me embedded
const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'
const CLIENT_NAME = 'WEB'
const CLIENT_VERSION = '2.20250101.00.00'
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export interface YTSearchPage {
  tracks: QalbTrack[]
  continuation: string | null // agla page load karne ka token
}

/* eslint-disable @typescript-eslint/no-explicit-any */

interface RawVideo {
  videoId: string
  title: string
  channel: string
}

// ── native detection + HTTP helpers ─────────────────────────────

async function isNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    return Boolean(Capacitor.isNativePlatform?.())
  } catch {
    return false
  }
}

async function httpGetText(
  url: string,
  headers: Record<string, string>
): Promise<string | null> {
  try {
    if (await isNative()) {
      const { CapacitorHttp } = await import('@capacitor/core')
      const res = await CapacitorHttp.get({
        url,
        headers,
        connectTimeout: 12000,
        readTimeout: 20000,
        responseType: 'text',
      })
      if (res.status >= 200 && res.status < 300) {
        return typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
      }
      return null
    }
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(12000) })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

async function httpPostJson(
  url: string,
  headers: Record<string, string>,
  body: unknown
): Promise<any | null> {
  try {
    if (await isNative()) {
      const { CapacitorHttp } = await import('@capacitor/core')
      const res = await CapacitorHttp.post({
        url,
        headers: { ...headers, 'Content-Type': 'application/json' },
        data: body as Record<string, unknown>,
        connectTimeout: 12000,
        readTimeout: 20000,
      })
      if (res.status >= 200 && res.status < 300) return res.data
      return null
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// ── recursive videoRenderer collector (layout-change proof) ─────
// Poore JSON tree me har videoRenderer dhoondta hai — YouTube ka
// layout badle to bhi parsing tooti nahi. Live/upcoming skip hote hain.

function collectVideos(node: any, videos: RawVideo[], tokens: string[], depth = 0): void {
  if (!node || typeof node !== 'object' || depth > 80) return
  if (Array.isArray(node)) {
    for (const item of node) collectVideos(item, videos, tokens, depth + 1)
    return
  }

  const vr = node.videoRenderer
  if (vr && typeof vr === 'object') {
    const videoId = typeof vr.videoId === 'string' ? vr.videoId : null
    const title =
      vr.title?.runs?.[0]?.text ??
      vr.title?.accessibility?.accessibilityData?.label ??
      null
    const channel =
      vr.ownerText?.runs?.[0]?.text ??
      vr.longBylineText?.runs?.[0]?.text ??
      vr.shortBylineText?.runs?.[0]?.text ??
      null
    const badgeStyles = Array.isArray(vr.badges)
      ? vr.badges.map((b: any) => String(b?.metadataBadgeRenderer?.style ?? ''))
      : []
    const isLive = badgeStyles.some((s) => s.toUpperCase().includes('LIVE'))
    const isUpcoming = Boolean(vr.upcomingEventData)
    if (videoId && title && !isLive && !isUpcoming) {
      videos.push({ videoId, title, channel: channel || 'YouTube' })
    }
  }

  const token = node?.continuationItemRenderer?.continuationEndpoint?.continuationCommand
    ?.token
  if (typeof token === 'string' && token && !tokens.includes(token)) tokens.push(token)

  for (const key of Object.keys(node)) collectVideos(node[key], videos, tokens, depth + 1)
}

function pageFromData(data: any): YTSearchPage | null {
  if (!data || typeof data !== 'object') return null
  const videos: RawVideo[] = []
  const tokens: string[] = []
  collectVideos(data, videos, tokens)

  // dedupe by videoId
  const seen = new Set<string>()
  const tracks: QalbTrack[] = []
  videos.forEach((v, idx) => {
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

  if (!tracks.length && !tokens.length) return null
  return { tracks, continuation: tokens[0] ?? null }
}

// ── 1. InnerTube JSON search (primary — fast + paginated) ───────

const INNERTUBE_CONTEXT = {
  context: {
    client: {
      clientName: CLIENT_NAME,
      clientVersion: CLIENT_VERSION,
      hl: 'en',
      gl: 'IN',
    },
  },
}

async function innertubeSearch(
  q: string,
  continuation: string | null
): Promise<YTSearchPage | null> {
  const body = continuation
    ? { ...INNERTUBE_CONTEXT, continuation }
    : { ...INNERTUBE_CONTEXT, query: q }
  const data = await httpPostJson(
    `https://www.youtube.com/youtubei/v1/search?key=${INNERTUBE_KEY}&prettyPrint=false`,
    {
      'User-Agent': DESKTOP_UA,
      'Accept-Language': 'en-US,en;q=0.9,ur;q=0.8',
      'X-YouTube-Client-Name': '1',
      'X-YouTube-Client-Version': CLIENT_VERSION,
      Referer: 'https://www.youtube.com/',
    },
    body
  )
  return pageFromData(data)
}

// ── 2. HTML scrape fallback ─────────────────────────────────────

function extractYtInitialData(html: string): any | null {
  const marker = 'var ytInitialData = '
  const start = html.indexOf(marker)
  if (start === -1) return null
  const jsonStart = start + marker.length
  const end = html.indexOf(';</script>', jsonStart)
  if (end === -1) return null
  try {
    return JSON.parse(html.slice(jsonStart, end))
  } catch {
    return null
  }
}

async function scrapeSearchHtml(q: string): Promise<YTSearchPage | null> {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(
    q
  )}&sp=EgIQAQ%3D%3D&hl=en&gl=IN`
  const html = await httpGetText(url, {
    'User-Agent': DESKTOP_UA,
    'Accept-Language': 'en-US,en;q=0.9,ur;q=0.8',
    Cookie: 'SOCS=CAI; CONSENT=YES+cb',
  })
  if (!html) return null
  return pageFromData(extractYtInitialData(html))
}

// ── public API ──────────────────────────────────────────────────

export async function youtubeSearchPage(
  q: string,
  continuation: string | null = null
): Promise<YTSearchPage> {
  if (!q.trim() && !continuation) return { tracks: [], continuation: null }
  const innertube = await innertubeSearch(q, continuation).catch(() => null)
  if (innertube) return innertube
  // HTML scrape se sirf pehla page milta hai (pagination nahi)
  if (continuation) return { tracks: [], continuation: null }
  const scraped = await scrapeSearchHtml(q).catch(() => null)
  return scraped ?? { tracks: [], continuation: null }
}
