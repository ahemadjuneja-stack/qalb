'use client'

// Qalb — iTube CHANNELS (v0.5.21)
// ─────────────────────────────────────────────────────────────────
// User request: iTube ke andar kisi bhi channel me jaa sake aur
// subscribe kar sake.
//
//   • CHANNEL SEARCH  — InnerTube search se channelRenderer + video
//     byline fallback (collectChannelsX) — koi bhi channel mil jayega
//   • CHANNEL PAGE    — InnerTube browse (browseId UC…, Videos-tab
//     params) se channel ki videos + header meta (name/avatar/subs)
//   • SUBSCRIBE       — YouTube ka asli subscribe Google login maangta
//     hai (3rd-party app ko API scope hi nahi milta) — isliye app-level
//     FOLLOW store: subscribed channels iTube home par avatar-row me
//     dikhte hain; channel page par "YouTube me kholen" button se asli
//     subscribe bhi ho sakta hai
//
// Subscriptions localStorage + native KV dono me mirror hote hain —
// app update ke baad bhi bache rehte hain (auth jaisa hi pattern).

import type { QalbTrack } from '@/lib/types'
import {
  CLIENT_VERSION,
  DESKTOP_UA,
  INNERTUBE_CONTEXT,
  INNERTUBE_KEY,
  collectChannelMetaX,
  collectChannelsX,
  collectVideosX,
  videosToTracks,
  type RawChannelX,
} from '@/lib/innertube-x'
import { innertubePostJson } from '@/lib/youtube-search-source'
import { isBlockedResult } from '@/lib/result-filter'
import { isNativeApp, nativeKvGet, nativeKvSet } from '@/plugins/qalb-native'

/* eslint-disable @typescript-eslint/no-explicit-any */

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

const BROWSE_HEADERS = {
  'User-Agent': DESKTOP_UA,
  'Accept-Language': 'en-US,en;q=0.9,ur;q=0.8',
  'X-YouTube-Client-Name': '1',
  'X-YouTube-Client-Version': CLIENT_VERSION,
  Referer: 'https://www.youtube.com/',
}

// Verified channel VIDEOS-tab browse params (InnerTube standard)
const VIDEOS_TAB_PARAMS = 'EgZ2aWRlb3PyBgQKAjoA'

// ── Channel search (koi bhi channel dhoondo) ─────────────────────

export async function searchChannels(query: string, limit = 8): Promise<ChannelInfo[]> {
  if (!isNativeApp() || !query.trim()) return []
  const data = await innertubePostJson(
    `https://www.youtube.com/youtubei/v1/search?key=${INNERTUBE_KEY}&prettyPrint=false`,
    BROWSE_HEADERS,
    { ...INNERTUBE_CONTEXT, query: query.trim() }
  ).catch(() => null)
  if (!data) return []
  const raw: RawChannelX[] = []
  collectChannelsX(data, raw)
  return raw
    .filter((c) => !isBlockedResult(`${c.title} ${c.desc}`.toLowerCase()))
    .slice(0, limit)
    .map((c) => ({
      id: c.channelId,
      name: c.title,
      avatar: c.avatar,
      subsText: c.subsText,
      videoCount: c.videoCount,
      desc: c.desc,
    }))
}

// ── Channel page (browseId → videos tab) ─────────────────────────

export async function fetchChannelVideos(
  browseId: string,
  continuation: string | null,
  fallbackName = ''
): Promise<ChannelVideosPage | null> {
  if (!isNativeApp() || !browseId) return null
  const post = (body: Record<string, unknown>) =>
    innertubePostJson(
      `https://www.youtube.com/youtubei/v1/browse?key=${INNERTUBE_KEY}&prettyPrint=false`,
      BROWSE_HEADERS,
      body
    ).catch(() => null)

  let data = continuation
    ? await post({ ...INNERTUBE_CONTEXT, continuation })
    : await post({ ...INNERTUBE_CONTEXT, browseId, params: VIDEOS_TAB_PARAMS })

  // Videos-tab params fail ho (layout change) — plain browse (home tab)
  if (!continuation && data) {
    const probe: any[] = []
    collectVideosX(data, probe, [])
    if (!probe.length) {
      const alt = await post({ ...INNERTUBE_CONTEXT, browseId })
      if (alt) {
        const altVideos: any[] = []
        collectVideosX(alt, altVideos, [])
        if (altVideos.length) data = alt
      }
    }
  }
  if (!data) return null

  const videos: any[] = []
  const tokens: string[] = []
  collectVideosX(data, videos, tokens)
  const meta: Record<string, string> = { title: fallbackName, avatar: '', subs: '' }
  collectChannelMetaX(data, meta)

  // Channel ki videos par strict islamic filter NAHI (user ne khud
  // channel chuna) — sirf blocked-content safety net
  const tracks = videosToTracks(videos, 'itchan').filter(
    (t) => !isBlockedResult(`${t.title} ${t.artist ?? ''}`.toLowerCase())
  )
  return {
    tracks,
    continuation: tokens[0] ?? null,
    meta: { title: meta.title || fallbackName, avatar: meta.avatar, subs: meta.subs },
  }
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

    const settled = await Promise.allSettled(FEATURED_NAMES.map((n) => searchChannels(n, 1)))
    const list: ChannelInfo[] = []
    const have = new Set<string>()
    for (const r of settled) {
      if (r.status !== 'fulfilled' || !r.value.length) continue
      const c = r.value[0]
      if (!have.has(c.id)) {
        have.add(c.id)
        list.push(c)
      }
    }
    if (list.length) writeJson(FEAT_KEY, { t: Date.now(), list })
    return list
  })()
  return featPromise
}

/** Subscribe/feature cards ke liye — sub entry ya plain ref ko ChannelInfo banao */
export function asChannelInfo(c: SubEntry | { id: string; name: string }): ChannelInfo {
  return 'subsText' in c ? c : channelToInfo(c)
}
