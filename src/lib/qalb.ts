// Qalb — app-wide constants
import { APP_BUILD } from '@/lib/app-build'

// Firestore project id — APK me REST API se version/products/playlists isi se aate hain
// (GitHub Actions build me ye service-account JSON se AUTO set hota hai —
//  yahan ka default sirf local dev ke liye hai; apna naya project id chaho to badal dein)
const FB_PROJECT = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'qalb-app'

export const QALB = {
  name: 'Qalb',
  tagline: 'Dil se dil tak — paak kalaam',
  // Store: WhatsApp ordering number (yahan apna business number daalein)
  // Indian app — +91 number (placeholder, apna asli number daal dein)
  whatsappNumber: '919876543210',
  // In-app updater: current running build (CI/CD isse compare karta hai)
  // GitHub Actions har build pe app-build.ts generate karta hai (versionCode = run_number)
  currentVersionCode: APP_BUILD.versionCode,
  currentVersionName: APP_BUILD.versionName,
  // APK hosting: GitHub Releases (workflow apkUrl Firestore me publish karta hai)
  githubRepo: 'ahemadjuneja-stack/qalb',

  // ── Backend wiring (APK me Firebase direct + hosted API dono support) ──
  // Hosted web backend ka base URL (empty = same-origin, web preview me aisa hi)
  // APK build me GitHub repo VARIABLE API_BASE_URL set hota hai
  apiBase: (process.env.NEXT_PUBLIC_API_BASE ?? '').replace(/\/$/, ''),
  firebaseProjectId: FB_PROJECT,
} as const

// Prayer cities — INDIA ONLY (Qalb Indian Sunni Hanafi app hai)
// DEFAULT: JUNAGADH (Gujarat) — user base wahi hai.
// Timings Aladhan API se aate hain: method=1 + school=1 (Hanafi Asr)
// Coordinates precise timings dete hain — city-name geocoding se behtar.
export interface PrayerCity {
  city: string
  country: string
  flag: string
  lat: number
  lng: number
}

export const PRAYER_CITIES = [
  { city: 'Junagadh', country: 'India', flag: '🕌', lat: 21.5222, lng: 70.4579 },
  { city: 'Ahmedabad', country: 'India', flag: '🇮🇳', lat: 23.0225, lng: 72.5714 },
  { city: 'Surat', country: 'India', flag: '🇮🇳', lat: 21.1702, lng: 72.8311 },
  { city: 'Rajkot', country: 'India', flag: '🇮🇳', lat: 22.3039, lng: 70.8022 },
  { city: 'Vadodara', country: 'India', flag: '🇮🇳', lat: 22.3072, lng: 73.1812 },
  { city: 'Bhavnagar', country: 'India', flag: '🇮🇳', lat: 21.7645, lng: 72.1519 },
  { city: 'Delhi', country: 'India', flag: '🇮🇳', lat: 28.6139, lng: 77.209 },
  { city: 'Mumbai', country: 'India', flag: '🇮🇳', lat: 19.076, lng: 72.8777 },
  { city: 'Hyderabad', country: 'India', flag: '🇮🇳', lat: 17.385, lng: 78.4867 },
  { city: 'Lucknow', country: 'India', flag: '🇮🇳', lat: 26.8467, lng: 80.9462 },
  { city: 'Kolkata', country: 'India', flag: '🇮🇳', lat: 22.5726, lng: 88.3639 },
  { city: 'Bhopal', country: 'India', flag: '🇮🇳', lat: 23.2599, lng: 77.4126 },
  { city: 'Bengaluru', country: 'India', flag: '🇮🇳', lat: 12.9716, lng: 77.5946 },
  { city: 'Chennai', country: 'India', flag: '🇮🇳', lat: 13.0827, lng: 80.2707 },
  { city: 'Jaipur', country: 'India', flag: '🇮🇳', lat: 26.9124, lng: 75.7873 },
  { city: 'Srinagar', country: 'India', flag: '🇮🇳', lat: 34.0837, lng: 74.7973 },
  { city: 'Patna', country: 'India', flag: '🇮🇳', lat: 25.5941, lng: 85.1376 },
] as const

export const STORE_CATEGORIES = [
  { key: 'ALL', label: 'Sab Kuch', emoji: '✨' },
  { key: 'ATTAR', label: 'Attar', emoji: '🧴' },
  { key: 'TASBEEH', label: 'Tasbeeh', emoji: '📿' },
  { key: 'PRAYER_MAT', label: 'Jaanamaz', emoji: '🧎' },
  { key: 'BOOKS', label: 'Kitabein', emoji: '📚' },
  { key: 'CAPS', label: 'Topiyan', emoji: '🧢' },
  { key: 'GIFTS', label: 'Tohfe', emoji: '🎁' },
] as const

export const SEARCH_SUGGESTIONS = [
  'Tajdar-e-Haram',
  'Owais Raza Qadri naat',
  'Nusrat Fateh Ali Khan qawwali',
  'Maher Zain nasheed',
  'Abida Parveen sufi kalam',
  'Amjad Sabri kalam',
  'Allah Hoo hamd',
  'Ramzan special naat',
  'sufi kalam',
  'Madina naat',
]
