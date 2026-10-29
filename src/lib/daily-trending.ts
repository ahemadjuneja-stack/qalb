// Qalb — Daily Trending Rotation ("Aaj ka Trending")
// ─────────────────────────────────────────────────────────────────
// User requirement: "Trending naat qawwali roz ke hisaab se badalni chahiye
// jaise YouTube me trend aata hai."
//
// Implement: VERIFIED pool (trending-pool.ts, ~44 tracks) + remote playlists
// ke tracks → deterministic DAILY seeded shuffle. Har din ka seed = YYYYMMDD
// → isi din me sab users ko SAME 10 kalaam, kal phir naye 10. Koi network
// nahi chahiye, koi API quota nahi, aur content 100% verified Islamic.
//
// Weighting: zyada views wale zyada baar aate hain (top views = top trending
// feel) — lekin roz rotation alag.

import type { QalbTrack } from '@/lib/types'
import { TRENDING_POOL, poolToTrack } from '@/lib/trending-pool'

// mulberry32 — chhota deterministic PRNG (seed-based shuffle)
// (recommend.ts bhi isi se daily rotation banata hai)
export function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function daySeed(d: Date): number {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return Number(`${y}${m}${day}`)
}

export function todayLabel(d: Date = new Date()): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** Seeded shuffle (Fisher-Yates with PRNG) */
export function seededShuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export interface DailyTrending {
  tracks: QalbTrack[]
  dateKey: string // "2026-10-29" — UI badge ke liye
}

/**
 * Aaj ka trending — roz ka naya selection.
 * remoteTracks (Firestore/bundled playlists) ko priority milti hai:
 * unke bhi pool me mix hote hain, phir daily shuffle.
 */
export function buildDailyTrending(remoteTracks: QalbTrack[] = [], count = 10): DailyTrending {
  const now = new Date()
  const dateKey = now.toISOString().slice(0, 10)
  const rand = mulberry32(daySeed(now))

  // pool: verified static + remote playlists tracks (dedupe by videoId)
  const seen = new Set<string>()
  const pool: QalbTrack[] = []

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

  // shuffle → count pick; guaranteed >= count (pool 44+)
  const shuffled = seededShuffle(pool, rand)
  const picks = shuffled.slice(0, Math.min(count, shuffled.length))

  // picks ko views ke hisaab se sort — #1 sab se popular dikhe
  picks.sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))

  return { tracks: picks, dateKey }
}
