// Qalb — Firestore Schema Models (TypeScript)
// Production me yeh collections Firebase/Firestore me hongi —
// local dev me Prisma (SQLite) un ka exact mirror hai (docs/FIRESTORE_SCHEMA.md).

// Firestore timestamp ko Date se represent kiya gaya hai (admin SDK import zaroori nahi)
export type FSTimestamp = Date

// ── appVersions/{latest} ─────────────────────────────────────────
export interface FirestoreAppVersion {
  versionCode: number // monotonically increasing build number
  versionName: string // "1.0.1"
  apkUrl: string // GitHub Release: https://github.com/<owner>/<repo>/releases/download/<tag>/qalb-vX.Y.Z.apk
  releaseNotes: string | null
  mandatory: boolean
  publishedAt: FSTimestamp
}

// ── products/{productId} ─────────────────────────────────────────
export interface FirestoreProduct {
  name: string
  description: string
  price: number // INR (₹)
  originalPrice: number | null
  category: 'ATTAR' | 'TASBEEH' | 'PRAYER_MAT' | 'BOOKS' | 'CAPS' | 'GIFTS'
  emoji: string
  gradient: string
  rating: number
  reviews: number
  inStock: boolean
  featured: boolean
  createdAt: FSTimestamp
}

// ── orders/{orderId} (WhatsApp se aane wale orders ka record) ────
export interface FirestoreOrder {
  productId: string
  productName: string
  price: number
  customerName: string | null
  whatsappNumber: string | null
  status: 'whatsapp_sent' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'
  createdAt: FSTimestamp
}

// ── playlists/{playlistId} + tracks sub-collection ───────────────
export interface FirestorePlaylist {
  slug: string
  name: string
  description: string | null
  coverEmoji: string
  accentColor: string
  featured: boolean
  sortOrder: number
  createdAt: FSTimestamp
}

export interface FirestorePlaylistTrackRef {
  trackId: string // tracks/{trackId}
  position: number
}

// ── tracks/{trackId} ─────────────────────────────────────────────
export interface FirestoreTrack {
  videoId: string // YouTube video ID
  title: string
  artist: string
  category: 'NAAT' | 'HAMD' | 'QAWWALI' | 'NASHEED'
  tags: string[]
  thumbnailUrl: string | null
  durationSeconds: number
  playCount: number
  trending: boolean
  verified: boolean
  createdAt: FSTimestamp
}

// ── users/{uid} (optional auth profile) ──────────────────────────
export interface FirestoreUser {
  displayName: string
  prayerCity: string
  prayerCountry: string
  savedTrackIds: string[]
  createdAt: FSTimestamp
}

// Firestore security rules (recommended):
//
// rules_version = '2';
// service cloud.firestore {
//   match /databases/{database}/documents {
//     match /appVersions/{doc}     { allow read: if true;  allow write: if false; } // sirf Admin SDK
//     match /products/{id}         { allow read: if true;  allow write: if false; }
//     match /orders/{id}           { allow create: if true; allow read: if false; }
//     match /playlists/{id}        { allow read: if true;  allow write: if false; }
//     match /tracks/{id}           { allow read: if true;  allow write: if false; }
//     match /users/{uid}           { allow read, write: if request.auth.uid == uid; }
//   }
// }
