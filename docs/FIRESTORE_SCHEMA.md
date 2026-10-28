# Qalb — Firestore Schema & CI/CD Reference

## Collections Overview

| Collection | Document ID | Purpose |
|------------|------------|---------|
| `appVersions` | `latest` | CI/CD pipeline har release ke baad latest APK ka URL + versionCode publish karti hai (in-app auto updater isi ko poll karta hai) |
| `tracks` | auto | Verified Naat/Hamd/Qawwali/Nasheed library (YouTube video IDs) |
| `playlists` | auto | Curated playlists (naat-sharif, sufi-qawwali, hamd-o-sana, trending-kalam) |
| `products` | auto | Islamic Store catalog |
| `orders` | auto | WhatsApp orders ka record |
| `users` | uid | User profile (name, prayer city, saved tracks) |

## Field Models

TypeScript source of truth: `src/lib/firestore-schema.ts`

### appVersions/latest
```json
{
  "versionCode": 2,
  "versionName": "1.0.1",
  "apkUrl": "https://github.com/ahemadjuneja-stack/qalb/releases/download/v1.0.1-27/qalb-v1.0.1.apk",
  "releaseNotes": "• Bug fixes\n• Naye kalam",
  "mandatory": false,
  "publishedAt": "<serverTimestamp>"
}
```

### tracks/{trackId}
```json
{
  "videoId": "-35IQq0vd34",
  "title": "Tajdar-e-Haram | Naat",
  "artist": "Atif Aslam",
  "category": "NAAT",
  "tags": ["atif aslam", "coke studio", "qawwali"],
  "thumbnailUrl": "https://i.ytimg.com/vi/-35IQq0vd34/hqdefault.jpg",
  "durationSeconds": 0,
  "playCount": 0,
  "trending": true,
  "verified": true,
  "createdAt": "<timestamp>"
}
```

### playlists/{playlistId}
```json
{
  "slug": "sufi-qawwali",
  "name": "Sufi Qawwali",
  "description": "Ruhani sufi qawwaliyan",
  "coverEmoji": "🎵",
  "accentColor": "#0EA47A",
  "featured": true,
  "sortOrder": 4,
  "createdAt": "<timestamp>",
  "tracks": [ { "trackId": "<trackId>", "position": 0 } ]
}
```

### products/{productId}
```json
{
  "name": "Khalis Amber Tasbeeh (99 Beads)",
  "description": "Asli amber resin ke 99 beads, silk tassel ke saath.",
  "price": 5800,
  "originalPrice": 7500,
  "category": "TASBEEH",
  "emoji": "📿",
  "rating": 4.9,
  "reviews": 342,
  "inStock": true,
  "featured": true,
  "createdAt": "<timestamp>"
}
```

## Security Rules (recommended)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /appVersions/{doc} { allow read: if true; allow write: if false; }
    match /products/{id}     { allow read: if true; allow write: if false; }
    match /orders/{id}       { allow create: if true; allow read: if false; }
    match /playlists/{id}    { allow read: if true; allow write: if false; }
    match /tracks/{id}       { allow read: if true; allow write: if false; }
    match /users/{uid}       { allow read, write: if request.auth.uid == uid; }
  }
}
```

## CI/CD Pipeline (`.github/workflows/android-release.yml`)

Flow: `push to main` → Next.js static export → `cap sync android` → version bump
→ **signed APK** (keystore Firestore `ci_private/keystore` doc se, base64)
→ **GitHub Release** (`releases/download/<tag>/qalb-vX.Y.Z.apk`)
→ **Firestore update** (`appVersions/latest.apkUrl` + versionCode)
→ In-app updater automatically users ko naya version offer karta hai.

### Required GitHub Secrets
| Secret | Purpose |
|--------|---------|
| `GCP_SERVICE_ACCOUNT_JSON` | Firestore publish + keystore doc (yahi ek secret kaafi hai) |

## Android / Capacitor Setup

```bash
npm i -D @capacitor/cli
npm i @capacitor/core @capacitor/android @capacitor/filesystem @capacitor/http
npx cap add android
npx cap sync android
npx cap open android   # Android Studio me kholen
```

`capacitor.config.json` project root me already configured hai
(appId: `com.qalb.app`, webDir: `out`).

## Optional Env Vars (AI + YouTube live search)

| Var | Effect |
|-----|--------|
| `GEMINI_API_KEY` / `GOOGLE_AI_API_KEY` | Search validation Gemini Flash se hoti hai (Google AI Studio) |
| `YOUTUBE_API_KEY` | Live YouTube Data API search (warna verified local library) |
