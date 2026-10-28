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

> 🪄 **Naya (auto-magic) version:** Ab pipeline khud GCS bucket banati hai, khud signing
> keystore generate + save karti hai, aur Firebase project id bhi khud detect karti hai.
> Aapko sirf **2 cheezein** manually karni hain — **Firestore Database** (Part A) aur
> **1 GitHub Secret** (Part B). Baaki sab automatic!

---

## Part A — Firestore Database (Firebase console me, ~5 minute)

1. [console.firebase.google.com](https://console.firebase.google.com) → apna project kholo
   (e.g. `Shivam` / `shivam-2bace`)
2. Left menu → **Build → Firestore Database** → **Create database** → **Production mode** →
   region: `asia-south1` (ya jo chale) → **Enable**
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

## Part B — Service Account JSON → GitHub Secret (~5 minute)

### B1. JSON key download karein (GCP console)

1. [console.cloud.google.com](https://console.cloud.google.com) → upar project select:
   apna project (e.g. `Shivam` / `shivam-2bace`)
2. Left menu ☰ → **IAM & Admin → Service Accounts**
3. List me `firebase-adminsdk-fbsvc@<project-id>.iam.gserviceaccount.com` pe click karein
   *(ye account Firebase banate waqt khud bana hota hai — isme **Firebase Admin** +
   **Storage Admin** roles pehle se hote hain, kuch add karne ki zaroorat nahi)*
4. Upar **KEYS** tab → **ADD KEY → Create new key** → **JSON** → **CREATE**
5. JSON file download ho jayegi — **is file ko kahin commit/upload nahi karna!**

> Agar aap GCP → IAM & Admin → Service Accounts me ye account na dekhein to Firebase
> Console → ⚙️ Project settings → **Service accounts** → **Generate new private key**
> se bhi JSON mil jati hai.

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
| `FIREBASE_PROJECT_ID` | Zaroorat nahi — workflow JSON se khud detect karta hai |

---

## Part C — GCS bucket ❌ → AB AUTOMATIC

Pehle manually bucket banana padta tha. **Ab workflow khud karti hai:**
- Pehli build pe `gs://qalb-builds-<project-id>` bucket khud ban jata hai (asia-south1)
- APK downloads ke liye public read khud set hota hai
- Naam me `<project-id>` isliye hai ke bucket naam globally unique ho — koi clash nahi

Aapko kuch nahi karna. ✅

---

## Part D — Signing Keystore ❌ → AB AUTOMATIC

Pehle keytool se keystore banake base64 karke 4 secrets daalne padte the. **Ab workflow
khud karti hai:**
- Pehli build pe keystore generate hoti hai (`keytool`, PKCS12, 10000 din valid)
- Private bucket `gs://qalb-keys-<project-id>/keys/keystore.jks` me save hoti hai
- Har agli build **wahi keystore** download karti hai → same signature → app updates
  smoothly install hote hain

> ⚠️ **Important:** Private bucket (`qalb-keys-...`) ko kabhi public NAHI karna — wahi
> aapki app ki asli chaabi hai. Use kho kar dobara banane par purane users ke phones me
> update install nahi hogi (signature mismatch).

### (Optional / Advanced) Apna keystore dena ho to

Chaho to apne PC pe `keytool -genkeypair` se keystore banake ye 4 secrets bhi de sakte ho —
ye auto keystore ko override kar denge:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | keystore file ka base64 |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | alias (e.g. `qalb`) |
| `ANDROID_KEY_PASSWORD` | key password |

**Recommended:** Simple rakhna hai to ye 4 secrets bilkul set na karein — auto mode hi best hai.

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
- **GCS** — `gs://qalb-builds-<project-id>/releases/` me naya APK
- **Firestore** — `appVersions/latest` doc me naya versionCode/apkUrl
- **App** — Profile → Check → "Naya version: x.y.z" card

## 🧯 Troubleshooting

| Masla | Hal |
|---|---|
| Workflow fail: `GCP_SERVICE_ACCOUNT_JSON` missing | Part B — 1 secret zaroori hai |
| Firestore publish fail (403) | Firebase service account (`firebase-adminsdk-...`) use karein — isme Firebase Admin hota hai. Custom SA ho to `Datastore User` role dein |
| GCS upload / bucket banane me fail (403) | Service account ko project-level `Storage Admin` chahiye (firebase-adminsdk me default hota hai) |
| App me update nahi dikh raha | Firestore doc ka versionCode installed se bara hai? App ko restart karke Check dabayein |
| Install blocked | Settings → Install unknown apps → browser/manager ko allow |
| Version same reh gaya | Push ke baad run_number hi versionCode hai — naya push = naya code |
| Search APK me kaam nahi kar raha | `API_BASE_URL` variable set karein (hosted backend) — warna verified library chalegi |
