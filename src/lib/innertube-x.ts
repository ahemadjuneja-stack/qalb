// Qalb — InnerTube ENRICHED search core (client + server dono safe)
// ─────────────────────────────────────────────────────────────────
// live-catalog.ts (client) aur /api/yt-live route (server) dono isi
// core ko use karte hain — ek hi parsing logic, kahin bhi chalao.
//
// ENRICHED = views + duration + published time bhi capture hote hain
// (normal youtube-search-source.ts sirf title/channel leta hai).
//
// Verified InnerTube filter params (2026-10 live test):
//   views = CAMSAhAB (view-count sort), date = EgIIAQ== (upload sort),
//   week = EgQIAxAB, month = EgQIBBAB, year = EgQIBRAB

import type { QalbTrack } from '@/lib/types'
import { TRENDING_POOL, poolToTrack } from '@/lib/trending-pool'
import { innertubePostJson } from '@/lib/youtube-search-source'

/* eslint-disable @typescript-eslint/no-explicit-any */

const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'
const CLIENT_VERSION = '2.20250101.00.00'
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

export const INNERTUBE_CONTEXT = {
  context: {
    client: {
      clientName: 'WEB',
      clientVersion: CLIENT_VERSION,
      hl: 'en',
      gl: 'IN',
    },
  },
}

// Verified search-filter params
export const SP = {
  videoOnly: 'EgIQAQ%3D%3D', // video-only
  views: 'CAMSAhAB', // view-count sort + video
  date: 'EgIIAQ%3D%3D', // upload-date sort + video
  week: 'EgQIAxAB', // this week + video
  month: 'EgQIBBAB', // this month + video
  year: 'EgQIBRAB', // this year + video
} as const

export type SpKey = keyof typeof SP

export function paramsFor(sort: string, period: string | null): string {
  if (period === 'week') return SP.week
  if (period === 'month') return SP.month
  if (period === 'year') return SP.year
  if (sort === 'views') return SP.views
  if (sort === 'date') return SP.date
  return SP.videoOnly
}

// ── enriched video parsing ───────────────────────────────────────

export interface RawVideoX {
  videoId: string
  title: string
  channel: string
  views: number
  viewsText: string
  durationSec: number // 0 = live/unknown (skip hota hai)
  published: string
}

export function parseViews(text: unknown): number {
  if (typeof text !== 'string') return 0
  const digits = text.replace(/[^\d]/g, '')
  const n = parseInt(digits, 10)
  return Number.isFinite(n) ? n : 0
}

export function parseDuration(text: unknown): number {
  if (typeof text !== 'string') return 0
  const parts = text.split(':').map((p) => parseInt(p, 10))
  if (parts.some((p) => !Number.isFinite(p))) return 0
  let sec = 0
  for (const p of parts) sec = sec * 60 + p
  return sec
}

export function collectVideosX(node: any, out: RawVideoX[], tokens: string[], depth = 0): void {
  if (!node || typeof node !== 'object' || depth > 80) return
  if (Array.isArray(node)) {
    for (const item of node) collectVideosX(item, out, tokens, depth + 1)
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
    const dur = parseDuration(
      vr.lengthText?.simpleText ?? vr.lengthText?.accessibility?.accessibilityData?.label
    )
    const isUpcoming = Boolean(vr.upcomingEventData)
    if (videoId && title && !isLive && !isUpcoming && dur > 0 && dur < 3 * 3600) {
      out.push({
        videoId,
        title,
        channel: channel || 'YouTube',
        views: parseViews(vr.viewCountText?.simpleText),
        viewsText: vr.shortViewCountText?.simpleText ?? vr.viewCountText?.simpleText ?? '',
        durationSec: dur,
        published: vr.publishedTimeText?.simpleText ?? '',
      })
    }
  }

  const token = node?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token
  if (typeof token === 'string' && token && !tokens.includes(token)) tokens.push(token)

  for (const key of Object.keys(node)) collectVideosX(node[key], out, tokens, depth + 1)
}

export interface PageX {
  videos: RawVideoX[]
  continuation: string | null
}

/** ENRICHED InnerTube search — query + filter params + continuation */
export async function innertubeSearchX(
  query: string,
  params: string,
  continuation: string | null
): Promise<PageX | null> {
  const body = continuation
    ? { ...INNERTUBE_CONTEXT, continuation }
    : { ...INNERTUBE_CONTEXT, query, params }
  const data = await innertubePostJson(
    `https://www.youtube.com/youtubei/v1/search?key=${INNERTUBE_KEY}&prettyPrint=false`,
    {
      'User-Agent': DESKTOP_UA,
      'Accept-Language': 'en-US,en;q=0.9,ur;q=0.8',
      'X-YouTube-Client-Name': '1',
      'X-YouTube-Client-Version': CLIENT_VERSION,
      Referer: 'https://www.youtube.com/',
    },
    body
  ).catch(() => null)
  if (!data || typeof data !== 'object') return null
  const videos: RawVideoX[] = []
  const tokens: string[] = []
  collectVideosX(data, videos, tokens)
  return { videos, continuation: tokens[0] ?? null }
}

/** Title/channel se category infer — taste profile ko sahi category mile */
export function inferCategory(text: string): string {
  const t = text.toLowerCase()
  if (t.includes('qawwal') || t.includes('kawwal') || t.includes('qaww')) return 'QAWWALI'
  if (t.includes('nasheed') || t.includes('nashid')) return 'NASHEED'
  if (t.includes('hamd') || t.includes('hamad')) return 'HAMD'
  if (t.includes('naat') || t.includes('madina') || t.includes('madinah') || t.includes('nabi')) return 'NAAT'
  return 'SEARCH'
}

export function videosToTracks(
  videos: RawVideoX[],
  prefix: string,
  forceCat?: string
): QalbTrack[] {
  const tracks: QalbTrack[] = []
  const seen = new Set<string>()
  for (const v of videos) {
    if (seen.has(v.videoId)) continue
    seen.add(v.videoId)
    tracks.push({
      id: `${prefix}-${v.videoId}`,
      videoId: v.videoId,
      title: v.title,
      artist: v.channel,
      category: forceCat ?? inferCategory(`${v.title} ${v.channel}`),
      thumbnailUrl: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
      playCount: v.views || undefined,
      tags: `dur:${v.durationSec}|pub:${v.published}`,
    })
  }
  return tracks
}

/** Static verified pool fallback — network fail par app kabhi khali nahi */
export function fallbackTracksFor(query: string, count: number): QalbTrack[] {
  const q = query.toLowerCase()
  const cat =
    q.includes('qawwal') ? 'QAWWALI'
    : q.includes('nasheed') ? 'NASHEED'
    : q.includes('hamd') ? 'HAMD'
    : 'NAAT'
  let pool = TRENDING_POOL.filter((e) => e.category === cat)
  if (pool.length < count) pool = [...pool, ...TRENDING_POOL.filter((e) => e.category !== cat)]
  return pool.slice(0, count).map((e, i) => poolToTrack(e, i))
}

/** views label — "1.2B views" (short form) */
export function viewsLabel(n?: number): string {
  if (!n || n <= 0) return ''
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B views`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M views`
  if (n >= 100_000) return `${Math.round(n / 100_000)}L views`
  if (n >= 1000) return `${Math.round(n / 1000)}K views`
  return `${n} views`
}
