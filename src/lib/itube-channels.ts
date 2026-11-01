'use client'

// Qalb — iTube CHANNELS (v0.5.21, v0.5.34 Data API rewrite)
// ─────────────────────────────────────────────────────────────────
// User request: iTube ke andar kisi bhi channel me jaa sake aur
// subscribe kar sake.
//
//   • CHANNEL SEARCH  — official Data API search (type=channel)
//   • CHANNEL PAGE    — Data API channelId search (order=date) +
//                       channels.list meta (name/avatar/subs)
//   • RELATED         — Data API me related-videos endpoint NAHI hai
//                       (YouTube ne 2016 me remove kiya) — isliye video
//                       title keywords se "more like this" search
//   • SUBSCRIBE       — YouTube ka asli subscribe Google login maangta
//     hai (3rd-party app ko API scope hi nahi milta) — isliye app-level
//     FOLLOW store: subscribed channels iTube home par avatar-row me
//     dikhte hain; channel page par "YouTube me kholen" button se asli
//     subscribe bhi ho sakta hai
//
// Subscriptions localStorage + native KV dono me mirror hote hain —
// app update ke baad bhi bache rehte hain (auth jaisa hi pattern).

import type { QalbTrack } from '@/lib/types'
import { videosToTracks } from '@/lib/innertube-x'
import {
  ytSearch,
  ytChannelVideos,
  ytChannelDetails,
  ytVideoDetails,
  titleKeywords,
  hasYtApiKey,
} from '@/lib/yt-data'
import { isBlockedResultX } from '@/lib/result-filter'
import { nativeKvGet, nativeKvSet } from '@/plugins/qalb-native'

// ── Types ────────────────────────────────────────────────────────

export interface ChannelInfo {
  id: string // UC…
  name: string
  avatar: string | null
  subsText: string
  videoCount: string
  desc: string
}

export interface ChannelVideosPage {
  tracks: QalbTrack[]
  continuation: string | null
  meta: { title: string; avatar: string; subs: string }
}

// ── Channel search (koi bhi channel dhoondo) ─────────────────────

export async function searchChannels(query: string, limit = 8): Promise<ChannelInfo[]> {
  if (!query.trim() || !hasYtApiKey()) return []
  const page = await ytSearch(query.trim(), { type: 'channel', maxResults: limit }).catch(
    () => null
  )
  if (!page) return []
  return page.channels
    .filter((c) => !isBlockedResultX(`${c.title} ${c.desc}`.toLowerCase()))
    .slice(0, limit)
    .map((c) => ({
      id: c.channelId,
      name: c.title,
      avatar: c.avatar,
      subsText: c.subsText,
      videoCount: c.videoCount ? `${c.videoCount} videos` : '',
      desc: c.desc,
    }))
}

// ── Channel page (channelId → latest videos + meta) ──────────────

export async function fetchChannelVideos(
  browseId: string,
  continuation: string | null,
  fallbackName = ''
): Promise<ChannelVideosPage | null> {
  if (!browseId || !hasYtApiKey()) return null

  const page = await ytChannelVideos(browseId, continuation).catch(() => null)
  if (!page) return null

  // Channel meta — pehli page par fetch (continuation par cached feel)
  let meta = { title: fallbackName, avatar: '', subs: '' }
  if (!continuation) {
    const ch = await ytChannelDetails(browseId).catch(() => null)
    if (ch) {
      meta = {
        title: ch.title || fallbackName,
        avatar: ch.avatar ?? '',
        subs: ch.subsText,
      }
    }
  }

  // Channel ki videos par strict islamic filter NAHI (user ne khud
  // channel chuna) — sirf blocked-content safety net
  const chanName = meta.title || fallbackName
  const tracks = videosToTracks(
    page.videos.map((v) => ({
      videoId: v.videoId,
      title: v.title,
      channel: chanName || v.channel || 'YouTube',
      channelId: v.channelId ?? browseId,
      views: v.views,
      viewsText: v.viewsText,
      durationSec: v.durationSec,
      published: v.published,
    })),
    'itchan'
  ).filter((t) => !isBlockedResultX(`${t.title} ${t.artist ?? ''}`.toLowerCase()))

  return {
    tracks,
    continuation: page.nextPageToken,
    meta,
  }
}

// ── Related videos ("more like this") ────────────────────────────
// Data API me asli related-feed endpoint nahi hai — isliye video ke
// title keywords se search (same-channel videos ko thoda boost).

export interface RelatedPage {
  tracks: QalbTrack[]
  continuation: string | null
}

// videoId → search keywords (continuation pages ke liye yaad rakhta hai)
const relKeywordCache = new Map<string, string>()

export async function fetchRelatedVideos(
  videoId: string,
  continuation: string | null
): Promise<RelatedPage | null> {
  if (!videoId || !hasYtApiKey()) return null

  // Data API me asli related-feed endpoint nahi — video title keywords
  // se "more like this" search. Continuation par wahi keyword + pageToken.
  let kw = relKeywordCache.get(videoId) ?? null
  let pageToken = continuation
  if (!kw) {
    const base = await ytVideoDetails(videoId).catch(() => null)
    if (!base?.title) return null
    kw = titleKeywords(base.title)
    relKeywordCache.set(videoId, kw)
    if (relKeywordCache.size > 50) {
      // purane entries hatao (bounded cache)
      const first = relKeywordCache.keys().next().value
      if (first) relKeywordCache.delete(first)
    }
    pageToken = null
  }

  const page = await ytSearch(kw, {
    pageToken,
    maxResults: 25,
    type: 'video',
  }).catch(() => null)
  if (!page) return null

  const tracks = videosToTracks(
    page.videos
      .filter((v) => v.durationSec > 0)
      .map((v) => ({
        videoId: v.videoId,
        title: v.title,
        channel: v.channel,
        channelId: v.channelId,
        views: v.views,
        viewsText: v.viewsText,
        durationSec: v.durationSec,
        published: v.published,
      })),
    'itrel'
  ).filter((t) => t.videoId !== videoId)

  return { tracks, continuation: page.nextPageToken }
}

// ── Track → channel ref (tags me stashed ch:UC…) ─────────────────

export function channelRefOf(t: QalbTrack): { id: string; name: string } | null {
  const m = t.tags?.match(/ch:(UC[\w-]+)/)
  if (m?.[1] && t.artist) return { id: m[1], name: t.artist }
  return null
}

function channelToInfo(c: { id: string; name: string }): ChannelInfo {
  return { id: c.id, name: c.name, avatar: null, subsText: '', videoCount: '', desc: '' }
}

/** Subscribe/feature cards ke liye — sub entry ya plain ref ko ChannelInfo banao */
export function asChannelInfo(c: SubEntry | { id: string; name: string }): ChannelInfo {
  return 'subsText' in c ? c : channelToInfo(c)
}

// ── Subscriptions (app-level follow store) ───────────────────────

const SUBS_KEY = 'qalb_itube_subs_v1'
const KV_SUBS = 'qalb_itube_subs_v1'
const MAX_SUBS = 60

export interface SubEntry extends ChannelInfo {
  t: number // subscribe time
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return (JSON.parse(raw) as T) ?? fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota — ignore */
  }
  // native mirror (fire-and-forget) — update-proof
  void nativeKvSet(key === SUBS_KEY ? KV_SUBS : key, JSON.stringify(value))
}

/** Subscribed channels (naye pehle) — native restore bhi yahin hota hai */
export function listSubs(): SubEntry[] {
  const list = readJson<SubEntry[]>(SUBS_KEY, [])
  return [...list].sort((a, b) => b.t - a.t)
}

let subsHydrated = false

/** App update par localStorage wipe ho jaye to native KV se subscriptions
 *  wapas laao (auth.ts init jaisa pattern) — iTube view mount par chalta hai */
export async function hydrateSubs(): Promise<void> {
  if (subsHydrated) return
  subsHydrated = true
  if (typeof window === 'undefined') return
  try {
    if (window.localStorage.getItem(SUBS_KEY)) return
    const raw = await nativeKvGet(KV_SUBS)
    if (raw) {
      const list = JSON.parse(raw) as SubEntry[]
      if (Array.isArray(list) && list.length) {
        window.localStorage.setItem(SUBS_KEY, JSON.stringify(list))
      }
    }
  } catch {
    /* native nahi / corrupt — normal flow */
  }
}

export function isSubscribed(id: string): boolean {
  return readJson<SubEntry[]>(SUBS_KEY, []).some((s) => s.id === id)
}

/** true = ab subscribed; false = unsubscribe */
export function toggleSub(ch: ChannelInfo): boolean {
  const list = readJson<SubEntry[]>(SUBS_KEY, [])
  const idx = list.findIndex((s) => s.id === ch.id)
  if (idx >= 0) {
    list.splice(idx, 1)
    writeJson(SUBS_KEY, list)
    return false
  }
  list.push({ ...ch, t: Date.now() })
  writeJson(SUBS_KEY, list.slice(-MAX_SUBS))
  return true
}

/** channel page kholte waqt — poori meta (avatar/subs) store me refresh */
export function refreshSubMeta(ch: ChannelInfo) {
  const list = readJson<SubEntry[]>(SUBS_KEY, [])
  const idx = list.findIndex((s) => s.id === ch.id)
  if (idx >= 0 && (list[idx].avatar !== ch.avatar || list[idx].subsText !== ch.subsText)) {
    list[idx] = { ...list[idx], avatar: ch.avatar || list[idx].avatar, subsText: ch.subsText || list[idx].subsText }
    writeJson(SUBS_KEY, list)
  }
}

// ── Featured channels (curated names → runtime resolve + cache) ──
// Naam hi store hote hain (id invent NAHI karte) — search se asli
// channel resolve hota hai, 7 din cache, fail wala chhup jata hai.

const FEAT_KEY = 'qalb_itube_feat_v1'
const FEAT_TTL = 7 * 86_400_000
const FEATURED_NAMES = [
  'Owais Raza Qadri',
  'Hafiz Ahmed Raza Qadri',
  'Farhan Ali Qadri',
  'Amjad Sabri',
  'Nusrat Fateh Ali Khan',
  'Mishary Rashid Alafasy',
]

let featPromise: Promise<ChannelInfo[]> | null = null

export function getFeaturedChannels(): Promise<ChannelInfo[]> {
  if (featPromise) return featPromise
  featPromise = (async () => {
    const cache = readJson<{ t: number; list: ChannelInfo[] }>(FEAT_KEY, { t: 0, list: [] })
    if (cache.t && Date.now() - cache.t < FEAT_TTL && cache.list.length) return cache.list

    // v0.5.34 — Data API quota-friendly: 6 alag searches (600 units) ki
    // jagah EK search "islamic naat qawwali channels" + curated names se
    // match. Fail ho to per-name fallback (sirf tab jab key ho).
    let list: ChannelInfo[] = []
    const have = new Set<string>()

    const bulk = await ytSearch(
      FEATURED_NAMES.join(' OR ') + ' naat qawwali',
      { type: 'channel', maxResults: 25 }
    ).catch(() => null)
    if (bulk) {
      for (const c of bulk.channels) {
        const name = FEATURED_NAMES.find(
          (n) =>
            c.title.toLowerCase().includes(n.toLowerCase()) ||
            n.toLowerCase().includes(c.title.toLowerCase())
        )
        if (name && !have.has(c.channelId)) {
          have.add(c.channelId)
          list.push({
            id: c.channelId,
            name: c.title,
            avatar: c.avatar,
            subsText: c.subsText,
            videoCount: c.videoCount ? `${c.videoCount} videos` : '',
            desc: c.desc,
          })
        }
      }
    }

    // jo curated names abhi bhi missing — per-name resolve (max 4)
    const missing = FEATURED_NAMES.filter((n) => !list.some((c) => c.name.toLowerCase().includes(n.toLowerCase())))
    if (missing.length) {
      const settled = await Promise.allSettled(missing.slice(0, 4).map((n) => searchChannels(n, 1)))
      for (const r of settled) {
        if (r.status !== 'fulfilled' || !r.value.length) continue
        const c = r.value[0]
        if (!have.has(c.id)) {
          have.add(c.id)
          list.push(c)
        }
      }
    }

    if (list.length) writeJson(FEAT_KEY, { t: Date.now(), list })
    return list
  })()
  return featPromise
}
