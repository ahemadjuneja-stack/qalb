// Qalb — app-wide constants

export const QALB = {
  name: 'Qalb',
  tagline: 'Dil se dil tak — paak kalaam',
  // Store: WhatsApp ordering number (yahan apna business number daalein)
  whatsappNumber: '923001234567',
  // In-app updater: current running build (CI/CD isse compare karta hai)
  currentVersionCode: 1,
  currentVersionName: '1.0.0',
  // GCS bucket jahan GitHub Actions signed APK upload karta hai
  apkBucketUrl: 'https://storage.googleapis.com/qalb-builds/releases',
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
