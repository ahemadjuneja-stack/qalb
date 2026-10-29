// Qalb — shared TypeScript types

export type TrackCategory = 'NAAT' | 'HAMD' | 'QAWWALI' | 'NASHEED'

export interface QalbTrack {
  id: string
  videoId: string
  title: string
  artist: string
  category: TrackCategory | string
  thumbnailUrl: string | null
  tags?: string
  playCount?: number
}

export interface QalbPlaylist {
  id: string
  slug: string
  name: string
  description: string | null
  coverEmoji: string
  accentColor: string
  tracks: QalbTrack[]
}

export interface QalbProduct {
  id: string
  name: string
  description: string
  price: number
  originalPrice: number | null
  category: string
  emoji: string
  gradient: string
  rating: number
  reviews: number
  inStock: boolean
  featured: boolean
}

export interface SearchValidationResult {
  valid: boolean
  category: TrackCategory | 'OTHER' | null
  refinedQuery: string | null
  reason: string
  provider: 'gemini' | 'zai' | 'rules' | 'cache'
  // strict=true → ambiguous query (jaise koi naam) — result filter par
  // sirf Islamic-marker wale results pass hote hain (result-filter.ts)
  strict?: boolean
}

export interface AladhanTimings {
  Fajr: string
  Sunrise: string
  Dhuhr: string
  Asr: string
  Maghrib: string
  Isha: string
}

export interface HijriDate {
  day: string
  monthNumber: number
  monthEn: string
  monthAr: string
  year: string
  weekdayEn: string
  designation: string
}

export interface PrayerData {
  timings: AladhanTimings
  hijri: HijriDate
  gregorian: string
  timezone: string
  city: string
}

export interface AppVersionInfo {
  versionCode: number
  versionName: string
  apkUrl: string
  releaseNotes: string | null
  mandatory: boolean
  publishedAt: string
}

export interface SavedDownload {
  trackId: string
  videoId: string
  title: string
  artist: string
  thumbnailUrl: string | null
  savedAt: string
  sizeMB: number
  offline: boolean
}
