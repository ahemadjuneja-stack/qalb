// Qalb — app-wide constants
import { APP_BUILD } from '@/lib/app-build'

export const QALB = {
  name: 'Qalb',
  tagline: 'Dil se dil tak — paak kalaam',
  // Store: WhatsApp ordering number (yahan apna business number daalein)
  whatsappNumber: '923001234567',
  // In-app updater: current running build (CI/CD isse compare karta hai)
  // GitHub Actions har build pe app-build.ts generate karta hai (versionCode = run_number)
  currentVersionCode: APP_BUILD.versionCode,
  currentVersionName: APP_BUILD.versionName,
  // GCS bucket jahan GitHub Actions signed APK upload karta hai
  apkBucketUrl: 'https://storage.googleapis.com/qalb-builds/releases',

  // ── Backend wiring (APK me Firebase direct + hosted API dono support) ──
  // Hosted web backend ka base URL (empty = same-origin, web preview me aisa hi)
  // APK build me GitHub repo VARIABLE API_BASE_URL set hota hai
  apiBase: (process.env.NEXT_PUBLIC_API_BASE ?? '').replace(/\/$/, ''),
  // Firestore project id — APK me REST API se version/products/playlists isi se aate hain
  firebaseProjectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'qalb-app',
} as const

export const PRAYER_CITIES = [
  { city: 'Karachi', country: 'Pakistan', flag: '🇵🇰' },
  { city: 'Lahore', country: 'Pakistan', flag: '🇵🇰' },
  { city: 'Islamabad', country: 'Pakistan', flag: '🇵🇰' },
  { city: 'Peshawar', country: 'Pakistan', flag: '🇵🇰' },
  { city: 'Delhi', country: 'India', flag: '🇮🇳' },
  { city: 'Mumbai', country: 'India', flag: '🇮🇳' },
  { city: 'Hyderabad', country: 'India', flag: '🇮🇳' },
  { city: 'Dhaka', country: 'Bangladesh', flag: '🇧🇩' },
  { city: 'Dubai', country: 'UAE', flag: '🇦🇪' },
  { city: 'Riyadh', country: 'Saudi Arabia', flag: '🇸🇦' },
  { city: 'Makkah', country: 'Saudi Arabia', flag: '🇸🇦' },
  { city: 'London', country: 'United Kingdom', flag: '🇬🇧' },
  { city: 'New York', country: 'United States', flag: '🇺🇸' },
  { city: 'Toronto', country: 'Canada', flag: '🇨🇦' },
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
  'Tajdar-e-Haram naat',
  'Nusrat Fateh Ali Khan qawwali',
  'Maher Zain nasheed',
  'Allah Hoo hamd',
  'Owais Raza Qadri naat',
  'sufi kalam',
]
