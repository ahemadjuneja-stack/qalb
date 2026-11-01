// Qalb — OFFICIAL YouTube Data API v3 client (v0.5.34)
// ─────────────────────────────────────────────────────────────────
// COMPLIANCE: v0.5.34 se saara private InnerTube (/youtubei/v1) traffic
// BAND. Search/discovery ab SIRF official YouTube Data API v3 se —
// YouTube ki apni public API, ToS-compliant.
//
// API KEY (Google Cloud Console → "YouTube Data API v3" enable → API key):
//   • NEXT_PUBLIC_YOUTUBE_API_KEY — APK/web build me bake (client direct)
//   • YOUTUBE_API_KEY             — hosted server runtime (routes)
// Free quota: 10,000 units/day (search = 100 units, lists = 1 unit) —
// doston wali app ke liye kaafi.
//
// Client + server dono par chalta hai: native APK CapacitorHttp se
// (CORS bypass), web/server normal fetch se.

/* eslint-disable @typescript-eslint/no-explicit-any */

async function isNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    return Boolean(Capacitor.isNativePlatform?.())
  } catch {
    return false
  }
}

/** Data API key — client build (NEXT_PUBLIC) ya server runtime env */
export function ytApiKey(): string {
  try {
    const k =
      process.env.NEXT_PUBLIC_YOUTUBE_API_KEY ||
      (process.env as Record<string, string | undefined>).YOUTUBE_API_KEY ||
      ''
    return typeof k === 'string' ? k.trim() : ''
  } catch {
    return ''
  }
}

export function hasYtApiKey(): boolean {
  return Boolean(ytApiKey())
}

async function apiGet(path: string, params: Record<string, string>): Promise<any | null> {
  const key = ytApiKey()
  if (!key) return null
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`)
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v)
  }
  url.searchParams.set('key', key)
  try {
    if (await isNative()) {
      const { CapacitorHttp } = await import('@capacitor/core')
      const res = await CapacitorHttp.get({
        url: url.toString(),
        connectTimeout: 8000,
        readTimeout: 12000,
        responseType: 'json',
      })
      if (res.status >= 200 && res.status < 300) return res.data
      return null
    }
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(12000) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

// ── types ────────────────────────────────────────────────────────

export interface DataVideo {
  videoId: string
  title: string
  channel: string
  channelId: string | null
  views: number
  viewsText: string
  durationSec: number // 0 = live/unknown
  published: string // "3 weeks ago" style label
  publishedAt: string // raw ISO
}

export interface DataChannel {
  channelId: string
  title: string
  avatar: string | null
  subsText: string
  videoCount: string
  desc: string
}

export interface YtSearchPage {
  videos: DataVideo[]
  channels: DataChannel[]
  nextPageToken: string | null
}

export interface YtSearchOpts {
  pageToken?: string | null
  order?: 'relevance' | 'date' | 'viewCount' | 'rating'
  publishedAfterDays?: number | null
  channelId?: string | null
  eventType?: 'live' | 'upcoming' | 'completed' | null
  videoDuration?: 'any' | 'short' | 'medium' | 'long' | null
  videoCategoryId?: string | null
  maxResults?: number
  type?: 'video' | 'channel'
}

// ── helpers ──────────────────────────────────────────────────────

/** Data API titles HTML-encoded aate hain ("Amp;B" etc.) — decode */
function decodeEntities(s: unknown): string {
  if (typeof s !== 'string' || !s.includes('&')) return typeof s === 'string' ? s : ''
  const txt = s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
  if (!txt.includes('&#') && !txt.includes('&')) return txt
  // baki numeric entities — browser parser (web) ya regex fallback
  try {
    if (typeof document !== 'undefined') {
      const el = document.createElement('textarea')
      el.innerHTML = txt
      return el.value
    }
  } catch {
    /* server */
  }
  return txt.replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
}

/** ISO8601 duration ("PT4M13S") → seconds */
export function isoDurationToSec(iso: unknown): number {
  if (typeof iso !== 'string') return 0
  const m = iso.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
  if (!m) return 0
  const [, d, h, mi, s] = m
  const sec =
    (d ? Number(d) * 86400 : 0) +
    (h ? Number(h) * 3600 : 0) +
    (mi ? Number(mi) * 60 : 0) +
    (s ? Number(s) : 0)
  return Number.isFinite(sec) ? sec : 0
}

export function shortViewsLabel(n: number): string {
  if (!n || n <= 0) return ''
  if (n >= 1e9) return `${(n / 1e9).toFixed(1).replace(/\.0$/, '')}B views`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M views`
  if (n >= 1e5) return `${Math.round(n / 1e5)}L views`
  if (n >= 1e3) return `${Math.round(n / 1e3)}K views`
  return `${n} views`
}

function subsLabel(n: number): string {
  if (!n || n <= 0) return ''
  if (n >= 1e7) return `${(n / 1e7).toFixed(1).replace(/\.0$/, '')}Cr subscribers`
  if (n >= 1e5) return `${Math.round(n / 1e5)}L subscribers`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K subscribers`
  return `${n} subscribers`
}

function agoLabel(publishedAt: unknown): string {
  if (typeof publishedAt !== 'string' || !publishedAt) return ''
  const t = Date.parse(publishedAt)
  if (!Number.isFinite(t)) return ''
  const days = Math.max(1, Math.round((Date.now() - t) / 86400000))
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`
  if (days < 30) {
    const w = Math.round(days / 7)
    return `${w} week${w > 1 ? 's' : ''} ago`
  }
  if (days < 365) {
    const mo = Math.round(days / 30)
    return `${mo} month${mo > 1 ? 's' : ''} ago`
  }
  const y = Math.round(days / 365)
  return `${y} year${y > 1 ? 's' : ''} ago`
}

// ── enrichment (videos.list / channels.list — 1 unit per call) ───

interface VideoMeta {
  views: number
  durationSec: number
  channel: string
  channelId: string | null
  publishedAt: string
}

async function videosDetails(ids: string[]): Promise<Map<string, VideoMeta>> {
  const out = new Map<string, VideoMeta>()
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50)
    const data = await apiGet('videos', {
      part: 'statistics,contentDetails,snippet',
      id: chunk.join(','),
      maxResults: '50',
    })
    const items = Array.isArray(data?.items) ? data.items : []
    for (const it of items) {
      const id = typeof it?.id === 'string' ? it.id : null
      if (!id) continue
      out.set(id, {
        views: Number(it?.statistics?.viewCount ?? 0) || 0,
        durationSec: isoDurationToSec(it?.contentDetails?.duration),
        channel: decodeEntities(it?.snippet?.channelTitle ?? 'YouTube'),
        channelId: typeof it?.snippet?.channelId === 'string' ? it.snippet.channelId : null,
        publishedAt: typeof it?.snippet?.publishedAt === 'string' ? it.snippet.publishedAt : '',
      })
    }
  }
  return out
}

export async function channelsDetails(ids: string[]): Promise<Map<string, DataChannel>> {
  const out = new Map<string, DataChannel>()
  if (!ids.length) return out
  const data = await apiGet('channels', {
    part: 'snippet,statistics',
    id: ids.slice(0, 50).join(','),
    maxResults: '50',
  })
  const items = Array.isArray(data?.items) ? data.items : []
  for (const it of items) {
    const id = typeof it?.id === 'string' ? it.id : null
    if (!id) continue
    out.set(id, {
      channelId: id,
      title: decodeEntities(it?.snippet?.title ?? 'YouTube'),
      avatar:
        it?.snippet?.thumbnails?.high?.url ??
        it?.snippet?.thumbnails?.medium?.url ??
        it?.snippet?.thumbnails?.default?.url ??
        null,
      subsText: subsLabel(Number(it?.statistics?.subscriberCount ?? 0) || 0),
      videoCount: String(it?.statistics?.videoCount ?? ''),
      desc: decodeEntities(String(it?.snippet?.description ?? '').slice(0, 140)),
    })
  }
  return out
}

// ── main search (search.list — 100 units) ────────────────────────

/**
 * Official search — YouTube Data API v3. type='video' par results
 * enrichment ke saath aate hain (views/duration/published — videos.list
 * batch, +1 unit). Islamic content ke liye safeSearch=strict +
 * relevanceLanguage=ur default.
 */
export async function ytSearch(q: string, opts: YtSearchOpts = {}): Promise<YtSearchPage | null> {
  const type = opts.type ?? 'video'
  const params: Record<string, string> = {
    part: 'snippet',
    type,
    maxResults: String(Math.min(50, Math.max(1, opts.maxResults ?? 25))),
    safeSearch: 'strict',
    relevanceLanguage: 'ur',
    regionCode: 'IN',
  }
  if (q) params.q = q
  if (opts.pageToken) params.pageToken = opts.pageToken
  if (opts.order) params.order = opts.order
  if (opts.channelId) params.channelId = opts.channelId
  if (opts.eventType) params.eventType = opts.eventType
  if (opts.videoCategoryId) params.videoCategoryId = opts.videoCategoryId
  if (type === 'video') {
    params.videoEmbeddable = 'true'
    if (opts.videoDuration && opts.videoDuration !== 'any') {
      params.videoDuration = opts.videoDuration
    }
    if (opts.publishedAfterDays && opts.publishedAfterDays > 0) {
      params.publishedAfter = new Date(
        Date.now() - opts.publishedAfterDays * 86400000
      ).toISOString()
    }
  }

  const data = await apiGet('search', params)
  if (!data || typeof data !== 'object') return null
  const items = Array.isArray(data.items) ? data.items : []
  if (!items.length && !data.nextPageToken) return null

  const videos: DataVideo[] = []
  const channels: DataChannel[] = []
  for (const it of items) {
    const sn = it?.snippet
    if (!sn) continue
    const videoId = typeof it?.id?.videoId === 'string' ? it.id.videoId : null
    const chId = typeof it?.id?.channelId === 'string' ? it.id.channelId : null
    const title = decodeEntities(sn.title ?? '')
    if (!title) continue
    if (videoId) {
      videos.push({
        videoId,
        title,
        channel: decodeEntities(sn.channelTitle ?? 'YouTube'),
        channelId: typeof sn.channelId === 'string' ? sn.channelId : null,
        views: 0,
        viewsText: '',
        durationSec: 0,
        published: agoLabel(sn.publishedAt),
        publishedAt: typeof sn.publishedAt === 'string' ? sn.publishedAt : '',
      })
    } else if (chId) {
      channels.push({
        channelId: chId,
        title,
        avatar: sn.thumbnails?.high?.url ?? sn.thumbnails?.medium?.url ?? null,
        subsText: '',
        videoCount: '',
        desc: decodeEntities(String(sn.description ?? '').slice(0, 140)),
      })
    }
  }

  if (videos.length) {
    const metas = await videosDetails(videos.map((v) => v.videoId))
    for (const v of videos) {
      const m = metas.get(v.videoId)
      if (!m) continue
      v.views = m.views
      v.viewsText = shortViewsLabel(m.views)
      v.durationSec = m.durationSec
      v.channel = m.channel || v.channel
      v.channelId = m.channelId || v.channelId
      v.publishedAt = m.publishedAt || v.publishedAt
      v.published = agoLabel(v.publishedAt) || v.published
    }
  }
  if (channels.length) {
    const metas = await channelsDetails(channels.map((c) => c.channelId))
    for (const c of channels) {
      const m = metas.get(c.channelId)
      if (!m) continue
      c.subsText = m.subsText
      c.videoCount = m.videoCount
      c.avatar = m.avatar || c.avatar
      c.desc = c.desc || m.desc
    }
  }

  return { videos, channels, nextPageToken: typeof data.nextPageToken === 'string' ? data.nextPageToken : null }
}

/** Ek channel ki latest uploads (channel page) — order=date */
export async function ytChannelVideos(
  channelId: string,
  pageToken: string | null = null,
  maxResults = 25
): Promise<YtSearchPage | null> {
  return ytSearch('', { channelId, pageToken, order: 'date', maxResults })
}

/** Channel ka public meta (title/avatar/subs/videoCount) — 1 unit */
export async function ytChannelDetails(channelId: string): Promise<DataChannel | null> {
  const map = await channelsDetails([channelId])
  return map.get(channelId) ?? null
}

/** Ek video ka meta (title/channel/channelId) — related-videos fallback ke liye */
export async function ytVideoDetails(
  videoId: string
): Promise<{ title: string; channel: string; channelId: string | null } | null> {
  const data = await apiGet('videos', { part: 'snippet', id: videoId })
  const it = Array.isArray(data?.items) ? data.items[0] : null
  if (!it?.snippet) return null
  return {
    title: decodeEntities(it.snippet.title ?? ''),
    channel: decodeEntities(it.snippet.channelTitle ?? 'YouTube'),
    channelId: typeof it.snippet.channelId === 'string' ? it.snippet.channelId : null,
  }
}

/** Title keywords nikalo (related search ke liye) — noise words hatao */
export function titleKeywords(title: string, maxWords = 8): string {
  const cleaned = title
    .replace(/[(\[{][^)\]}]*[)\]}]/g, ' ') // (official video) jaise brackets
    .replace(/[|•·—–:/\\]/g, ' ')
    .replace(/\b(official|video|hd|4k|lyrical|full|song|audio|feat|ft|version|new|latest)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned.split(' ').slice(0, maxWords).join(' ') || title
}

/** Shorts-style short videos (≤60s) — search + duration filter */
export async function ytShortsSearch(
  q: string,
  maxResults = 30
): Promise<{ videoId: string; title: string; views: string }[]> {
  const page = await ytSearch(q, { videoDuration: 'short', order: 'viewCount', maxResults: 40 })
  if (!page) return []
  return page.videos
    .filter((v) => v.durationSec > 0 && v.durationSec <= 61)
    .slice(0, maxResults)
    .map((v) => ({ videoId: v.videoId, title: v.title, views: v.viewsText || `${v.views} views` }))
}
