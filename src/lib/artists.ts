// Qalb — Curated Islamic Artists (music player style artist row ke liye)
// ─────────────────────────────────────────────────────────────────
// Har artist ke saath ek VERIFIED image (YouTube thumbnail — usi kalaam
// ka jo app me play hota hai) + search query. Tap par artist ki saari
// naatein/qawwaliyan search ho jaati hain.
//
// Images i.ytimg.com se aati hain — stable CDN, koi quota nahi.

export interface QalbArtist {
  name: string
  role: string // Naat Khwan / Qawwal / Nasheed Artist
  query: string // search query (Islamic-only validation paas karegi)
  image: string | null // circular photo (ytimg) — null par gradient initials
  accent: string // gradient fallback color
}

export const QALB_ARTISTS: QalbArtist[] = [
  {
    name: 'Nusrat Fateh Ali Khan',
    role: 'Shahenshah-e-Qawwali',
    query: 'Nusrat Fateh Ali Khan qawwali',
    image: 'https://i.ytimg.com/vi/eYSaHXXFIBU/hqdefault.jpg',
    accent: '#10B981',
  },
  {
    name: 'Owais Raza Qadri',
    role: 'Naat Khwan',
    query: 'Owais Raza Qadri naat',
    image: 'https://i.ytimg.com/vi/mfm9Mse1ZPQ/hqdefault.jpg',
    accent: '#0EA47A',
  },
  {
    name: 'Rahat Fateh Ali Khan',
    role: 'Qawwal',
    query: 'Rahat Fateh Ali Khan qawwali',
    image: 'https://i.ytimg.com/vi/kw4tT7SCmaY/hqdefault.jpg',
    accent: '#D4A937',
  },
  {
    name: 'Maher Zain',
    role: 'Nasheed Artist',
    query: 'Maher Zain nasheed',
    image: 'https://i.ytimg.com/vi/f4J7-WR1QOY/hqdefault.jpg',
    accent: '#34D399',
  },
  {
    name: 'Sami Yusuf',
    role: 'Nasheed Artist',
    query: 'Sami Yusuf nasheed',
    image: 'https://i.ytimg.com/vi/z2_2cFityc4/hqdefault.jpg',
    accent: '#2DD4BF',
  },
  {
    name: 'Amjad Sabri',
    role: 'Qawwal',
    query: 'Amjad Sabri qawwali',
    image: 'https://i.ytimg.com/vi/JD1k4_d0S1Y/hqdefault.jpg',
    accent: '#F59E0B',
  },
  {
    name: 'Junaid Jamshed',
    role: 'Naat Khwan',
    query: 'Junaid Jamshed naat',
    image: 'https://i.ytimg.com/vi/l3hHUwc1cAk/hqdefault.jpg',
    accent: '#059669',
  },
  {
    name: 'Atif Aslam',
    role: 'Sufi Kalaam',
    query: 'Atif Aslam naat qawwali',
    image: 'https://i.ytimg.com/vi/74cVT_tUpck/hqdefault.jpg',
    accent: '#14B8A6',
  },
  {
    name: 'Abida Parveen',
    role: 'Sufi Singer',
    query: 'Abida Parveen sufi kalam',
    image: 'https://i.ytimg.com/vi/7SDrjwtfKMk/hqdefault.jpg',
    accent: '#8B5CF6',
  },
  {
    name: 'Wadali Brothers',
    role: 'Sufi Qawwal',
    query: 'Wadali Brothers sufi qawwali',
    image: 'https://i.ytimg.com/vi/tL5sYdlk20I/hqdefault.jpg',
    accent: '#F97316',
  },
  {
    name: 'Ghulam Mustafa Qadri',
    role: 'Naat Khwan',
    query: 'Ghulam Mustafa Qadri naat',
    image: 'https://i.ytimg.com/vi/vgmgAdAu2ew/hqdefault.jpg',
    accent: '#22C55E',
  },
  {
    name: 'Sabri Brothers',
    role: 'Qawwal',
    query: 'Sabri Brothers qawwali',
    image: 'https://i.ytimg.com/vi/SDfELfpumEE/hqdefault.jpg',
    accent: '#EAB308',
  },
]

/** Artist initials (fallback avatar ke liye) */
export function artistInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}
