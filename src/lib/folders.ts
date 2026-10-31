// Qalb — Folder Catalog (Moods • Genres • Kalaamkar)
// ─────────────────────────────────────────────────────────────────
// User requirement: "Playlist mood genres me bhi 100 dikhni chahiye,
// har folder me alag alag dikhna chahiye — sab me same same nahi."
//
// Har folder ka APNA YouTube query + sort + time-period hota hai —
// isliye har folder ka content DOOSRE folder se bilkul alag hai.
// browse-view.tsx har folder ko live InnerTube search se bharta hai
// (100+ kalaam infinite scroll ke saath) aur localStorage me cache
// karta hai (TTL 6h) — dobara kholne par instant.
//
// sort/period → InnerTube `params` mapping (live-catalog.ts me compile):
//   views    = CAMSAhAB   (view-count sort, verified)
//   date     = EgIIAQ==   (upload-date sort — brand new uploads)
//   week     = EgQIAxAB   (this week)
//   month    = EgQIBBAB   (this month)
//   year     = EgQIBRAB   (this year)
//   relevance= EgIQAQ==   (video-only, best match)

export type FolderGroup = 'mood' | 'genre' | 'artist'
export type FolderSort = 'relevance' | 'views' | 'date'
export type FolderPeriod = 'week' | 'month' | 'year' | null

export interface QalbFolder {
  id: string
  group: FolderGroup
  label: string
  sub: string // chhota tagline (Roman Urdu)
  emoji: string
  gradient: string
  query: string // YouTube search query — HAR folder ka apna
  sort: FolderSort
  period: FolderPeriod
  /** viral mode: period-filtered results ko views ke hisaab se locally sort karo */
  viral?: boolean
}

export const FOLDER_GRADIENTS = {
  emerald: 'linear-gradient(140deg, #0e7a52, #064e3b 70%)',
  gold: 'linear-gradient(140deg, #9a7b1e, #4c3a08 70%)',
  purple: 'linear-gradient(140deg, #7c3aed, #3b1076 70%)',
  teal: 'linear-gradient(140deg, #0d9488, #134e4a 70%)',
  rose: 'linear-gradient(140deg, #be185d, #831843 70%)',
  blue: 'linear-gradient(140deg, #1d4ed8, #1e3a8a 70%)',
  amber: 'linear-gradient(140deg, #b45309, #78350f 70%)',
  slate: 'linear-gradient(140deg, #475569, #1e293b 70%)',
  cyan: 'linear-gradient(140deg, #0891b2, #164e63 70%)',
  red: 'linear-gradient(140deg, #b91c1c, #7f1d1d 70%)',
  lime: 'linear-gradient(140deg, #4d7c0f, #365314 70%)',
  fuchsia: 'linear-gradient(140deg, #a21caf, #701a75 70%)',
} as const

// ── GENRES (9) — har genre ka apna sab se bada collection ────────
const GENRES: QalbFolder[] = [
  {
    id: 'g-naat', group: 'genre', label: 'Naat Sharif', sub: 'Pyaare Nabi ﷺ ki shameed barkein',
    emoji: '🕌', gradient: FOLDER_GRADIENTS.emerald,
    query: 'best naat sharif', sort: 'views', period: null,
  },
  {
    id: 'g-qawwali', group: 'genre', label: 'Qawwali', sub: 'Mehfil-e-sama ki shahkar kalaamein',
    emoji: '🎶', gradient: FOLDER_GRADIENTS.purple,
    query: 'best qawwali mehfil', sort: 'views', period: null,
  },
  {
    id: 'g-hamd', group: 'genre', label: 'Hamd', sub: 'Allah Taala ki hamd-o-sana',
    emoji: '✨', gradient: FOLDER_GRADIENTS.gold,
    query: 'hamd e bari taala best', sort: 'views', period: null,
  },
  {
    id: 'g-nasheed', group: 'genre', label: 'Nasheed', sub: 'International Islamic nasheed',
    emoji: '🌙', gradient: FOLDER_GRADIENTS.teal,
    query: 'best islamic nasheed', sort: 'views', period: null,
  },
  {
    id: 'g-sufi', group: 'genre', label: 'Sufi Kalam', sub: 'Bulleh Shah se Nusrat tak',
    emoji: '📿', gradient: FOLDER_GRADIENTS.amber,
    query: 'sufi kalam best', sort: 'views', period: null,
  },
  {
    id: 'g-manqabat', group: 'genre', label: 'Manqabat', sub: 'Ahl-e-bait aur auliya ki manqabatein',
    emoji: '🕋', gradient: FOLDER_GRADIENTS.rose,
    query: 'manqabat best', sort: 'views', period: null,
  },
  {
    id: 'g-arabic', group: 'genre', label: 'Arabic Kalam', sub: 'Arabic nasheed aur madh',
    emoji: '🪔', gradient: FOLDER_GRADIENTS.cyan,
    query: 'arabic nasheed islamic', sort: 'views', period: null,
  },
  {
    id: 'g-punjabi', group: 'genre', label: 'Punjabi • Saraiki', sub: 'Desi zubaan ka paak kalaam',
    emoji: '🌾', gradient: FOLDER_GRADIENTS.lime,
    query: 'punjabi saraiki naat', sort: 'views', period: null,
  },
  {
    id: 'g-kids', group: 'genre', label: 'Bachon ke Naat', sub: 'Nanhe munne ka pyara kalaam',
    emoji: '🧒', gradient: FOLDER_GRADIENTS.blue,
    query: 'kids naat school program', sort: 'views', period: null,
  },
]

// ── MOODS (10) — "aaj kis mood me hain?" ─────────────────────────
const MOODS: QalbFolder[] = [
  {
    id: 'm-sukoon', group: 'mood', label: 'Sukoon', sub: 'Dil ko thandak dene wale kalaam',
    emoji: '🍃', gradient: FOLDER_GRADIENTS.emerald,
    query: 'peaceful heart touching naat', sort: 'relevance', period: null,
  },
  {
    id: 'm-dard', group: 'mood', label: 'Dard-e-Dil', sub: 'Rone wali sad naatein',
    emoji: '💧', gradient: FOLDER_GRADIENTS.slate,
    query: 'sad heart touching naat rona', sort: 'relevance', period: null,
  },
  {
    id: 'm-jashn', group: 'mood', label: 'Jashn-e-Eid', sub: 'Eid aur milad ke jashn',
    emoji: '🎉', gradient: FOLDER_GRADIENTS.gold,
    query: 'eid milad un nabi naat', sort: 'views', period: null,
  },
  {
    id: 'm-ramzan', group: 'mood', label: 'Ramzan Kareem', sub: 'Ramzan ke roop aur ibadat',
    emoji: '🌙', gradient: FOLDER_GRADIENTS.teal,
    query: 'ramzan naat ramadan', sort: 'views', period: null,
  },
  {
    id: 'm-tajdar', group: 'mood', label: 'Tajdar-e-Haram', sub: 'Ajmer sharif ki mehfilein',
    emoji: '🕌', gradient: FOLDER_GRADIENTS.red,
    query: 'tajdar e haram khwaja gharib nawaz', sort: 'views', period: null,
  },
  {
    id: 'm-madina', group: 'mood', label: 'Madine ki Baatein', sub: 'Madina munawwara kalaam',
    emoji: '🕋', gradient: FOLDER_GRADIENTS.emerald,
    query: 'madina munawwara naat', sort: 'views', period: null,
  },
  {
    id: 'm-mehfil', group: 'mood', label: 'Mehfil-e-Sama', sub: 'Live qawwali mehfil recordings',
    emoji: '🎤', gradient: FOLDER_GRADIENTS.purple,
    query: 'live qawwali mehfil full', sort: 'views', period: null,
  },
  {
    id: 'm-tawbah', group: 'mood', label: 'Tawbah • Ibadat', sub: 'Rab tak lautne wale kalaam',
    emoji: '🤲', gradient: FOLDER_GRADIENTS.cyan,
    query: 'tawbah dua ibadat naat', sort: 'relevance', period: null,
  },
  {
    id: 'm-naya', group: 'mood', label: 'Naye Kalaam', sub: 'Is hafte ke brand new naat',
    emoji: '🌱', gradient: FOLDER_GRADIENTS.lime,
    query: 'new naat sharif', sort: 'date', period: null,
  },
  {
    id: 'm-viral', group: 'mood', label: 'Viral Kalaam', sub: 'Is mahine ke sab se suniye gaye',
    emoji: '🔥', gradient: FOLDER_GRADIENTS.amber,
    query: 'naat qawwali new', sort: 'relevance', period: 'month', viral: true,
  },
]

// ── KALAAMKAR (8) — legend artists ke poore collections ──────────
const ARTISTS: QalbFolder[] = [
  {
    id: 'a-nusrat', group: 'artist', label: 'Nusrat Fateh Ali Khan', sub: 'Shahenshah-e-Qawwali',
    emoji: '👑', gradient: FOLDER_GRADIENTS.red,
    query: 'Nusrat Fateh Ali Khan qawwali', sort: 'views', period: null,
  },
  {
    id: 'a-owais', group: 'artist', label: 'Owais Raza Qadri', sub: 'Naat khwan-e-azam',
    emoji: '🌟', gradient: FOLDER_GRADIENTS.emerald,
    query: 'Owais Raza Qadri naat best', sort: 'views', period: null,
  },
  {
    id: 'a-amjad', group: 'artist', label: 'Amjad Sabri', sub: 'Sabri gharana ka shaheen',
    emoji: '🦅', gradient: FOLDER_GRADIENTS.rose,
    query: 'Amjad Sabri qawwali', sort: 'views', period: null,
  },
  {
    id: 'a-abida', group: 'artist', label: 'Abida Parveen', sub: 'Sufi kalam ki mallika',
    emoji: '💜', gradient: FOLDER_GRADIENTS.purple,
    query: 'Abida Parveen sufi kalam', sort: 'views', period: null,
  },
  {
    id: 'a-rahat', group: 'artist', label: 'Rahat Fateh Ali Khan', sub: 'Nusrat ka waris',
    emoji: '🎼', gradient: FOLDER_GRADIENTS.gold,
    query: 'Rahat Fateh Ali Khan qawwali naat', sort: 'views', period: null,
  },
  {
    id: 'a-maher', group: 'artist', label: 'Maher Zain', sub: 'World nasheed star',
    emoji: '🌍', gradient: FOLDER_GRADIENTS.teal,
    query: 'Maher Zain nasheed', sort: 'views', period: null,
  },
  {
    id: 'a-sami', group: 'artist', label: 'Sami Yusuf', sub: 'Spiritual pop ka pioneer',
    emoji: '🎻', gradient: FOLDER_GRADIENTS.blue,
    query: 'Sami Yusuf nasheed', sort: 'views', period: null,
  },
  {
    id: 'a-aziz', group: 'artist', label: 'Aziz Mian', sub: 'Qawwali ke mizaajdaar baadshah',
    emoji: '🎭', gradient: FOLDER_GRADIENTS.fuchsia,
    query: 'Aziz Mian qawwali', sort: 'views', period: null,
  },
]

export const QALB_FOLDERS: QalbFolder[] = [...GENRES, ...MOODS, ...ARTISTS]

export function getFolder(id: string): QalbFolder | null {
  return QALB_FOLDERS.find((f) => f.id === id) ?? null
}

export function foldersByGroup(group: FolderGroup): QalbFolder[] {
  return QALB_FOLDERS.filter((f) => f.group === group)
}

/** Category (NAAT/QAWWALI/…) ke tracks ke liye matching folder query —
 *  playlist detail me live expansion isi se hoti hai */
export function queryForCategory(category: string): string {
  const map: Record<string, string> = {
    NAAT: 'best naat sharif',
    HAMD: 'hamd e bari taala best',
    QAWWALI: 'best qawwali mehfil',
    NASHEED: 'best islamic nasheed',
  }
  return map[String(category).toUpperCase()] ?? 'best naat qawwali'
}
