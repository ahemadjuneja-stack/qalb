// Qalb — Curated Playlists (VERIFIED pool se auto-built, HAMESHA bhari hui)
// ─────────────────────────────────────────────────────────────────
// User requirement: "Playlist abhi bhi khali khali hai — poora page bharna
// chahiye." Firestore me agar data nahi bhi ho to ye curated playlists
// dikhengi — sab tracks trending-pool.ts ke VERIFIED Islamic videoIds se
// (bhajan/bollywood kabhi ghus nahi sakte, build-time par hi filter ho
// chuka hai).
//
// Har playlist me 4-12 kalaam + asli thumbnails — page hamesha full.

import type { QalbPlaylist } from '@/lib/types'
import { TRENDING_POOL, poolToTrack } from '@/lib/trending-pool'

function pl(
  id: string,
  slug: string,
  name: string,
  description: string,
  coverEmoji: string,
  accentColor: string,
  trackIds: string[]
): QalbPlaylist {
  const tracks = trackIds
    .map((vid) => TRENDING_POOL.find((e) => e.videoId === vid))
    .filter((e) => Boolean(e))
    .map((e, i) => poolToTrack(e!, i))
  return { id, slug, name, description, coverEmoji, accentColor, tracks }
}

// views ke hisaab se top videoIds (mixed)
const ALL_SORTED = [...TRENDING_POOL]
  .sort((a, b) => b.views - a.views)
  .map((e) => e.videoId)

const NAAT = TRENDING_POOL.filter((e) => e.category === 'NAAT').map((e) => e.videoId)
const QAWWALI = TRENDING_POOL.filter((e) => e.category === 'QAWWALI').map((e) => e.videoId)
const NASHEED = TRENDING_POOL.filter((e) => e.category === 'NASHEED').map((e) => e.videoId)
const HAMD = TRENDING_POOL.filter((e) => e.category === 'HAMD').map((e) => e.videoId)

const byArtist = (name: string) =>
  TRENDING_POOL.filter((e) => e.artist.toLowerCase().includes(name.toLowerCase())).map((e) => e.videoId)

const BASE_PLAYLISTS: QalbPlaylist[] = [
  pl('cur-top', 'top-trending-kalam', 'Top Trending Kalam',
    'Sab se suniye jaane wale naat, qawwali aur nasheed', '🌟', '#10B981',
    ALL_SORTED.slice(0, 12)),

  pl('cur-naat', 'naat-sharif', 'Naat Sharif',
    'Pyare Nabi ﷺ ki shameed barkein — behtareen naatein', '🕌', '#34D399',
    NAAT),

  pl('cur-qawwali', 'sufi-qawwali', 'Sufi Qawwali',
    'Ruhani mehfilon ki shahkar qawwaliyan', '🎵', '#0EA47A',
    QAWWALI),

  pl('cur-nasheed', 'nasheed-gold', 'Nasheed Gold',
    'Dil ko chhoo lene wale international nasheed', '🌙', '#2DD4BF',
    NASHEED),

  pl('cur-nusrat', 'nusrat-mehfil', 'Ustad Nusrat Mehfil',
    'Shahenshah-e-Qawwali ke naaab kalaam', '👑', '#D4A937',
    byArtist('Nusrat')),

  pl('cur-owais', 'owais-raza-qadri', 'Owais Raza Qadri',
    'Alhaj Owais Raza Qadri ki mashhoor naatein', '🎤', '#059669',
    byArtist('Owais')),

  pl('cur-maher-sami', 'maher-zain-sami-yusuf', 'Maher Zain & Sami Yusuf',
    'Modern nasheed ke do sab se bare sitare', '💎', '#14B8A6',
    [...byArtist('Maher'), ...byArtist('Sami')]),

  pl('cur-hamd', 'hamd-o-sana', 'Hamd-o-Sana',
    "Allah Ta'ala ki hamd mein paak kalaam", '🤲', '#D4A937',
    [...HAMD, ...QAWWALI.slice(0, 3)]),
]

// Cover diversity — do playlists ka pehla track same na ho (rotate karke
// unique cover milta hai, tracks ka order meaningful rehta hai)
function dedupeCovers(playlists: QalbPlaylist[]): QalbPlaylist[] {
  const used = new Set<string>()
  return playlists.map((p) => {
    let tracks = [...p.tracks]
    for (let i = 0; i < tracks.length && used.has(tracks[0].videoId); i++) {
      tracks = [...tracks.slice(1), tracks[0]]
    }
    if (tracks[0]) used.add(tracks[0].videoId)
    return { ...p, tracks }
  })
}

export const CURATED_PLAYLISTS: QalbPlaylist[] = dedupeCovers(BASE_PLAYLISTS)
