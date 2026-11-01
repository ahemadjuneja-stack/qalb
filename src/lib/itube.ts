'use client'

// iTube — YouTube-style ISLAMIC video hub (v0.5.0, v0.5.34 Data API)
// ─────────────────────────────────────────────────────────────────
// Reels ki jagah: official Data API enriched search (views/duration/
// published ke saath) + STRICT Islamic filter + taste-based
// personalization. Islamic content pehli priority — chips, home feed
// aur search sab islamic-only filter se guzarte hain.
//
//   • Chips  → curated Islamic queries (Naat/Qawwali/Bayan/Movies/Series…)
//   • Search → user free-text, results paak filter se guzarte hain
//   • "Aap ke liye" → in-app taste profile (kya suna/dekha) se query
//
// HONEST NOTE: YouTube apni watch-history kisi 3rd-party app ko nahi
// deta (API me scope hi nahi hai) — isliye "aap ka algorithm" in-app
// pasand (play events) + curated Islamic sources se banta hai.

import type { QalbTrack } from '@/lib/types'
import {
  innertubeSearchX,
  videosToTracks,
  fallbackTracksFor,
  SP,
  type PageX,
} from '@/lib/innertube-x'
import {
  hasIslamicMarker,
  isBlockedResultX,
} from '@/lib/result-filter'
import { QALB } from '@/lib/qalb'
import { isNativeApp } from '@/plugins/qalb-native'
import { ITUBE_CATS, splitSeen, markShown, hashStr, getItubeTaste } from '@/lib/itube-brain'
import { mulberry32 } from '@/lib/daily-trending'

// ── Chips (YouTube category-bar style) ──────────────────────────

export interface ITubeChip {
  key: string
  label: string
  query: string
}

export const ITUBE_CHIPS: ITubeChip[] = [
  { key: 'all', label: 'All', query: 'islamic video naat qawwali bayan' },
  { key: 'naat', label: 'Naat', query: 'naat sharif best' },
  { key: 'qawwali', label: 'Qawwali', query: 'best qawwali' },
  { key: 'bayan', label: 'Bayan', query: 'islamic bayan' },
  { key: 'hamd', label: 'Hamd', query: 'hamd e bari taala' },
  { key: 'nasheed', label: 'Nasheed', query: 'islamic nasheed' },
  { key: 'tilawat', label: 'Tilawat', query: 'quran tilawat beautiful' },
  { key: 'hadith', label: 'Hadith', query: 'hadith sharif explanation' },
  { key: 'movies', label: 'Islamic Movies', query: 'islamic movie full hd' },
  { key: 'series', label: 'Islamic Series', query: 'islamic series episode' },
  { key: 'history', label: 'Islamic History', query: 'islamic history documentary' },
  { key: 'kids', label: 'Islamic Kids', query: 'islamic cartoons kids' },
]

// ── InnerTube fetch (native direct / web hosted — searchX pattern) ──

export async function itubeSearchX(
  q: string,
  params: string,
  continuation: string | null
): Promise<PageX | null> {
  if (isNativeApp()) return innertubeSearchX(q, params, continuation)
  // web — hosted route (same-origin ya NEXT_PUBLIC_API_BASE)
  try {
    const base = QALB.apiBase || window.location.origin
    const url = new URL(`${base}/api/yt-live`)
    if (q) url.searchParams.set('q', q)
    if (params) url.searchParams.set('sp', params)
    if (continuation) url.searchParams.set('cont', continuation)
    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(14_000),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      videos?: PageX['videos']
      continuation?: string | null
    }
    if (!data.videos) return null
    return { videos: data.videos, continuation: data.continuation ?? null }
  } catch {
    return null
  }
}

// ── STRICT Islamic-only filter (iTube ka dil) ───────────────────
// iTube me NEUTRAL results bhi pass NAHI hote (home search se zyada
// strict) — sirf pakka islamic content dikhta hai.

export function islamicOnly(tracks: QalbTrack[]): QalbTrack[] {
  if (!tracks.length) return tracks
  return tracks.filter((t) => {
    const text = `${t.title ?? ''} ${t.artist ?? ''}`.toLowerCase()
    // v0.5.25 — series-aware filter: Ertugrul/Yousuf jaise islamic
    // series/movies ke titles me 'movie/film' word ho to bhi pass
    if (isBlockedResultX(text)) return false
    // curated queries (naat/qawwali...) se aaye results ka category
    // khud islamic hota hai — marker na bhi mile to category kaafi hai
    if (['NAAT', 'HAMD', 'QAWWALI', 'NASHEED', 'MOVIES'].includes(t.category)) return true
    return hasIslamicMarker(text)
  })
}

// ── Main fetch — chip/search dono isi se ────────────────────────

export interface ITubePage {
  tracks: QalbTrack[]
  continuation: string | null
}

/** chip.key → brain category (query variants pool wahi se aata hai) */
const CHIP_CAT: Record<string, string> = {
  naat: 'NAAT',
  qawwali: 'QAWWALI',
  bayan: 'BAYAN',
  hamd: 'HAMD',
  nasheed: 'NASHEED',
  tilawat: 'TILAWAT',
  hadith: 'HADITH',
  history: 'HISTORY',
  kids: 'KIDS',
  movies: 'MOVIES',
  series: 'MOVIES',
}

/**
 * v0.5.15 — HAR CLICK PAR NAYA MIX:
 *   • chip fresh-load par query VARIANTS rotate (day-seed + salt) — same
 *     query dobara nahi jaati
 *   • DO queries parallel → bada pool → zyada naye videos
 *   • seeded shuffle + unseen-channel boost — har baar alag order,
 *     user ki dekhi channels halka neeche (discovery)
 *   • seen-ring filter — jo dikh chuke wo peeche hat jate hain
 *
 * v0.5.25 — FAMOUS-FIRST (user report: "famous qawwali/naat nahi aaraha,
 * jo aaraha hai wo famous nahi hai"): pehle 50% weight RANDOM jitter ka
 * tha — isse 10K views wala naat 120M wale Tajdar-e-Haram se UPAR aa
 * jata tha. Ab views-quality dominant (0.72) — famous hamesha top, jitter
 * sirf same-tier ordering ghumaane ke liye (0.2).
 */
function chipOrder(tracks: QalbTrack[], salt: number): QalbTrack[] {
  const taste = getItubeTaste()
  const chanSeen = new Set(taste.chanScores.map(([a]) => a))
  const scored = tracks.map((t) => {
    const quality = Math.min(1, Math.log10((t.playCount ?? 0) + 1) / 9)
    const unseenChan = t.artist && chanSeen.has(t.artist) ? 0 : 1
    const jitter = mulberry32(hashStr(t.videoId + salt))()
    const s = 0.72 * quality + 0.08 * unseenChan + 0.2 * jitter
    return { t, s }
  })
  scored.sort((a, b) => b.s - a.s)
  return scored.map((x) => x.t)
}

/** seen hatao — fresh kam ho to reused tail se poora karo (app kabhi khali nahi) */
function freshFirst(tracks: QalbTrack[], want: number): QalbTrack[] {
  const { fresh, reused } = splitSeen(tracks)
  if (fresh.length >= want) return fresh
  return [...fresh, ...reused.slice(0, Math.max(0, want - fresh.length))]
}

/** static fallback pool ko bhi har baar alag dikhao (rotate + jitter) */
function rotateFallback(query: string, count: number, salt: number): QalbTrack[] {
  const pool = islamicOnly(fallbackTracksFor(query, 24))
  if (pool.length <= count) return pool
  const off = ((salt % pool.length) + pool.length) % pool.length
  const rotated = [...pool.slice(off), ...pool.slice(0, off)]
  return chipOrder(rotated, salt).slice(0, count)
}

/** iTube page — strict islamic filter ke saath InnerTube search */
export async function itubeFetch(
  query: string,
  continuation: string | null,
  opts?: { chipKey?: string; salt?: number }
): Promise<ITubePage> {
  const salt = opts?.salt ?? 0

  // ── FRESH CHIP LOAD — variants + parallel + shuffle (har click naya) ──
  if (!continuation && opts?.chipKey) {
    const cat = CHIP_CAT[opts.chipKey]
    const variants =
      ITUBE_CATS.find((c) => c.key === cat)?.queries ?? [query]
    const seed = Math.floor(Date.now() / 3_600_000) + salt * 7919
    const rnd = mulberry32(seed)
    const iA = Math.floor(rnd() * 1000 + salt) % variants.length
    const iB = (iA + 1 + Math.floor(rnd() * 7)) % variants.length
    const qa = variants[iA]
    const qb = variants[iB === iA ? (iA + 1) % variants.length : iB]

    const [pa, pb] = await Promise.all([
      // v0.5.25 — qa VIEWS-SORT (famous first — YouTube trending feel),
      // qb videoOnly (naye/neutral results bhi pool me)
      itubeSearchX(qa, SP.views, null),
      qb !== qa ? itubeSearchX(qb, SP.videoOnly, null) : Promise.resolve(null),
    ])

    const byId = new Map<string, QalbTrack>()
    for (const page of [pa, pb]) {
      if (!page) continue
      for (const t of islamicOnly(videosToTracks(page.videos, 'itube'))) {
        const prev = byId.get(t.videoId)
        if (!prev || (t.playCount ?? 0) > (prev.playCount ?? 0)) byId.set(t.videoId, t)
      }
    }
    let tracks = [...byId.values()]
    tracks = freshFirst(chipOrder(tracks, salt), 18)
    if (tracks.length) return { tracks, continuation: pa?.continuation ?? null }
    // network fail → fallback (bhi rotate hota hai)
    return { tracks: rotateFallback(query, 12, salt), continuation: null }
  }

  // v0.5.25 — user free-text search: videoOnly params (channels/playlists
  // results me nahi, sirf VIDEOS — Ertugrul/Yousuf jaise series ke
  // EPISODES seedha milte hain; channels wali alag row upar hoti hai)
  const page = await itubeSearchX(query, continuation ? '' : SP.videoOnly, continuation)

  // continuation pages par filter ke baad khali aa sake — 1 retry
  if (page && !page.videos.length && continuation) {
    const retry = await itubeSearchX(query, '', continuation)
    if (retry && retry.videos.length) {
      const tracks = islamicOnly(videosToTracks(retry.videos, 'itube'))
      return { tracks: freshFirst(tracks, 14), continuation: retry.continuation }
    }
    return { tracks: [], continuation: null }
  }

  if (!page || !page.videos.length) {
    // network fail — verified islamic pool fallback (app kabhi khali nahi)
    return { tracks: rotateFallback(query, 12, salt), continuation: null }
  }

  let tracks = islamicOnly(videosToTracks(page.videos, 'itube'))
  // strict filter ke baad bhi kuch bacha hi nahi — fallback de do
  if (!tracks.length && !continuation) {
    tracks = rotateFallback(query, 12, salt)
    return { tracks, continuation: null }
  }

  // search / continuation — seen pehle hatado + har baar alag order
  if (!continuation) {
    tracks = freshFirst(chipOrder(tracks, salt), 14)
  } else {
    tracks = freshFirst(tracks, 14)
  }
  return { tracks, continuation: page.continuation }
}

// ── Track helpers (tags me stashed dur/pub + views) ─────────────

export function trackDurSec(t: QalbTrack): number | null {
  const m = t.tags?.match(/dur:(\d+)/)
  return m ? Number(m[1]) : null
}

export function trackPub(t: QalbTrack): string | null {
  const m = t.tags?.match(/pub:([^|]+)/)
  return m ? m[1] : null
}

/** 273s → "4:33" */
export function fmtDur(sec: number): string {
  if (!sec || sec <= 0) return ''
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
