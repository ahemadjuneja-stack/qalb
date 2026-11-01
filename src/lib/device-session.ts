'use client'

// Qalb — DEVICE SESSION (v0.5.26): "app update = logout" ka pakka khatma
// ────────────────────────────────────────────────────────────────────
// Problem: APK update ke waqt WebView localStorage wipe ho sakta hai
// (Chromium data-dir bug) — v0.5.21 se native prefs mirror hai. LEKIN
// agar app UNINSTALL karke naya APK lagaya jaye to phone ka saara local
// data (prefs included) mit jata hai — login phir dena padta tha.
//
// FIX: Firebase refresh-token AES-256-GCM se encrypt karke Firestore doc
// `deviceSessions/{sha256(ANDROID_ID)}` me rakho. ANDROID_ID uninstall-
// reinstall par SAME rehta hai (same signing key + user) — naye install
// me app khud wahi doc utha kar chup-chaap login restore kar leti hai.
// Ye HAR case me kaam karta hai: WebView wipe / uninstall / clear-data.
//
// Security:
//   • Doc id = sha256(androidId + salt1) — ANDROID_ID kabhi store nahi
//   • Token ciphertext AES-GCM, key = sha256(androidId + salt2) — doc
//     padhne wale ko ANDROID_ID na pata ho to decrypt impossible
//   • Firestore rules: `get` allowed, `list` BAND — koi enumeration nahi
//   • Manual logout → doc DELETE (user ki marzi sabse upar)
//   • Sab calls non-fatal — cloud na ho to app pehle jaisi chalegi

import { QALB } from '@/lib/qalb'
import { withNetTimeout } from '@/lib/remote-data'
import { isNativeApp, nativeAndroidId } from '@/plugins/qalb-native'

const SALT_DOC = 'qalb-ds-doc-v1'
const SALT_KEY = 'qalb-ds-key-v1'
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${QALB.firebaseProjectId}/databases/(default)/documents`

export interface DeviceSessionSeed {
  uid: string
  phone: string | null
  email: string | null
  name: string
  photoUrl: string | null
  provider: 'phone' | 'google'
  refreshToken: string
}

let docIdCache: string | null = null
let keyCache: CryptoKey | null = null

function subtle(): SubtleCrypto | null {
  try {
    return typeof crypto !== 'undefined' && crypto.subtle ? crypto.subtle : null
  } catch {
    return null
  }
}

function toHex(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf)
  let s = ''
  for (const x of b) s += x.toString(16).padStart(2, '0')
  return s
}

async function deviceDocId(): Promise<string | null> {
  if (docIdCache) return docIdCache
  const s = subtle()
  if (!s || !isNativeApp()) return null
  const aid = await nativeAndroidId()
  if (!aid) return null
  const h = await s.digest('SHA-256', new TextEncoder().encode(aid + SALT_DOC))
  docIdCache = toHex(h)
  return docIdCache
}

async function deviceKey(): Promise<CryptoKey | null> {
  if (keyCache) return keyCache
  const s = subtle()
  if (!s || !isNativeApp()) return null
  const aid = await nativeAndroidId()
  if (!aid) return null
  const h = await s.digest('SHA-256', new TextEncoder().encode(aid + SALT_KEY))
  keyCache = await s.importKey('raw', h, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
  return keyCache
}

/** refresh-token seal: base64(iv[12] + AES-GCM ciphertext) */
async function seal(refreshToken: string): Promise<string | null> {
  try {
    const key = await deviceKey()
    if (!key) return null
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(refreshToken)
    )
    const out = new Uint8Array(iv.length + ct.byteLength)
    out.set(iv)
    out.set(new Uint8Array(ct), iv.length)
    let bin = ''
    for (const x of out) bin += String.fromCharCode(x)
    return btoa(bin)
  } catch {
    return null
  }
}

/** seal() ka ulta — refreshToken (fail = null) */
async function unseal(blob: string): Promise<string | null> {
  try {
    const key = await deviceKey()
    if (!key) return null
    const bin = atob(blob)
    const raw = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i)
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, key, raw.slice(12))
    return new TextDecoder().decode(pt)
  } catch {
    return null
  }
}

const FSVAL_NULL = { nullValue: null } as const

function fsStr(v: string | null | undefined) {
  return v ? { stringValue: v } : FSVAL_NULL
}

/** Login/refresh ke baad — device session cloud me save (fire & forget) */
export async function saveDeviceSession(seed: DeviceSessionSeed): Promise<void> {
  try {
    const docId = await deviceDocId()
    if (!docId) return
    const d = await seal(seed.refreshToken)
    if (!d) return
    const body = {
      fields: {
        v: { integerValue: '1' },
        uid: { stringValue: seed.uid },
        name: fsStr(seed.name),
        email: fsStr(seed.email),
        phone: fsStr(seed.phone),
        photoUrl: fsStr(seed.photoUrl),
        provider: { stringValue: seed.provider },
        d: { stringValue: d },
        at: { stringValue: new Date().toISOString() },
      },
    }
    await withNetTimeout(
      fetch(`${FS_BASE}/deviceSessions/${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
      }),
      8000
    )
  } catch {
    /* non-fatal — mirror/local pehle hi hai */
  }
}

/** Naye install pe — cloud se encrypted session uthao (null = nahi mila) */
export async function restoreDeviceSession(): Promise<DeviceSessionSeed | null> {
  try {
    const docId = await deviceDocId()
    if (!docId) return null
    const res = await withNetTimeout(
      fetch(`${FS_BASE}/deviceSessions/${docId}`, { cache: 'no-store' }),
      8000
    )
    if (!res.ok) return null
    const j = (await res.json()) as {
      fields?: Record<string, { stringValue?: string; integerValue?: string }>
    }
    const f = j.fields
    if (!f || f.v?.integerValue !== '1') return null
    const uid = f.uid?.stringValue
    const d = f.d?.stringValue
    if (!uid || !d) return null
    const refreshToken = await unseal(d)
    if (!refreshToken) return null
    return {
      uid,
      phone: f.phone?.stringValue ?? null,
      email: f.email?.stringValue ?? null,
      name: f.name?.stringValue || 'Qalb',
      photoUrl: f.photoUrl?.stringValue ?? null,
      provider: f.provider?.stringValue === 'phone' ? 'phone' : 'google',
      refreshToken,
    }
  } catch {
    return null
  }
}

/** Manual logout par — device session mitao (dobara auto-restore nahi) */
export async function deleteDeviceSession(): Promise<void> {
  try {
    const docId = await deviceDocId()
    if (!docId) return
    await withNetTimeout(
      fetch(`${FS_BASE}/deviceSessions/${docId}`, { method: 'DELETE', cache: 'no-store' }),
      8000
    )
  } catch {
    /* non-fatal */
  }
}
