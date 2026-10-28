# Qalb — CI/CD Setup Guide (Firebase + GitHub Actions + Cloud Storage)

**Ek line me:** `git push origin main` → GitHub Actions signed APK banata hai → Google Cloud
Storage pe upload hota hai → Firestore me naya version publish hota hai → aapke installed
app ko "naya update available" dikhta hai → user tap kare, APK install.

```
┌─────────────┐     ┌──────────────────┐     ┌───────────────┐     ┌────────────┐
│  git push    │ ──▶ │ GitHub Actions   │ ──▶ │ Cloud Storage │ ──▶ │ Firestore  │
│  (main)      │     │ signed APK build │     │ (APK file)    │     │ appVersions│
└─────────────┘     └──────────────────┘     └───────────────┘     └─────┬──────┘
                                                                          │
                                              ┌───────────────────────────▼──────┐
                                              │ Installed Qalb app (APK)         │
                                              │ Profile ▸ Check → update prompt  │
                                              │ → APK download → install         │
                                              └──────────────────────────────────┘
```

---

## Part A — Firebase Project (5 minute)

1. [console.firebase.google.com](https://console.firebase.google.com) → **Add project** → naam: `qalb-app`
2. Left menu → **Build → Firestore Database** → **Create database** → **Production mode** → region: `asia-south1` (ya jo chale)
3. **Rules** tab me yeh paste karein (sirf public READ, likhna sirf service account se):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /appVersions/{doc}    { allow read: if true; allow write: if false; }
    match /playlists/{doc}      { allow read: if true; allow write: if false; }
    match /tracks/{doc}         { allow read: if true; allow write: if false; }
    match /products/{doc}       { allow read: if true; allow write: if false; }
    match /users/{uid}          { allow read, write: if request.auth != null; }
  }
}
```

4. **Publish** dabayein.

> APK ke andar ka app isi Firestore se version + playlists + products uthata hai —
> koi alag server chalana zaroori NAHI hai.

---

## Part B — Service Account (GitHub ke liye chaabi)

1. Firebase Console ⚙️ **Project settings → Service accounts** → **Generate new private key** → JSON file download hogi.
   *(ya GCP Console → IAM & Admin → Service Accounts → Create Key)*
2. Is service account ko **2 roles** chahiye — GCP Console → IAM:
   - `Datastore User` (Firestore me version publish karne ke liye)
   - `Storage Object Admin` (sirf aapke bucket pe — GCS → bucket → Permissions)
3. Is JSON ko aage **GitHub Secret** me daalenge (Part D). Kahin commit NAHI karna!

---

## Part C — Google Cloud Storage bucket (APK hosting)

Local terminal ya [Cloud Shell](https://shell.cloud.google.com) me:

```bash
# 1. Bucket banao (naam globally unique hona chahiye)
gcloud storage buckets create gs://qalb-builds --location=asia-south1 --uniform-bucket-level-access

# 2. Public read do (taake app/users APK download kar sakein)
gcloud storage buckets add-iam-policy-binding gs://qalb-builds \
  --member=allUsers --role=roles/storage.objectViewer
```

- APK URL is shakal me hoga: `https://storage.googleapis.com/qalb-builds/releases/v1.0.1/qalb-v1.0.1.apk`
- Bucket ka naam alag rakhna ho to `.github/workflows/build-apk.yml` me `GCS_BUCKET:` badal dein,
  aur `src/lib/qalb.ts` ka `apkBucketUrl` bhi update kar dein.

---

## Part D — GitHub Secrets & Variables (repo Settings me)

Repo → **Settings → Secrets and variables → Actions**

### Secrets (New repository secret):

| Secret naam | Value kya daalna hai |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Neeche Part E se — base64 of keystore |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Keystore alias (e.g. `qalb`) |
| `ANDROID_KEY_PASSWORD` | Key password |
| `GCP_SERVICE_ACCOUNT_JSON` | Part B wali JSON ka poora content (paste) |

### Variables (Variables tab — optional):

| Variable | Value |
|---|---|
| `API_BASE_URL` | Aapka hosted backend (e.g. `https://qalb.vercel.app`) — khali chhod sakte hain |
| `FIREBASE_PROJECT_ID` | `qalb-app` |

---

## Part E — Signing Keystore (ek dafa, sambhal ke rakhein!)

```bash
keytool -genkeypair -v \
  -keystore qalb-upload.keystore \
  -alias qalb \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storetype PKCS12
```

- Password yaad rakhein — **yahi har update me same hona chahiye**, warna Android app update
  install hi nahi karega (signature mismatch).
- Keystore file ka backup rakhein (Drive/USB) — kho gayi to Play Store pe naya app banana padega.

```bash
# GitHub secret ke liye base64:
base64 -w0 qalb-upload.keystore        # Linux
base64 -i qalb-upload.keystore         # macOS
```

---

## Part F — Pehla build (one-time local init)

Android project folder commit karna best hai. Apne machine pe ek dafa:

```bash
npm install
npm i -D @capacitor/cli && npm i @capacitor/android @capacitor/filesystem
MOBILE_BUILD=1 npx next build          # static export → out/
npx cap add android                    # android/ folder ban jayega
git add android && git commit -m "Capacitor android project" && git push origin main
```

> Push hote hi pehli baar pipeline chalegi! (Repo me android/ na ho to workflow khud
> `cap add android` chala leti hai — dono tareeqe chalte hain.)

---

## 🚀 Daily workflow — update kaise release karein

```bash
# 1. package.json me version badlein (sirf zaroorat ho to)
npm version patch        # 1.0.0 → 1.0.1  (minor/major bhi chalta hai)

# 2. changes commit + push
git add . && git commit -m "Naye kalam add kiye + store fix" && git push origin main
```

Bas! Pipeline khud:
- `versionCode = github.run_number` (har push pe automatic +1)
- `versionName = package.json` ka version
- APK banata hai, sign karta hai, GCS + Firestore + GitHub Release teeno pe daal deta hai

## 📲 App me update kaise aata hai

1. User ka installed app **Profile tab → App Version → Check** dabata hai
   (ya app launch pe auto-check bhi laga sakte hain — `useAppUpdate(true)`)
2. App Firestore se `appVersions/latest` doc uthata hai — **direct REST se, koi server nahi**
3. `versionCode (Firestore) > versionCode (installed)` → **Update card** dikhta hai
4. "Update Download Karein (APK)" tap → APK download → Android install prompt
   *(pehli baar "Install unknown apps" permission maangega — normal hai)*

## 🔍 Verify karne ke liye

- **Actions tab** — workflow ka green tick + APK artifact
- **GCS** — `gs://qalb-builds/releases/` me naya APK
- **Firestore** — `appVersions/latest` doc me naya versionCode/apkUrl
- **App** — Profile → Check → "Naya version: x.y.z" card

## 🧯 Troubleshooting

| Masla | Hal |
|---|---|
| `EADDRINUSE` / gradle fail: signing | Part E ke 3 secrets dobara check karein — base64 me newline na ho |
| Firestore publish fail (403) | Service account ko `Datastore User` role diya hai? (Part B) |
| GCS upload fail (403) | `Storage Object Admin` role bucket pe diya hai? (Part B) |
| App me update nahi dikh raha | Firestore doc ka versionCode installed se bara hai? App ko restart karke Check dabayein |
| Install blocked | Settings → Install unknown apps → browser/manager ko allow |
| Version same reh gaya | Push ke baad run_number hi versionCode hai — naya push = naya code |
| Search APK me kaam nahi kar raha | `API_BASE_URL` variable set karein (hosted backend) — warna verified library chalegi |
