'use client'

// iTube — YouTube-style ISLAMIC video hub (v0.5.0)
// ─────────────────────────────────────────────────────────────────
// Reels ki jagah: InnerTube enriched search (views/duration/published ke
// saath) + STRICT Islamic filter + taste-based personalization.
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
  type PageX,
} from '@/lib/innertube-x'
import {
  filterSearchResults,
  hasIslamicMarker,
  isBlockedResult,
} from '@/lib/result-filter'
import { QALB } from '@/lib/qalb'
import { isNativeApp } from '@/plugins/qalb-native'

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
    if (isBlockedResult(text)) return false
    // curated queries (naat/qawwali...) se aaye results ka category
    // khud islamic hota hai — marker na bhi mile to category kaafi hai
    if (['NAAT', 'HAMD', 'QAWWALI', 'NASHEED'].includes(t.category)) return true
    return hasIslamicMarker(text)
  })
}

// ── Main fetch — chip/search dono isi se ────────────────────────

export interface ITubePage {
  tracks: QalbTrack[]
  continuation: string | null
}

/** iTube page — strict islamic filter ke saath InnerTube search */
export async function itubeFetch(
  query: string,
  continuation: string | null
): Promise<ITubePage> {
  const page = await itubeSearchX(query, '', continuation)

  // continuation pages par filter ke baad khali aa sake — 1 retry
  if (page && !page.videos.length && continuation) {
    const retry = await itubeSearchX(query, '', continuation)
    if (retry && retry.videos.length) {
      return { tracks: islamicOnly(videosToTracks(retry.videos, 'itube')), continuation: retry.continuation }
    }
    return { tracks: [], continuation: null }
  }

  if (!page || !page.videos.length) {
    // network fail — verified islamic pool fallback (app kabhi khali nahi)
    return { tracks: islamicOnly(fallbackTracksFor(query, 12)), continuation: null }
  }

  let tracks = islamicOnly(videosToTracks(page.videos, 'itube'))
  // strict filter ke baad bhi kuch bacha hi nahi — fallback de do
  if (!tracks.length && !continuation) {
    tracks = islamicOnly(fallbackTracksFor(query, 12))
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
