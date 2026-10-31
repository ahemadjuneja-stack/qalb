// Qalb — PERSONALIZED CURATED PLAYLISTS ("waha bhi user ke algorithm ke
// hisaab se dikhna chahiye")
// ─────────────────────────────────────────────────────────────────
// Pehle curated playlists SAB users ko same order + same tracks dikhti thin
// (static CURATED_PLAYLISTS / Firestore order). Ab har user ka apna algorithm:
//
//   1. PLAYLIST RE-RANK   — taste profile (recency-weighted artist/category
//                           scores) se har playlist ka affinity score →
//                           user ki pasand wali playlists sab se UPAR.
//   2. TRACKS RE-ORDER    — playlist ke andar tracks bhi taste-weighted
//                           order me (favourite artist pehle, unheard gems
//                           beech me mix) — Spotify "made for you" feel.
//   3. PERSONAL MIXES     — 2-3 playlists jo SIRF isi user ke liye bani
//                           hain: "{TopArtist} Mix", "{TopCategory} Aap ke
//                           liye", "Aap ki Top Picks" — LIVE YouTube sets +
//                           verified pool se, dedupe ke sath.
//   4. DETERMINISTIC      — seed = hash(uid) ^ daySeed ^ hash(playlistId)
//                           → same user ko same din same order (UI flicker
//                           nahi), kal roz naya arrangement, do users ko
//                           KABHI same nahi.
//
// Taste khali (plays < 3) → base order as-is (personalization ke liye
// pehle kuch sunna parta hai).

import type { QalbPlaylist, QalbTrack } from '@/lib/types'
import { TRENDING_POOL, poolToTrack } from '@/lib/trending-pool'
import { mulberry32, daySeed, seededShuffle } from '@/lib/daily-trending'
import { cleanArtist, getTasteProfile, type TasteProfile } from '@/lib/recommend'
import type { LiveFeedData } from '@/lib/live-catalog'

// ── helpers ─────────────────────────────────────────────────────

/** FNV-1a — string → 32-bit seed (uid / playlistId ke liye) */
export function hashStr(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function artistMatch(trackArtist: string | null | undefined, name: string): boolean {
  if (!name) return false
  const a = cleanArtist(trackArtist ?? '').toLowerCase()
  const b = cleanArtist(name).toLowerCase()
  if (!a || !b) return false
  return a.includes(b) || b.includes(a)
}

/** dedupe by videoId — order preserve */
function dedupe(tracks: QalbTrack[]): QalbTrack[] {
  const seen = new Set<string>()
  return tracks.filter((t) => {
    if (!t.videoId || seen.has(t.videoId)) return false
    seen.add(t.videoId)
    return true
  })
}

// ── affinity scoring (taste profile → track/playlist score) ─────

/** Track ka user-affinity: top artist match sab se bada signal */
export function trackAffinity(t: QalbTrack, taste: TasteProfile): number {
  let score = 0
  const artist = cleanArtist(t.artist ?? '')
  // top-3 artists ko rank-wise boost (#1 → 3.0, #2 → 1.8, #3 → 1.2)
  for (let i = 0; i < Math.min(3, taste.artistScores.length); i++) {
    const [name, w] = taste.artistScores[i]
    if (artistMatch(artist, name)) {
      const rankBoost = [3.0, 1.8, 1.2][i]
      score += rankBoost + Math.min(1, w) // heavy listeners ka thoda extra
      break
    }
  }
  // category affinity — #1 → 1.0, #2 → 0.6, #3 → 0.3
  const cat = String(t.category ?? '').toUpperCase()
  for (let i = 0; i < Math.min(3, taste.categoryScores.length); i++) {
    if (taste.categoryScores[i][0] === cat) {
      score += [1.0, 0.6, 0.3][i]
      break
    }
  }
  // user ne ye track khud suna hai — pasand ka sab se pakka signal
  if (taste.heard.has(t.videoId)) score += 0.5
  return score
}

/** Playlist ka affinity — top-heavy mean (top tracks ka zyada wazan) */
function playlistAffinity(p: QalbPlaylist, taste: TasteProfile): number {
  if (p.tracks.length === 0) return 0
  const scores = p.tracks
    .map((t) => trackAffinity(t, taste))
    .sort((a, b) => b - a)
  const head = scores.slice(0, 6) // pehle 6 (sab se relevant) ka wazan zyada
  const headMean = head.reduce((s, x) => s + x, 0) / head.length
  const tailMean =
    scores.slice(6).reduce((s, x) => s + x, 0) / Math.max(1, scores.length - 6)
  return headMean * 0.75 + tailMean * 0.25
}

// ── track re-ordering (taste-weighted seeded shuffle) ───────────

/**
 * Playlist ke andar ka order user ke liye: affinity-weighted greedy pick
 * (high score pehle aane ka chance zyada, lekin seeded randomness se har
 * din thoda naya). Deterministic — same user + same din = same order.
 */
function tasteOrder(tracks: QalbTrack[], taste: TasteProfile, seed: number): QalbTrack[] {
  if (tracks.length < 3) return tracks
  const rand = mulberry32(seed)
  const scored = tracks.map((t) => ({
    t,
    a: trackAffinity(t, taste),
    r: rand(), // jitter — perfect sort nahi, "curated with surprise"
  }))
  scored.sort((x, y) => y.a + y.r * 1.6 - (x.a + x.r * 1.6))
  // pehle 3 me se heard gem hamesha upar (instant familiar feel)
  const heardIdx = scored.findIndex((s) => taste.heard.has(s.t.videoId))
  if (heardIdx > 2) {
    const [gem] = scored.splice(heardIdx, 1)
    scored.unshift(gem)
  }
  return scored.map((s) => s.t)
}

// ── personal mixes (SIRF isi user ke liye) ──────────────────────

function personalAccent(i: number): string {
  return ['#D4A937', '#0EA47A', '#8B5CF6'][i % 3]
}

function buildPersonalMixes(
  uid: string | null | undefined,
  taste: TasteProfile,
  live: LiveFeedData | null | undefined
): QalbPlaylist[] {
  if (taste.plays < 3) return []

  const now = new Date()
  const dayS = daySeed(now)
  const userS = uid ? hashStr(uid) : 0
  const mixes: QalbPlaylist[] = []

  // master pools — LIVE sets pehle (100+ fresh), phir verified pool
  const liveCat = (cat: string): QalbTrack[] =>
    (live?.categorySets?.[cat as keyof NonNullable<LiveFeedData['categorySets']>]) ?? []
  const poolTracks: QalbTrack[] = TRENDING_POOL.map((e, i) => poolToTrack(e, i))

  // ── Mix 1: "{TopArtist} Mix" — user ke #1 artist ka asli mix ──
  if (taste.topArtist) {
    const topArtist: string = taste.topArtist // closure narrowing ke liye local
    const seed = (userS ^ dayS ^ hashStr('mix-artist')) >>> 0
    const liveArtist = live?.artistSet && artistMatch(live.artistSet.name, topArtist)
      ? live.artistSet.tracks
      : []
    const artistLive = seededShuffle(liveArtist, mulberry32(seed)).slice(0, 12)
    const artistPool = seededShuffle(
      poolTracks.filter((t) => artistMatch(t.artist, topArtist)),
      mulberry32(seed ^ 0xa71)
    )
    // side artists — #2/#3 se blend (mix kabhi ek-pahlu na lage)
    const side = taste.artistScores
      .slice(1, 3)
      .flatMap(([name]) => poolTracks.filter((t) => artistMatch(t.artist, name)))
    const blend = dedupe([...artistLive, ...artistPool, ...side])
    const finalTracks = tasteOrder(blend.slice(0, 18), taste, seed ^ 0x51)
    if (finalTracks.length >= 4) {
      mixes.push({
        id: `pmix-artist-${seed.toString(36)}`,
        slug: 'aap-ka-mix',
        name: `${taste.topArtist} Mix`,
        description: 'Aap ki pasand ke kalaamkar ka nija mix — roz thoda naya',
        coverEmoji: '🎧',
        accentColor: personalAccent(0),
        tracks: finalTracks,
        personal: true,
      })
    }
  }

  // ── Mix 2: "{TopCategory} Aap ke liye" — favourite genre, naya pehle ──
  {
    const topCat = (taste.topCategory as string) ?? 'NAAT'
    const seed = (userS ^ dayS ^ hashStr('mix-cat')) >>> 0
    const catLive = seededShuffle(liveCat(topCat), mulberry32(seed))
    const catPool = seededShuffle(
      poolTracks.filter((t) => String(t.category).toUpperCase() === topCat),
      mulberry32(seed ^ 0xc47)
    )
    const all = dedupe([...catLive, ...catPool])
    // discovery-first: jo ABHI tak nahi suna wo aage (naya suno feel)
    const unheard = all.filter((t) => !taste.heard.has(t.videoId))
    const heard = all.filter((t) => taste.heard.has(t.videoId))
    const ordered = tasteOrder(dedupe([...unheard.slice(0, 14), ...heard]), taste, seed ^ 0x77)
    if (ordered.length >= 4) {
      const catLabel: Record<string, string> = {
        NAAT: 'Naat',
        QAWWALI: 'Qawwali',
        NASHEED: 'Nasheed',
        HAMD: 'Hamd',
      }
      mixes.push({
        id: `pmix-cat-${seed.toString(36)}`,
        slug: 'aap-ke-liye-naya',
        name: `${catLabel[topCat] ?? topCat} — Aap ke liye`,
        description: 'Aap ka favourite genre — naye kalaam pehle, phir purane dost',
        coverEmoji: '✨',
        accentColor: personalAccent(1),
        tracks: ordered.slice(0, 20),
        personal: true,
      })
    }
  }

  // ── Mix 3: "Aap ki Top Picks" — top-2 categories ka personal blend ──
  {
    const seed = (userS ^ dayS ^ hashStr('mix-top')) >>> 0
    const cats = (taste.categoryScores.length >= 2
      ? taste.categoryScores.slice(0, 2).map(([c]) => c)
      : [taste.topCategory ?? 'NAAT', 'QAWWALI']
    ).filter(Boolean)
    const parts = cats.flatMap((c) => [
      ...liveCat(c).slice(0, 8),
      ...poolTracks.filter((t) => String(t.category).toUpperCase() === c),
    ])
    // heard gems ka bharpur hissa — "Top Picks" = pasand ka proof
    const gems = poolTracks.filter((t) => taste.heard.has(t.videoId))
    const blend = dedupe([...gems, ...parts])
    const ordered = tasteOrder(blend, taste, seed ^ 0x99).slice(0, 20)
    if (ordered.length >= 4) {
      mixes.push({
        id: `pmix-top-${seed.toString(36)}`,
        slug: 'aap-ki-top-picks',
        name: 'Aap ki Top Picks',
        description: 'Aap ki sunne ki adat se nikla hua personal selection',
        coverEmoji: '💎',
        accentColor: personalAccent(2),
        tracks: ordered,
        personal: true,
      })
    }
  }

  return mixes
}

// ── main entry ──────────────────────────────────────────────────

/**
 * Curated playlists → user ke algorithm ke hisaab se.
 * base: fetchPlaylistsSmart() ka raw result (Firestore ya curated fallback)
 */
export function personalizePlaylists(
  base: QalbPlaylist[],
  uid: string | null | undefined,
  live?: LiveFeedData | null
): QalbPlaylist[] {
  if (base.length === 0) return base
  const taste = getTasteProfile(uid)

  // taste khali → personalization ka data hi nahi — base as-is
  if (taste.plays < 3) return base

  const now = new Date()
  const dayS = daySeed(now)
  const userS = uid ? hashStr(uid) : 0

  // 1. personal mixes — SAB se upar (ye to bilkul isi user ke liye hain)
  const mixes = buildPersonalMixes(uid, taste, live)
  const mixIds = new Set(mixes.map((m) => m.id))

  // 2. base playlists → taste re-rank (ties → per-user seeded order)
  const ranked = base
    .map((p) => ({
      p,
      aff: playlistAffinity(p, taste),
      jitter: mulberry32((userS ^ dayS ^ hashStr(p.id)) >>> 0)(),
    }))
    .sort((x, y) => y.aff + y.jitter * 0.35 - (x.aff + x.jitter * 0.35))
    .map((x) => x.p)

  // 3. har playlist ke andar tracks bhi taste-order (per-user-per-day seed)
  const reshaped = ranked.map((p) => {
    const seed = (userS ^ dayS ^ hashStr(`tr-${p.id}`)) >>> 0
    return { ...p, tracks: tasteOrder(p.tracks, taste, seed) }
  })

  // covers diverse rakho — reshuffle ke baad bhi 2 playlists ka cover same
  // na ho (pehle personal mixes fix, phir base rotate)
  const usedCovers = new Set<string>()
  const dedupeCovers = (list: QalbPlaylist[]): QalbPlaylist[] =>
    list.map((p) => {
      let tracks = [...p.tracks]
      for (let i = 0; i < tracks.length && tracks[0] && usedCovers.has(tracks[0].videoId); i++) {
        tracks = [...tracks.slice(1), tracks[0]]
      }
      if (tracks[0]) usedCovers.add(tracks[0].videoId)
      return { ...p, tracks }
    })

  return [...dedupeCovers(mixes), ...dedupeCovers(reshaped)].filter(
    (p) => mixIds.has(p.id) || p.tracks.length > 0
  )
}
