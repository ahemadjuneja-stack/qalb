'use client'

// Qalb — Recommendation Engine ("har roz kuch naya")
// ─────────────────────────────────────────────────────────────────
// JioSaavn/Spotify style PER-USER algorithm — LOCAL-FIRST:
//   • Guest ho ya logged-in — sab kuch device par chalta hai (zero network)
//   • Login karne par har user ka apna taste profile banta hai
//     (play events user-specific localStorage key me migrate ho jate hain)
//
// Pipeline:
//   1. PLAY EVENTS   — har kalaam jo play hota hai (player-store ka
//                      pushRecent hook) → localStorage (max 600 events,
//                      30s dedupe — double-tap spam count nahi hota)
//   2. TASTE PROFILE — recency-weighted artist/category scores
//                      (e^(-days/21) decay — aaj ki pasand kal se zyada
//                      matter karti hai)
//   3. FEED BUILDER  — JioSaavn-jaisa ordered home feed:
//                      Trending → Aap ki Pasand (top artist) → Stations
//                      → Daily Mix → Moods → Naye Kalaam → Playlists
//                      Sab deterministic DAILY seeds (mulberry32) +
//                      taste override — "har roz naya dikhna" guarantee.

import { create } from 'zustand'
import type { QalbPlaylist, QalbTrack } from '@/lib/types'
import { QALB_ARTISTS } from '@/lib/artists'
import { TRENDING_POOL, poolToTrack } from '@/lib/trending-pool'
import { buildDailyTrending, mulberry32, daySeed, seededShuffle } from '@/lib/daily-trending'
import type { LiveFeedData } from '@/lib/live-catalog'
import { QALB_FOLDERS, foldersByGroup } from '@/lib/folders'

// ── Play events (raw history) ──────────────────────────────────

export interface PlayEvent {
  v: string // videoId
  a: string // artist (cleaned)
  c: string // category
  t: number // epoch ms
}

const EVENTS_BASE = 'qalb_play_events_v1'
const MAX_EVENTS = 600
const DEDUPE_MS = 30_000

function eventsKey(uid?: string | null): string {
  return uid ? `${EVENTS_BASE}__${uid}` : EVENTS_BASE
}

function readEvents(uid?: string | null): PlayEvent[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(eventsKey(uid))
    const list = raw ? (JSON.parse(raw) as PlayEvent[]) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function writeEvents(list: PlayEvent[], uid?: string | null) {
  try {
    window.localStorage.setItem(eventsKey(uid), JSON.stringify(list.slice(-MAX_EVENTS)))
  } catch {
    /* quota — ignore */
  }
}

/** Artist name normalize — "X - Topic", "X Official", "XVEVO" sab same */
export function cleanArtist(raw: string): string {
  return raw
    .replace(/\s*-\s*Topic\s*$/i, '')
    .replace(/\s*-\s*Topic\s*/i, ' ')
    .replace(/\s*(official|vevo|channel|music)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Taste version bump — UI ko pata chale feed dobara compute karna hai */
export const useTasteStore = create<{ v: number; bump: () => void }>((set) => ({
  v: 0,
  bump: () => set((s) => ({ v: s.v + 1 })),
}))

function bumpTaste() {
  useTasteStore.getState().bump()
}

/** Player-store se hook hota hai (har track start par) */
export function recordPlay(track: QalbTrack, uid?: string | null) {
  if (typeof window === 'undefined') return
  const now = Date.now()
  const list = readEvents(uid)
  const last = list[list.length - 1]
  if (last && last.v === track.videoId && now - last.t < DEDUPE_MS) return
  list.push({
    v: track.videoId,
    a: cleanArtist(track.artist ?? ''),
    c: String(track.category ?? ''),
    t: now,
  })
  writeEvents(list, uid)
  bumpTaste()
}

export function countEvents(uid?: string | null): number {
  return readEvents(uid).length
}

export function clearPlayEvents(uid?: string | null) {
  writeEvents([], uid)
  bumpTaste()
}

/** Login par: guest (device) history user account me copy — taste aage chalta hai */
export function migrateEventsToUser(uid: string) {
  if (typeof window === 'undefined') return
  const guest = readEvents(null)
  const mine = readEvents(uid)
  const key = (e: PlayEvent) => `${e.v}@${Math.floor(e.t / 60_000)}`
  const seen = new Set(mine.map(key))
  const merged = [...mine, ...guest.filter((e) => !seen.has(key(e)))]
    .sort((a, b) => a.t - b.t)
  writeEvents(merged, uid)
  bumpTaste()
}

// ── Taste profile (recency-weighted scores) ────────────────────

export interface TasteProfile {
  artistScores: [string, number][]
  categoryScores: [string, number][]
  topArtist: string | null
  topCategory: string | null
  heard: Set<string>
  plays: number
}

const HALF_LIFE_DAYS = 21

export function getTasteProfile(uid?: string | null): TasteProfile {
  const events = readEvents(uid)
  const now = Date.now()
  const artist = new Map<string, number>()
  const cat = new Map<string, number>()
  const heard = new Set<string>()
  for (const e of events) {
    const days = Math.max(0, (now - e.t) / 86_400_000)
    const w = Math.exp(-days / HALF_LIFE_DAYS)
    if (e.a) artist.set(e.a, (artist.get(e.a) ?? 0) + w)
    if (e.c) cat.set(e.c, (cat.get(e.c) ?? 0) + w)
    heard.add(e.v)
  }
  const desc = (m: Map<string, number>) =>
    [...m.entries()].sort((x, y) => y[1] - x[1])
  const artistScores = desc(artist)
  const categoryScores = desc(cat)
  return {
    artistScores,
    categoryScores,
    topArtist: artistScores[0]?.[0] ?? null,
    topCategory: categoryScores[0]?.[0] ?? null,
    heard,
    plays: events.length,
  }
}

// ── Cards ───────────────────────────────────────────────────────

export interface StationCard {
  name: string
  role: string
  query: string
  image: string | null
  accent: string
  listenersLabel: string
  personal?: boolean // user ki top pasand — "Aap ki Pasand" badge
  folderId: string | null // artist folder — tap par 100+ wala folder khulta hai
}

export interface MoodCard {
  key: string
  label: string
  query: string
  emoji: string
  gradient: string
  count: number
  folderId: string | null // mood folder — tap par folder detail khulta hai
  sub?: string
}

export interface MixCard {
  id: string
  title: string
  subtitle: string
  emoji: string
  gradient: string
  tracks: QalbTrack[]
  thumbs: (string | null)[] // 2x2 mosaic preview
}

// Mood/genre meta — category cards (JioSaavn "Top Genres & Moods")
const CATEGORY_META: Record<string, { label: string; query: string; emoji: string; gradient: string }> = {
  NAAT: {
    label: 'Naat',
    query: 'naat sharif',
    emoji: '🕌',
    gradient: 'linear-gradient(140deg, #0e7a52, #064e3b 70%)',
  },
  HAMD: {
    label: 'Hamd',
    query: 'hamd e bari taala',
    emoji: '✨',
    gradient: 'linear-gradient(140deg, #9a7b1e, #4c3a08 70%)',
  },
  QAWWALI: {
    label: 'Qawwali',
    query: 'sufi qawwali',
    emoji: '🎶',
    gradient: 'linear-gradient(140deg, #7c3aed, #3b1076 70%)',
  },
  NASHEED: {
    label: 'Nasheed',
    query: 'islamic nasheed',
    emoji: '🌙',
    gradient: 'linear-gradient(140deg, #0d9488, #134e4a 70%)',
  },
}

const ROTATION_ORDER = ['NAAT', 'QAWWALI', 'HAMD', 'NASHEED']

export function formatCount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

function artistMatch(trackArtist: string, name: string): boolean {
  const a = cleanArtist(trackArtist).toLowerCase()
  const b = name.toLowerCase()
  if (!a || !b) return false
  return a.includes(b) || b.includes(a)
}

// ── Feed builder ────────────────────────────────────────────────

export interface FeedData {
  trending: QalbTrack[]
  /** trending LIVE YouTube se aaya (is hafte ke top views) — home me LIVE badge */
  trendingLive: boolean
  personalArtist: { name: string; tracks: QalbTrack[] } | null
  stations: StationCard[]
  mixes: MixCard[]
  moods: MoodCard[]
  fresh: QalbTrack[]
  suggestChips: string[] // "Aur Suniye" interstitial queries
  taste: TasteProfile
  tasteEmpty: boolean
  liveReady: boolean
}

export function buildFeed(
  remoteTracks: QalbTrack[],
  uid: string | null | undefined,
  live?: LiveFeedData | null
): FeedData {
  const now = new Date()

  // master pool — VERIFIED trending pool + remote playlist tracks (dedupe)
  const pool: QalbTrack[] = []
  const seen = new Set<string>()
  for (const e of TRENDING_POOL) {
    if (seen.has(e.videoId)) continue
    seen.add(e.videoId)
    pool.push(poolToTrack(e, pool.length))
  }
  for (const t of remoteTracks) {
    if (!t.videoId || seen.has(t.videoId)) continue
    seen.add(t.videoId)
    pool.push({ ...t, id: t.id || `remote-${t.videoId}` })
  }

  const taste = getTasteProfile(uid)
  const tasteEmpty = taste.plays < 3
  const liveReady = Boolean(live?.ready)

  // ── 1. Trending — LIVE YouTube (is hafte ke top views) ya daily rotation ──
  const liveTrending = live?.trending?.length ? live.trending : null
  const trending = liveTrending ?? buildDailyTrending(remoteTracks, 10).tracks
  const trendingLive = Boolean(liveTrending && live?.trendingLive)

  // ── 2. Personal artist section ("Sonu Nigam" jaisa) — LIVE artist set pehle ──
  let personalArtist: { name: string; tracks: QalbTrack[] } | null = null
  if (!tasteEmpty && taste.topArtist) {
    const liveSet = live?.artistSet?.tracks?.length ? live.artistSet : null
    if (liveSet && artistMatch(liveSet.name, taste.topArtist as string)) {
      personalArtist = { name: taste.topArtist, tracks: liveSet.tracks.slice(0, 20) }
    } else {
      const hits = pool.filter((t) => artistMatch(t.artist, taste.topArtist as string))
      const heardHits = hits.filter((t) => taste.heard.has(t.videoId))
      const picked = (heardHits.length >= 3 ? heardHits : hits).slice(0, 12)
      if (picked.length >= 3) {
        personalArtist = { name: taste.topArtist, tracks: picked }
      }
    }
  }

  // ── 3. Artist stations (listeners = pool views aggregate, affinity boost) ──
  const artistFolder = (name: string): string | null =>
    QALB_FOLDERS.find(
      (f) => f.group === 'artist' && f.label.toLowerCase() === name.toLowerCase()
    )?.id ?? null

  const stations: StationCard[] = QALB_ARTISTS.map((a) => {
    const own = pool.filter((t) => artistMatch(t.artist, a.name))
    const views = own.reduce((s, t) => s + (t.playCount ?? 0), 0)
    const affinity =
      taste.artistScores.find(([n]) => artistMatch(n, a.name))?.[1] ?? 0
    return {
      name: a.name,
      role: a.role,
      query: a.query,
      image: a.image,
      accent: a.accent,
      listenersLabel: `${formatCount(Math.max(views, 1_000_000))} listeners`,
      personal: affinity > 0,
      folderId: artistFolder(a.name),
    }
  }).sort((x, y) => {
    if (x.personal !== y.personal) return x.personal ? -1 : 1
    return 0 // same tier → curated order (QALB_ARTISTS) barqarar
  })

  // ── 4. Made For You — Daily Mix cards (2x2 mosaic) ──
  const mixes: MixCard[] = []
  const mixFrom = (tracks: QalbTrack[]): (string | null)[] =>
    tracks.slice(0, 4).map((t) => t.thumbnailUrl)

  // Mix A — user's top artist + top category blend (LIVE sets pehle)
  {
    const topCat = (taste.topCategory as string) ?? 'NAAT'
    const fav = taste.topArtist
      ? pool.filter((t) => artistMatch(t.artist, taste.topArtist as string))
      : []
    const catHits = pool.filter(
      (t) => String(t.category) === topCat && !fav.some((f) => f.videoId === t.videoId)
    )
    // LIVE YouTube sets — top artist + top category ke fresh 100+ wale sets
    const liveFav =
      live?.artistSet && taste.topArtist && artistMatch(live.artistSet.name, taste.topArtist as string)
        ? live.artistSet.tracks
        : []
    const liveCat = live?.categorySets?.[topCat as keyof typeof live.categorySets] ?? []
    const blendRaw = [...liveFav, ...liveCat, ...fav, ...catHits]
    const seenBlend = new Set<string>()
    const blendUnique = blendRaw.filter((t) => {
      if (seenBlend.has(t.videoId)) return false
      seenBlend.add(t.videoId)
      return true
    })
    const blend = seededShuffle(blendUnique, mulberry32(daySeed(now) ^ 0xfeed))
    if (blend.length >= 4) {
      mixes.push({
        id: 'daily-mix',
        title: taste.topArtist ? `${taste.topArtist} Mix` : 'Aap ka Daily Mix',
        subtitle: taste.topArtist
          ? 'Aap ki pasand + naya kalaam'
          : 'Roz ka naya mix — aap ke liye',
        emoji: '🎧',
        gradient: CATEGORY_META[topCat]?.gradient ?? CATEGORY_META.NAAT.gradient,
        tracks: blend.slice(0, 20),
        thumbs: mixFrom(blend),
      })
    }
  }

  // Mix B — Naya Suno (LIVE fresh uploads pehle — exploration side)
  {
    const liveFresh = (live?.fresh ?? []).filter((t) => !taste.heard.has(t.videoId))
    const unheard = pool.filter((t) => !taste.heard.has(t.videoId))
    const seenB = new Set<string>()
    const mixed = [...liveFresh, ...unheard].filter((t) => {
      if (seenB.has(t.videoId)) return false
      seenB.add(t.videoId)
      return true
    })
    const shuffled = seededShuffle(mixed, mulberry32(daySeed(now) ^ 0xf105))
    if (shuffled.length >= 4) {
      mixes.push({
        id: 'fresh-mix',
        title: 'Naya Suno',
        subtitle: 'YouTube ke bilkul naye uploads',
        emoji: '🌱',
        gradient: 'linear-gradient(140deg, #b45309, #78350f 70%)',
        tracks: shuffled.slice(0, 20),
        thumbs: mixFrom(shuffled),
      })
    }
  }

  // Mix C — Roz ka genre focus (har roz alag genre highlight — LIVE set)
  {
    const dayIdx = Math.floor(Date.now() / 86_400_000)
    const catKey = ROTATION_ORDER[dayIdx % ROTATION_ORDER.length]
    const meta = CATEGORY_META[catKey]
    const liveCat = live?.categorySets?.[catKey as keyof typeof live.categorySets] ?? []
    const poolCat = pool.filter((t) => String(t.category) === catKey)
    const seenC = new Set<string>()
    const catTracksAll = [...liveCat, ...poolCat].filter((t) => {
      if (seenC.has(t.videoId)) return false
      seenC.add(t.videoId)
      return true
    })
    const catTracks = seededShuffle(catTracksAll, mulberry32(daySeed(now) ^ 0xca7))
    if (catTracks.length >= 4) {
      mixes.push({
        id: `roz-${catKey.toLowerCase()}`,
        title: `Aaj ka ${meta.label}`,
        subtitle: `Aaj ${meta.emoji} ${meta.label} ka din hai`,
        emoji: meta.emoji,
        gradient: meta.gradient,
        tracks: catTracks.slice(0, 20),
        thumbs: mixFrom(catTracks),
      })
    }
  }

  // ── 5. Moods & Genres — AB folders (tap par 100+ kalaam wala folder) ──
  const moodFolders = foldersByGroup('mood')
  const moods: MoodCard[] = moodFolders.map((f) => ({
    key: f.id,
    label: f.label,
    query: f.query,
    emoji: f.emoji,
    gradient: f.gradient,
    count: 0, // live folders — home "LIVE" dikhata hai
    folderId: f.id,
    sub: f.sub,
  }))

  // ── 6. Aaj ke Naye Kalaam — LIVE fresh uploads (YouTube date-sort) ──
  const trendingIds = new Set(trending.map((t) => t.videoId))
  const liveFresh = (live?.fresh ?? []).filter((t) => !trendingIds.has(t.videoId))
  let fresh: QalbTrack[]
  if (liveFresh.length >= 5) {
    fresh = liveFresh.slice(0, 15)
  } else {
    const freshPool = pool.filter((t) => !trendingIds.has(t.videoId))
    fresh = seededShuffle(freshPool, mulberry32(daySeed(now) ^ 0x9e77)).slice(0, 12)
  }

  // ── 7. "Aur Suniye" chips — daily rotation, taste-aware ──
  const chipPool = QALB_ARTISTS.map((a) => a.query)
  const chips = seededShuffle(chipPool, mulberry32(daySeed(now) ^ 0xc4f3))
  const suggestChips = chips.slice(0, 6)

  return {
    trending,
    trendingLive,
    personalArtist,
    stations,
    mixes,
    moods,
    fresh,
    suggestChips,
    taste,
    tasteEmpty,
    liveReady,
  }
}

/** Curated playlists ke tracks bhi feed pool me aane chahiye */
export function collectRemoteTracks(playlists: QalbPlaylist[]): QalbTrack[] {
  const out: QalbTrack[] = []
  for (const p of playlists) out.push(...p.tracks)
  return out
}
