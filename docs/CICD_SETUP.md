# Qalb — CI/CD Setup Guide (Firebase + GitHub Releases)

**Ek line me:** `git push origin main` → GitHub Actions signed APK banata hai → **GitHub
Release** me attach hoti hai → Firestore me naya version + download link publish hota hai
→ aapke installed app ko "naya update available" dikhta hai → user tap kare, APK install.

```
┌─────────────┐     ┌──────────────────┐     ┌────────────────┐     ┌────────────┐
│  git push    │ ──▶ │ GitHub Actions   │ ──▶ │ GitHub Release │ ──▶ │ Firestore  │
│  (main)      │     │ signed APK build │     │ (APK hosting)  │     │ appVersions│
└─────────────┘     └──────────────────┘     └────────────────┘     └─────┬──────┘
                                                                          │
                                              ┌───────────────────────────▼──────┐
                                              │ Installed Qalb app (APK)         │
                                              │ Profile ▸ Check → update prompt  │
                                              │ → APK download → install         │
                                              └──────────────────────────────────┘
```

> 🪄 **Auto-magic version:** Pipeline khud signing keystore generate + save karti hai,
> Firebase project id khud detect karti hai, APK khud GitHub Release pe daal deti hai.
> **GCS bucket / Cloud Storage kahin use nahi hota** (billing ke jhanjhat se mukti) —
> sab **GitHub Releases** pe, bilkul free. Aapko sirf **2 cheezein** manually karni hain —
> **Firestore Database** (Part A) aur **1 GitHub Secret** (Part B). Baaki sab automatic!

---

## Part A — Naya Firebase Project (~5 minute)

1. [console.firebase.google.com](https://console.firebase.google.com) → **Add project**
   → naam: `qalb-app` (ya jo chaho) → **Create**
   *(ye bilkul alag naya project hoga — purane "Shivam" / "My First Project" projects
   ko choona nahi hai, kuch mix nahi hoga)*
2. Is naye project me: Left menu → **Build → Firestore Database** → **Create database** →
   **Production mode** → region: `asia-south1` (ya jo chale) → **Enable**
3. **Rules** tab me repo ki `firestore.rules` file ka content paste karein
   (sirf public READ, `ci_private` poora blocked, likhna sirf service account se):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /appVersions/{doc}    { allow read: if true;  allow write: if false; }
    match /playlists/{doc}      { allow read: if true;  allow write: if false; }
    match /tracks/{doc}         { allow read: if true;  allow write: if false; }
    match /products/{doc}       { allow read: if true;  allow write: if false; }
    match /ci_private/{doc}     { allow read: if false; allow write: if false; }
    match /users/{uid}          { allow read, write: if request.auth != null; }
    match /{document=**}        { allow read, write: if false; }
  }
}
```

4. **Publish** dabayein.

> APK ke andar ka app isi Firestore se version + playlists + products uthata hai —
> koi alag server chalana zaroori NAHI hai.

> 📌 **Firestore me sirf text/records** — playlists, tracks ki list, products, orders,
> version info. Ek doc 1 MiB se chhota. **Audio/images/video Firestore me kabhi nahi** —
> unhe file storage me rakho aur Firestore me sirf unka URL. Reads kam karne ke liye
> queries me `limit()` lagao, poora collection bar bar mat padho.

---

## Part B — Service Account JSON → GitHub Secret (~5 minute)

### B1. JSON key download karein

**Aasan tareeqa (Firebase console se, phone pe best):**

1. [console.firebase.google.com](https://console.firebase.google.com) → **naya Qalb project**
   select karein
2. Upar ⚙️ **Project settings → Service accounts** → **Generate new private key** →
   **Generate key** → JSON file download ho jayegi

**Ya GCP console se:**

1. [console.cloud.google.com](https://console.cloud.google.com) → upar project selector se
   **naya Qalb project** select karein
2. Left menu ☰ → **IAM & Admin → Service Accounts**
3. `firebase-adminsdk-fbsvc@<naya-project-id>.iam.gserviceaccount.com` pe click karein
4. Upar **KEYS** tab → **ADD KEY → Create new key** → **JSON** → **CREATE**

> ⚠️ JSON file ko kahin commit/upload NAHI karna — sirf GitHub Secret me paste hogi (B2).

### B2. GitHub Secret me paste karein

1. Apne GitHub repo me jayein → **Settings → Secrets and variables → Actions**
2. **New repository secret**:
   - Name: `GCP_SERVICE_ACCOUNT_JSON`
   - Secret: JSON file ko text editor me kholo, **poora content copy** karke paste karo
3. **Add secret** — bas, yahi ek secret kaafi hai!

### (Optional) Variables tab

| Variable | Value |
|---|---|
| `API_BASE_URL` | Hosted backend (e.g. `https://qalb.vercel.app`) — **khali chhod sakte hain** |

---

## Part C — APK hosting: GitHub Releases ❌ → AB AUTOMATIC

APK **GitHub Release** me host hoti hai — repo public hai to download link koi bhi khol
sakta hai (bina login, bina billing):

- Har build ka tag: `v1.0.0-<run_number>` (jaise `v1.0.0-27`)
- Asset: `qalb-v1.0.0.apk`
- Download link pattern: `https://github.com/<owner>/<repo>/releases/download/<tag>/qalb-v1.0.0.apk`
- Yahi link Firestore `appVersions/latest.apkUrl` me jata hai — app isi se update download karti hai

> ⚠️ **Repo PUBLIC hona zaroori hai!** Private repo me release download link bina login
> ke 404 deta hai. Check karo: repo → **Settings → General → neeche Danger Zone →
> Change visibility → Public**.

---

## Part D — Signing Keystore ❌ → AB AUTOMATIC (Firestore me)

Pehle keystore GCS bucket me jati thi — ab **Firestore ke private doc
`ci_private/keystore`** me base64 hoti hai:

- Pehli build pe keystore generate hoti hai (`keytool`, PKCS12, 10000 din valid)
- Base64 hoke `ci_private/keystore` doc me save hoti hai (~5KB — 1MiB limit se door)
- Har agli build **wahi keystore** wapas uthati hai → same signature → app updates
  smoothly install hote hain
- `ci_private` collection **security rules me fully blocked** hai — client se koi nahi
  padh sakta, sirf service account (admin access) hi kar sakta hai

> ⚠️ **Important:** Ye doc kabhi delete mat karna aur rules me `ci_private` kabhi open
> mat karna — wahi aapki app ki asli chaabi hai. Kho gayi to purane users ke phones me
> update install nahi hogi (signature mismatch). Backup chahiye to Firestore console se
> doc export karke kahin safe rakho.

### (Optional / Advanced) Apna keystore dena ho to

Chaho to future me khud keystore bana ke `ci_private/keystore` doc ke
`keystoreBase64` field me base64 daal sakte ho — workflow wahi use karega. Passwords
workflow me fixed hain (`qalb-auto-store-2026` / `qalb-auto-key-2026`, alias `qalb`).

---

## Part E — Pehla build (one-time local init)

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
- APK banata hai, sign karta hai, **GitHub Release** pe daalta hai
- Firestore `appVersions/latest` me naya version + download link publish karta hai

## 📲 App me update kaise aata hai

1. User ka installed app **Profile tab → App Version → Check** dabata hai
   (ya app launch pe auto-check bhi laga sakte hain — `useAppUpdate(true)`)
2. App Firestore se `appVersions/latest` doc uthata hai — **direct REST se, koi server nahi**
3. `versionCode (Firestore) > versionCode (installed)` → **Update card** dikhta hai
4. "Update Download Karein (APK)" tap → native downloader (progress %, retry) →
   APK download → Android install prompt
   *(pehli baar "Install unknown apps" permission maangega — normal hai)*

## 🔍 Verify karne ke liye

- **Actions tab** — workflow ka green tick
- **Releases page** — naya release `v1.0.0-<run_number>` + APK asset attached
- **Firestore** — `appVersions/latest` doc me naya versionCode + GitHub apkUrl
- **App** — Profile → Check → "Naya version: x.y.z" card

## 🧯 Troubleshooting

| Masla | Hal |
|---|---|
| Workflow fail: `GCP_SERVICE_ACCOUNT_JSON` missing | Part B — 1 secret zaroori hai |
| Firestore publish fail (403) | Firebase service account (`firebase-adminsdk-...`) use karein — isme Firebase Admin hota hai. Custom SA ho to `Datastore User` role dein |
| Release download link 404 deta hai | Repo **public** hai? Settings → Danger Zone → Change visibility → Public |
| Keystore save fail ho rahi hai | `ci_private` collection pe rules admin write allow karte hain (service account). Firestore DB created hai na? Part A dobara dekho |
| App me update nahi dikh raha | Firestore doc ka versionCode installed se bara hai? App ko restart karke Check dabayein |
| Install blocked | Settings → Install unknown apps → browser/manager ko allow |
| Version same reh gaya | Push ke baad run_number hi versionCode hai — naya push = naya code |
| Search APK me kaam nahi kar raha | `API_BASE_URL` variable set karein (hosted backend) — warna verified library chalegi |
