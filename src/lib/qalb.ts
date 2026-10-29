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
// Timings Aladhan API se aate hain: method=1 + school=1 (Hanafi Asr)
export const PRAYER_CITIES = [
  { city: 'Delhi', country: 'India', flag: '🇮🇳' },
  { city: 'Mumbai', country: 'India', flag: '🇮🇳' },
  { city: 'Hyderabad', country: 'India', flag: '🇮🇳' },
  { city: 'Lucknow', country: 'India', flag: '🇮🇳' },
  { city: 'Kolkata', country: 'India', flag: '🇮🇳' },
  { city: 'Bhopal', country: 'India', flag: '🇮🇳' },
  { city: 'Ahmedabad', country: 'India', flag: '🇮🇳' },
  { city: 'Bengaluru', country: 'India', flag: '🇮🇳' },
  { city: 'Chennai', country: 'India', flag: '🇮🇳' },
  { city: 'Jaipur', country: 'India', flag: '🇮🇳' },
  { city: 'Srinagar', country: 'India', flag: '🇮🇳' },
  { city: 'Patna', country: 'India', flag: '🇮🇳' },
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
