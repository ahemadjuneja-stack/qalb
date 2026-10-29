// Qalb — Bundled Starter Library
// ─────────────────────────────────────────────────────────────────
// APK first-install par Firestore abhi khali ho sakta hai — isliye ye
// verified starter kalam APK ke andar hi bundle hote hain:
//   • Trending / Playlists section kabhi khali nahi dikhega
//   • Search ka last-resort fallback (Firestore + YouTube fail ho to bhi)
//
// Jab Firestore me asli data seed ho jayega to Firestore data priority
// lega aur ye sirf backup ke kaam aayega. (Ye curated videoIds seed.ts
// ke verified library jaise hain — sab paak kalaam.)

import type { QalbPlaylist, QalbTrack } from '@/lib/types'

export const BUNDLED_TRACKS: QalbTrack[] = [
  {
    id: 'bundled-1',
    videoId: 'KfXIF2Mm2Kc',
    title: 'Insha Allah | Official Music Video',
    artist: 'Maher Zain',
    category: 'NASHEED',
    thumbnailUrl: 'https://i.ytimg.com/vi/KfXIF2Mm2Kc/hqdefault.jpg',
    tags: 'maher zain,insha allah,nasheed,awakening,ramadan',
    playCount: 110700000,
  },
  {
    id: 'bundled-2',
    videoId: 'qpYVyEoXEGs',
    title: 'Hasbi Rabbi | Official Music Video',
    artist: 'Sami Yusuf',
    category: 'NASHEED',
    thumbnailUrl: 'https://i.ytimg.com/vi/qpYVyEoXEGs/hqdefault.jpg',
    tags: 'sami yusuf,hasbi rabbi,nasheed,islamic,awakening',
    playCount: 20900000,
  },
  {
    id: 'bundled-3',
    videoId: '-35IQq0vd34',
    title: 'Tajdar-e-Haram | Naat',
    artist: 'Atif Aslam',
    category: 'NAAT',
    thumbnailUrl: 'https://i.ytimg.com/vi/-35IQq0vd34/hqdefault.jpg',
    tags: 'atif aslam,tajdar e haram,naat,coke studio,qawwali,kalam',
    playCount: 250000000,
  },
  {
    id: 'bundled-4',
    videoId: 'SDfELfpumEE',
    title: 'Mustt Mustt (Live)',
    artist: 'Nusrat Fateh Ali Khan',
    category: 'QAWWALI',
    thumbnailUrl: 'https://i.ytimg.com/vi/SDfELfpumEE/hqdefault.jpg',
    tags: 'nusrat fateh ali khan,mustt mustt,qawwali,sufi,live',
    playCount: 15000000,
  },
  {
    id: 'bundled-5',
    videoId: 'wjynrRhztU8',
    title: 'Allah Hoo | Sufi Qawwali',
    artist: 'Nusrat Fateh Ali Khan',
    category: 'HAMD',
    thumbnailUrl: 'https://i.ytimg.com/vi/wjynrRhztU8/hqdefault.jpg',
    tags: 'nusrat fateh ali khan,allah hoo,hamd,qawwali,sufi',
    playCount: 30000000,
  },
  {
    id: 'bundled-6',
    videoId: 'tn13eMHrszk',
    title: 'Lam Yati Nazeeroka Fi Nazrin | Full Naat',
    artist: 'Owais Raza Qadri',
    category: 'NAAT',
    thumbnailUrl: 'https://i.ytimg.com/vi/tn13eMHrszk/hqdefault.jpg',
    tags: 'owais raza qadri,lam yati nazeeroka,naat sharif,urdu naat',
    playCount: 8000000,
  },
]

function playlist(
  id: string,
  slug: string,
  name: string,
  description: string,
  coverEmoji: string,
  accentColor: string,
  trackIds: string[]
): QalbPlaylist {
  return {
    id,
    slug,
    name,
    description,
    coverEmoji,
    accentColor,
    tracks: trackIds
      .map((tid) => BUNDLED_TRACKS.find((t) => t.id === tid))
      .filter((t): t is QalbTrack => Boolean(t)),
  }
}

export const BUNDLED_PLAYLISTS: QalbPlaylist[] = [
  playlist('bundled-pl-1', 'trending-kalam', 'Trending Kalam',
    'Sab se suniye jaane wale naat, hamd aur qawwali', '🌟', '#10B981',
    ['bundled-1', 'bundled-2', 'bundled-3', 'bundled-4', 'bundled-5', 'bundled-6']),
  playlist('bundled-pl-2', 'hamd-o-sana', 'Hamd-o-Sana',
    "Allah Ta'ala ki hamd mein kalaam", '🤲', '#D4A937',
    ['bundled-5', 'bundled-1', 'bundled-2']),
  playlist('bundled-pl-3', 'naat-sharif', 'Naat Sharif',
    'Pyare Nabi ﷺ ke naat shareef', '🕌', '#34D399',
    ['bundled-3', 'bundled-6', 'bundled-2']),
  playlist('bundled-pl-4', 'sufi-qawwali', 'Sufi Qawwali',
    'Ruhani sufi qawwaliyan', '🎵', '#0EA47A',
    ['bundled-4', 'bundled-5', 'bundled-3']),
]

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2)
}

/** Bundled library me keyword search (APK offline fallback) */
export function searchBundledLibrary(q: string): QalbTrack[] {
  const toks = tokenize(q)
  if (toks.length === 0) return []
  return BUNDLED_TRACKS.map((t) => {
    const hay = `${t.title} ${t.artist} ${t.tags ?? ''}`.toLowerCase()
    const score = toks.reduce((acc, tok) => acc + (hay.includes(tok) ? 1 : 0), 0)
    return { t, score }
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || (b.t.playCount ?? 0) - (a.t.playCount ?? 0))
    .map(({ t }) => t)
    .slice(0, 12)
}
