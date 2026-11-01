// Qalb — ENRICHED search core — OFFICIAL Data API v3 (v0.5.34)
// ─────────────────────────────────────────────────────────────────
// COMPLIANCE: v0.5.33 tak ye core YouTube ka private InnerTube endpoint
// (/youtubei/v1) use karta tha — wo API Terms ke khilaaf tha. Ab enriched
// search (views/duration/published ke saath) official YouTube Data API
// v3 se hota hai (yt-data.ts).
//
// Callers (API unchanged): live-catalog.ts (client), itube.ts (client),
// /api/yt-live route (server). Ek hi core, kahin bhi chalao.
//
// SP filter mapping (pehle InnerTube sp-tokens the, ab friendly keys):
//   views  → order=viewCount
//   date   → order=date
//   week/month/year → publishedAfter (7/30/365 din) + relevance
//   videoOnly (relevance) → default relevance order

import type { QalbTrack } from '@/lib/types'
import { TRENDING_POOL, poolToTrack } from '@/lib/trending-pool'
import { ytSearch, type DataVideo } from '@/lib/yt-data'

// Verified search-filter keys (Data API mapping — upar table dekho)
export const SP = {
  videoOnly: 'relevance', // video-only + relevance order
  views: 'views', // view-count sort (famous first)
  date: 'date', // upload-date sort
  week: 'week', // this week
  month: 'month', // this month
  year: 'year', // this year
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

// ── enriched video shape (callers isi par depend hain) ───────────

export interface RawVideoX {
  videoId: string
  title: string
  channel: string
  channelId: string | null // UC… — video se channel page khulne ke liye
  views: number
  viewsText: string
  durationSec: number // 0 = live/unknown (skip hota hai)
  published: string
}

function dataVideoToRawX(v: DataVideo): RawVideoX {
  return {
    videoId: v.videoId,
    title: v.title,
    channel: v.channel,
    channelId: v.channelId,
    views: v.views,
    viewsText: v.viewsText || (v.views ? `${v.views} views` : ''),
    durationSec: v.durationSec,
    published: v.published,
  }
}

export interface PageX {
  videos: RawVideoX[]
  continuation: string | null
}

/** sp-key → Data API opts */
function optsForParams(params: string) {
  switch (params) {
    case SP.views:
      return { order: 'viewCount' as const }
    case SP.date:
      return { order: 'date' as const }
    case SP.week:
      return { order: 'viewCount' as const, publishedAfterDays: 7 }
    case SP.month:
      return { order: 'viewCount' as const, publishedAfterDays: 30 }
    case SP.year:
      return { order: 'viewCount' as const, publishedAfterDays: 365 }
    default:
      return { order: 'relevance' as const }
  }
}

/**
 * ENRICHED search — official Data API v3. Query + filter key +
 * continuation (Data API nextPageToken). Live/upcoming/3h+ videos skip
 * (pehle jaisa hi rule — naat/qawwali/bayan playback ke liye).
 */
export async function innertubeSearchX(
  query: string,
  params: string,
  continuation: string | null
): Promise<PageX | null> {
  const q = query.trim()
  if (!q && !continuation) return null
  const opts = optsForParams(params)
  const page = await ytSearch(q, {
    ...opts,
    pageToken: continuation,
    maxResults: 25,
    type: 'video',
  }).catch(() => null)
  if (!page) return null

  // duration filter: live (dur 0) aur 3h+ lambi videos skip — playback
  // engine naat/qawwali ke liye bana hai
  const videos = page.videos
    .filter((v) => v.durationSec > 0 && v.durationSec < 3 * 3600)
    .map(dataVideoToRawX)
  return { videos, continuation: page.nextPageToken }
}

// ── views/duration parsers (legacy exports — scripts/tests use) ──

export function parseViews(text: unknown): number {
  if (typeof text !== 'string') return 0
  const digits = text.replace(/[^\d]/g, '')
  const n = parseInt(digits, 10)
  return Number.isFinite(n) ? n : 0
}

/** "7.4K views" / "1.2M views" / "10 lakh views" → number */
export function parseViewsShort(text: unknown): number {
  if (typeof text !== 'string') return 0
  const m = text
    .toLowerCase()
    .replace(/,/g, '')
    .match(/([\d.]+)\s*(k|k|hazar|l|lac|lakh|m|mn|crore|cr|b|bn)?\s*(views|dekh|bar)?/)
  if (!m) return parseViews(text)
  const base = Number.parseFloat(m[1])
  if (!Number.isFinite(base)) return parseViews(text)
  const mult: Record<string, number> = {
    k: 1e3,
    hazar: 1e3,
    l: 1e5,
    lac: 1e5,
    lakh: 1e5,
    m: 1e6,
    mn: 1e6,
    crore: 1e7,
    cr: 1e7,
    b: 1e9,
    bn: 1e9,
  }
  return Math.round(base * (mult[m[2]] ?? 1))
}

export function parseDuration(text: unknown): number {
  if (typeof text !== 'string') return 0
  const parts = text.split(':').map((p) => parseInt(p, 10))
  if (parts.some((p) => !Number.isFinite(p))) return 0
  let sec = 0
  for (const p of parts) sec = sec * 60 + p
  return sec
}

// ── track mappers (unchanged public API) ─────────────────────────

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
      tags: `dur:${v.durationSec}|pub:${v.published}${v.channelId ? `|ch:${v.channelId}` : ''}`,
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
