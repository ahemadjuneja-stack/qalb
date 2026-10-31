'use client'

// Qalb — Authentication (Firebase Identity Toolkit REST — SDK ke bina)
// ─────────────────────────────────────────────────────────────────
// Static export APK ke liye Firebase JS SDK ka phone-auth chain bhaari
// hai — isliye direct REST (identitytoolkit.googleapis.com) use hota hai:
//
//   • MOBILE LOGIN : accounts:sendVerificationCode → OTP →
//                    accounts:signInWithPhoneNumber
//                    (reCAPTCHA invisible token Firebase project config
//                     se auto-lena — web SDK ka exact pattern)
//   • GOOGLE LOGIN : GIS credential (id_token) → accounts:signInWithIdp
//   • TOKEN REFRESH: securetoken grant_type=refresh_token (auto)
//   • USER SYNC    : Firestore users/{uid} doc (taste stats — per-user
//                    algorithm ke liye; rules me request.auth check hai)
//
// API KEY resolution chain (pehli matching jeet-ti hai):
//   1. NEXT_PUBLIC_FIREBASE_API_KEY  (CI GitHub variable)
//   2. localStorage qalb_auth_cfg    (dev override)
//   3. Firestore config/auth doc     (public read — console se banaya)
//
// Agar key/config missing ho → friendly 'auth-setup' error — UI setup
// guide dikhata hai, crash kabhi nahi (Safety Net rules).

import { create } from 'zustand'
import { QALB } from '@/lib/qalb'
import { withNetTimeout } from '@/lib/remote-data'
import { migrateEventsToUser, getTasteProfile } from '@/lib/recommend'

// ── Auth store ──────────────────────────────────────────────────

export interface QalbUser {
  uid: string
  phone: string | null
  email: string | null
  name: string
  photoUrl: string | null
  provider: 'phone' | 'google'
  idToken: string
  refreshToken: string
  expiresAt: number // epoch ms
}

interface AuthState {
  user: QalbUser | null
  ready: boolean
  guest: boolean // "Abhi nahi" skip — login gate dobara nahi dikhega
  loginOpen: boolean
  init: () => void
  setSession: (u: QalbUser) => void
  continueAsGuest: () => void
  logout: () => void
  openLogin: () => void
  closeLogin: () => void
}

const AUTH_KEY = 'qalb_auth_v1'
const GUEST_KEY = 'qalb_guest_v1'

function readGuest(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(GUEST_KEY) === '1'
  } catch {
    return false
  }
}

function readUser(): QalbUser | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(AUTH_KEY)
    return raw ? (JSON.parse(raw) as QalbUser) : null
  } catch {
    return null
  }
}

function persistUser(u: QalbUser | null) {
  try {
    if (u) window.localStorage.setItem(AUTH_KEY, JSON.stringify(u))
    else window.localStorage.removeItem(AUTH_KEY)
  } catch {
    /* quota — ignore */
  }
}

export const useQalbAuth = create<AuthState>((set) => ({
  user: null,
  ready: false,
  guest: false,
  loginOpen: false,
  init: () => {
    const u = readUser()
    set({ user: u, guest: u ? false : readGuest(), ready: true })
    if (u) {
      void ensureIdToken() // expiry nikaal rahi ho to chup-chaap refresh
      // v0.4.0: login ka user playlist cloud sync (wahi playlist wapis)
      // 3s delay — app boot pe network rush nahi karna
      setTimeout(() => {
        void import('@/lib/user-sync')
          .then((m) => m.syncUserPlaylists())
          .catch(() => {})
      }, 3_000)
    }
  },
  setSession: (u) => {
    persistUser(u)
    try {
      window.localStorage.setItem(GUEST_KEY, '0') // ab asli user hai
    } catch {
      /* ignore */
    }
    set({ user: u, guest: false })
  },
  continueAsGuest: () => {
    try {
      window.localStorage.setItem(GUEST_KEY, '1')
    } catch {
      /* ignore */
    }
    set({ guest: true })
  },
  logout: () => {
    persistUser(null)
    // manual logout → Musafir mode (gate dobara NAHI aata — app chalti rahe)
    try {
      window.localStorage.setItem(GUEST_KEY, '1')
    } catch {
      /* ignore */
    }
    set({ user: null, guest: true })
  },
  openLogin: () => set({ loginOpen: true }),
  closeLogin: () => set({ loginOpen: false }),
}))

/** Login gate dikhana hai? (pehli launch — na user, na guest-skip) */
export function authGateVisible(s: {
  ready: boolean
  user: QalbUser | null
  guest: boolean
}): boolean {
  return s.ready && !s.user && !s.guest
}

// ── Config resolution (API key / Google client id) ──────────────

export interface AuthConfig {
  apiKey: string | null
  googleClientId: string | null
}

let cfgPromise: Promise<AuthConfig> | null = null

export function getAuthConfig(): Promise<AuthConfig> {
  if (!cfgPromise) {
    cfgPromise = (async () => {
      let apiKey = (process.env.NEXT_PUBLIC_FIREBASE_API_KEY as string | undefined) ?? null
      let googleClientId =
        (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID as string | undefined) ?? null

      // dev/local override
      if (typeof window !== 'undefined') {
        try {
          const ov = window.localStorage.getItem('qalb_auth_cfg')
          if (ov) {
            const o = JSON.parse(ov) as Partial<AuthConfig>
            apiKey = apiKey ?? o.apiKey ?? null
            googleClientId = googleClientId ?? o.googleClientId ?? null
          }
        } catch {
          /* ignore */
        }
      }

      // Firestore config/auth doc (public read) — production fallback
      if (!apiKey || !googleClientId) {
        try {
          const url = `https://firestore.googleapis.com/v1/projects/${QALB.firebaseProjectId}/databases/(default)/documents/config/auth`
          const res = await withNetTimeout(fetch(url, { cache: 'no-store' }), 8000)
          if (res.ok) {
            const j = (await res.json()) as { fields?: Record<string, { stringValue?: string }> }
            const f = j.fields ?? {}
            apiKey = apiKey ?? f.apiKey?.stringValue ?? null
            googleClientId = googleClientId ?? f.googleClientId?.stringValue ?? null
          }
        } catch {
          /* offline / rules pending — env chain hi rahega */
        }
      }

      return { apiKey, googleClientId }
    })()
  }
  return cfgPromise
}

// ── ID token (auto-refresh) ─────────────────────────────────────

/** Har authenticated Firestore call se pehle — expired ho to refresh */
export async function ensureIdToken(): Promise<QalbUser | null> {
  const u = useQalbAuth.getState().user
  if (!u) return null
  if (Date.now() < u.expiresAt - 5 * 60_000) return u

  const { apiKey } = await getAuthConfig()
  if (!apiKey) return u // key nahi — purana token try karo

  try {
    const res = await withNetTimeout(
      fetch(`https://securetoken.googleapis.com/v1/token?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: u.refreshToken,
        }),
      }),
      10_000
    )
    if (!res.ok) {
      useQalbAuth.getState().logout() // refresh token revoke — logout
      return null
    }
    const j = (await res.json()) as {
      id_token: string
      refresh_token: string
      expires_in: string
    }
    const next: QalbUser = {
      ...u,
      idToken: j.id_token,
      refreshToken: j.refresh_token,
      expiresAt: Date.now() + Number(j.expires_in || 3600) * 1000,
    }
    useQalbAuth.getState().setSession(next)
    return next
  } catch {
    return u // network slow — purana token se kaam chalao
  }
}

// ── reCAPTCHA invisible (phone auth ka app verifier) ────────────

const RECAPTCHA_DIV_ID = 'qalb-recaptcha-holder'

declare global {
  interface Window {
    grecaptcha?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string
          size: string
          callback: (t: string) => void
          'error-callback'?: () => void
          'expired-callback'?: () => void
        }
      ) => number
      execute: (id: number, opts?: { action?: string }) => Promise<string> | string
    }
    __qalbRecaptchaReady?: () => void
  }
}

function loadScript(src: string, timeoutMs = 12_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`)
    if (existing) {
      resolve()
      return
    }
    const s = document.createElement('script')
    s.src = src
    s.async = true
    const timer = setTimeout(() => reject(new Error('script-timeout')), timeoutMs)
    s.onload = () => {
      clearTimeout(timer)
      resolve()
    }
    s.onerror = () => {
      clearTimeout(timer)
      reject(new Error('script-failed'))
    }
    document.head.appendChild(s)
  })
}

/** Firebase project config se site key + invisible widget se token */
let recaptchaSiteKeyCache: string | null = null

// ── reCAPTCHA engine readiness (RACE FIX) ──────────────────────────
// recaptcha/api.js ek chhota LOADER hai — asli engine (recaptcha__en.js)
// wo ASYNC inject karta hai aur tab tak window.grecaptcha undefined
// rehta hai. Pehle hum sirf script-tag ke load event ka wait karte the
// → render call se pehle hi `!g` → 'auth-setup' ("Login abhi setup ho
// raha hai") — isi race ne OTP block kiya tha. Ab onload callback
// PEHLE define karte hain (api.js ise engine-ready hone par fire
// karta hai) + poll safety net (repeat attempt par onload dobara nahi
// chalta).
let recaptchaReadyP: Promise<void> | null = null

function ensureRecaptchaReady(): Promise<void> {
  if (recaptchaReadyP) return recaptchaReadyP
  recaptchaReadyP = new Promise<void>((resolve, reject) => {
    let settled = false
    const ok = () => {
      if (!settled) {
        settled = true
        resolve()
      }
    }
    const fail = (e: Error) => {
      if (!settled) {
        settled = true
        recaptchaReadyP = null // retry possible
        reject(e)
      }
    }
    ;(window as unknown as { __qalbRecaptchaReady?: () => void }).__qalbRecaptchaReady = ok
    loadScript(
      'https://www.google.com/recaptcha/api.js?onload=__qalbRecaptchaReady&render=explicit',
      15_000
    ).catch((e) => fail(e instanceof Error ? e : new Error('script-failed')))
    // Safety net: agar script pehle se page par loaded hai to onload
    // dobara fire NAHI hota (dusra attempt) — grecaptcha ke aa-te hi
    // resolve kar do.
    const poll = setInterval(() => {
      const g = window.grecaptcha
      if (g && typeof g.render === 'function') {
        clearInterval(poll)
        ok()
      }
    }, 120)
    setTimeout(() => {
      clearInterval(poll)
      fail(new Error('recaptcha-load-timeout'))
    }, 20_000)
  })
  return recaptchaReadyP
}

async function getRecaptchaToken(apiKey: string): Promise<string> {
  // 1. site key — identitytoolkit GetRecaptchaParam (Firebase JS SDK ka
  //    standard endpoint). NOTE: pehle projects/{id}/config try kiya tha
  //    lekin wo public API key se 404 deta hai — sirf recaptchaParams
  //    endpoint hi apiKey se site key deta hai.
  let siteKey: string | null = recaptchaSiteKeyCache
  if (!siteKey) {
    try {
      const url = `https://identitytoolkit.googleapis.com/v1/recaptchaParams?key=${apiKey}`
      const res = await withNetTimeout(fetch(url, { cache: 'no-store' }), 10_000)
      if (res.ok) {
        const j = (await res.json()) as { recaptchaSiteKey?: string }
        siteKey = j.recaptchaSiteKey ?? null
        if (siteKey) recaptchaSiteKeyCache = siteKey
      }
    } catch {
      /* fallthrough */
    }
  }
  if (!siteKey) throw new Error('phone-setup')

  // 2. reCAPTCHA v2 invisible widget — ENGINE fully ready hone ka wait
  //    (sirf script-tag load ka nahi — wahi race bug tha)
  await ensureRecaptchaReady()
  const g = window.grecaptcha
  if (!g || typeof g.render !== 'function') throw new Error('recaptcha-fail')

  // Har attempt par FRESH holder — purane widget par dobara render karne
  // par reCAPTCHA "already rendered" throw karta hai (retry tooti rehti)
  document.getElementById(RECAPTCHA_DIV_ID)?.remove()
  const holder = document.createElement('div')
  holder.id = RECAPTCHA_DIV_ID
  holder.style.position = 'fixed'
  holder.style.bottom = '-9999px'
  holder.style.right = '-9999px'
  document.body.appendChild(holder)

  return new Promise<string>((resolve, reject) => {
    try {
      const widgetId = g.render(holder as HTMLElement, {
        sitekey: siteKey as string,
        size: 'invisible',
        callback: (token: string) => resolve(token),
        // widget-level errors (domain block, challenge fail) par hang ke
        // bajaye turant saaf error — 20s ka wait nahi
        'error-callback': () => reject(new Error('recaptcha-fail')),
        'expired-callback': () => reject(new Error('recaptcha-timeout')),
      })
      const exec = g.execute(widgetId)
      if (exec && typeof (exec as Promise<string>).then === 'function') {
        ;(exec as Promise<string>).then(resolve).catch(() => reject(new Error('recaptcha-fail')))
      }
      setTimeout(() => reject(new Error('recaptcha-timeout')), 20_000)
    } catch {
      reject(new Error('recaptcha-fail'))
    }
  })
}

// ── PHONE OTP flow ──────────────────────────────────────────────

let activePhoneSession: { sessionInfo: string; phone: string } | null = null

export function hasPhoneSession(): boolean {
  return activePhoneSession !== null
}

export function clearPhoneSession() {
  activePhoneSession = null
}

function errKind(raw: string | undefined): string {
  if (!raw) return 'auth-fail'
  if (raw.includes('PHONE_NUMBER_INVALID') || raw.includes('INVALID_PHONE_NUMBER'))
    return 'phone-invalid'
  if (raw.includes('INVALID_CODE') || raw.includes('INVALID_SESSION'))
    return 'otp-invalid'
  if (raw.includes('TOO_MANY_ATTEMPTS') || raw.includes('EXCEEDED')) return 'rate-limit'
  // SMS region policy — Firebase naye projects me default-deny hota hai:
  // "SMS unable to be sent until this region enabled by the app developer"
  // (ye OPERATION_NOT_ALLOWED se pehle check karna zaroori hai)
  if (raw.includes('SMS unable') || raw.includes('region enabled'))
    return 'sms-region'
  // Phone provider Firebase console me enabled nahi (ya project config
  // adhoori) — user ka masla nahi, setup ka hai
  if (
    raw.includes('OPERATION_NOT_ALLOWED') ||
    raw.includes('ADMIN_ONLY_OPERATION') ||
    raw.includes('OPERATOR_NOT_ALLOWED') ||
    raw.includes('INVALID_APP_CREDENTIALS')
  )
    return 'phone-setup'
  if (raw.includes('API_KEY')) return 'auth-setup'
  return 'auth-fail'
}

/** Step 1: OTP bhejo (+91XXXXXXXXXX E.164 format) */
export async function sendPhoneOtp(phoneE164: string): Promise<void> {
  const { apiKey } = await getAuthConfig()
  if (!apiKey) throw new Error('auth-setup')

  const recaptchaToken = await getRecaptchaToken(apiKey)

  let j: { sessionInfo?: string; error?: { message?: string } } = {}
  try {
    const res = await withNetTimeout(
      fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phoneNumber: phoneE164,
            recaptchaToken,
          }),
        }
      ),
      20_000
    )
    j = (await res.json()) as typeof j
    if (!res.ok || !j.sessionInfo) throw new Error(errKind(j.error?.message))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'auth-fail'
    throw new Error(msg === 'auth-fail' ? 'otp-send-fail' : msg)
  }

  activePhoneSession = { sessionInfo: j.sessionInfo as string, phone: phoneE164 }
}

/** Step 2: OTP verify → session */
export async function verifyPhoneOtp(code: string): Promise<QalbUser> {
  const { apiKey } = await getAuthConfig()
  if (!apiKey) throw new Error('auth-setup')
  if (!activePhoneSession) throw new Error('otp-invalid')

  const res = await withNetTimeout(
    fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionInfo: activePhoneSession.sessionInfo,
          code: code.trim(),
        }),
      }
    ),
    20_000
  )
  const j = (await res.json()) as {
    idToken?: string
    refreshToken?: string
    expiresIn?: string
    localId?: string
    phoneNumber?: string
    error?: { message?: string }
  }
  if (!res.ok || !j.idToken || !j.localId) {
    throw new Error(errKind(j.error?.message))
  }

  const user: QalbUser = {
    uid: j.localId,
    phone: j.phoneNumber ?? activePhoneSession.phone,
    email: null,
    name: 'Musafir',
    photoUrl: null,
    provider: 'phone',
    idToken: j.idToken,
    refreshToken: j.refreshToken ?? '',
    expiresAt: Date.now() + Number(j.expiresIn || 3600) * 1000,
  }
  completeLogin(user)
  return user
}

// ── GOOGLE flow (v0.4.4 — system Chrome + loopback OAuth) ───────
// GIS one-tap Capacitor WebView me block hota hai (popup + origin dono),
// aur Google Console custom-scheme redirect URI bhi accept nahi karta
// ("must use http or https"). Hal: Google ka OFFICIAL installed-app
// flow — LOOPBACK IP:
//   1. QalbNative.startOauthServer → app 127.0.0.1:PORT par HTTP server
//   2. openExternal → Chrome me Google account picker
//      (redirect_uri=http://127.0.0.1:PORT/oauth2redirect, code + PKCE)
//   3. Consent ke baad Google Chrome ko isi loopback par redirect karta hai
//   4. QalbOauth query ko qalb://oauth2redirect?... fake deep-link me
//      wrap karke JS tak pahunchata hai (event + pending static)
//   5. JS state check → code→id_token exchange (PKCE) → signInWithIdp
// CSRF: state param localStorage me save, redirect par match.
// PKCE: verifier localStorage me, challenge S256 authorize me jaata hai.

const OAUTH_REDIRECT_URI = 'qalb://oauth2redirect' // dev-web fallback
const OAUTH_STATE_KEY = 'qalb_oauth_state_v1'
const OAUTH_VERIFIER_KEY = 'qalb_oauth_verifier_v1'

/** base64url random string (state / nonce / PKCE verifier) */
function oauthRandom(numBytes: number): string {
  const b = new Uint8Array(numBytes)
  crypto.getRandomValues(b)
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

interface OauthRedirectParts {
  idToken: string | null
  code: string | null
  state: string | null
  error: string | null
}

/** qalb://oauth2redirect[#|?]... — fragment (implicit) + query (code) dono */
function parseOauthRedirect(raw: string): OauthRedirectParts {
  const out: OauthRedirectParts = { idToken: null, code: null, state: null, error: null }
  try {
    const url = new URL(raw)
    const frag = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
    const qp = new URLSearchParams(url.search || '')
    const fp = new URLSearchParams(frag || '')
    out.error = qp.get('error') ?? fp.get('error')
    out.state = qp.get('state') ?? fp.get('state')
    out.code = qp.get('code') ?? fp.get('code')
    out.idToken = qp.get('id_token') ?? fp.get('id_token')
  } catch {
    // URL parser na chale to regex fallback (sirf id_token)
    const m = raw.match(/id_token=([^&\s]+)/)
    if (m) {
      try {
        out.idToken = decodeURIComponent(m[1])
      } catch {
        out.idToken = m[1]
      }
    }
  }
  return out
}

/** Chrome me kholo — native bridge, warna dev-web fallback */
async function openInSystemBrowser(url: string): Promise<boolean> {
  const { nativeOpenExternal } = await import('@/plugins/qalb-native')
  if (await nativeOpenExternal(url)) return true
  try {
    window.open(url, '_blank', 'noopener')
    return true
  } catch {
    return false
  }
}

/**
 * Pending redirect lena (ek baar — auto clear).
 * Native static MainActivity se aata hai — cold-start-proof (app ka
 * process Chrome me hi mar gaya ho tab bhi URL milta hai).
 */
async function consumePendingOauth(): Promise<string | null> {
  try {
    const { nativeConsumeOauthRedirect } = await import('@/plugins/qalb-native')
    const u = await nativeConsumeOauthRedirect()
    if (u) return u
  } catch {
    /* native nahi hai — web fallback */
  }
  try {
    const w = window as unknown as { __qalbOauthUrl?: string | null }
    const u = w.__qalbOauthUrl
    if (typeof u === 'string' && u) {
      w.__qalbOauthUrl = null
      return u
    }
  } catch {
    /* ignore */
  }
  return null
}

/** Chrome se wapas aane ka wait — native event + poll (dono channels) */
function waitForOauthRedirect(timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let done = false
    let poll: ReturnType<typeof setInterval> | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    const cleanup = () => {
      window.removeEventListener('qalbOauthRedirect', handler as EventListener)
      if (poll) clearInterval(poll)
      if (timer) clearTimeout(timer)
    }
    const ok = (url: string) => {
      if (!done) {
        done = true
        cleanup()
        resolve(url)
      }
    }
    const bad = (e: Error) => {
      if (!done) {
        done = true
        cleanup()
        reject(e)
      }
    }
    const handler = (ev: Event) => {
      const d = (ev as CustomEvent<{ url?: string }>).detail
      if (d && typeof d.url === 'string' && d.url) ok(d.url)
    }
    window.addEventListener('qalbOauthRedirect', handler as EventListener)
    poll = setInterval(() => {
      void consumePendingOauth().then((u) => {
        if (u) ok(u)
      })
    }, 700)
    timer = setTimeout(() => bad(new Error('google-timeout')), timeoutMs)
  })
}

/** Google authorize URL — code + PKCE (loopback redirect) */
function buildAuthorizeUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  challenge: string
): string {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  u.searchParams.set('client_id', clientId)
  u.searchParams.set('redirect_uri', redirectUri)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('scope', 'openid email profile')
  u.searchParams.set('state', state)
  u.searchParams.set('prompt', 'select_account')
  u.searchParams.set('code_challenge', challenge)
  u.searchParams.set('code_challenge_method', 'S256')
  return u.toString()
}

/** PKCE S256 challenge (code fallback ke liye) */
async function pkceChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  let s = ''
  for (const x of new Uint8Array(digest)) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** code → id_token (token endpoint — secret optional, PKCE pahle) */
async function exchangeGoogleCode(code: string, clientId: string): Promise<string> {
  let verifier = ''
  try {
    verifier = window.localStorage.getItem(OAUTH_VERIFIER_KEY) ?? ''
    window.localStorage.removeItem(OAUTH_VERIFIER_KEY)
  } catch {
    /* ignore */
  }
  if (!verifier) throw new Error('google-fail')
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    redirect_uri: OAUTH_REDIRECT_URI,
    grant_type: 'authorization_code',
    code_verifier: verifier,
  })
  const secret = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_SECRET as string | undefined) ?? ''
  if (secret) body.set('client_secret', secret)
  const res = await withNetTimeout(
    fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }),
    20_000
  )
  const j = (await res.json()) as { id_token?: string }
  if (!res.ok || !j.id_token) throw new Error('google-fail')
  return j.id_token
}

/** Google id_token → Firebase session (accounts:signInWithIdp) */
async function googleIdpLogin(idToken: string, apiKey: string): Promise<QalbUser> {
  const res = await withNetTimeout(
    fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postBody: `id_token=${encodeURIComponent(idToken)}&providerId=google.com`,
          requestUri:
            typeof window !== 'undefined' ? window.location.origin : 'http://localhost',
          returnIdpCredential: true,
        }),
      }
    ),
    20_000
  )
  const j = (await res.json()) as {
    idToken?: string
    refreshToken?: string
    expiresIn?: string
    localId?: string
    displayName?: string
    photoUrl?: string
    email?: string
    error?: { message?: string }
  }
  if (!res.ok || !j.idToken || !j.localId) {
    throw new Error(errKind(j.error?.message))
  }

  const user: QalbUser = {
    uid: j.localId,
    phone: null,
    email: j.email ?? null,
    name: j.displayName ?? 'Musafir',
    photoUrl: j.photoUrl ?? null,
    provider: 'google',
    idToken: j.idToken,
    refreshToken: j.refreshToken ?? '',
    expiresAt: Date.now() + Number(j.expiresIn || 3600) * 1000,
  }
  completeLogin(user)
  return user
}

/**
 * Redirect URL se login complete. State match NAHI → stale/poisoned
 * redirect — null (caller fresh flow chalata hai).
 */
async function finishGoogleAuth(
  redirectUrl: string,
  clientId: string,
  apiKey: string
): Promise<QalbUser | null> {
  const r = parseOauthRedirect(redirectUrl)
  let savedState = ''
  try {
    savedState = window.localStorage.getItem(OAUTH_STATE_KEY) ?? ''
  } catch {
    /* ignore */
  }
  try {
    window.localStorage.removeItem(OAUTH_STATE_KEY)
  } catch {
    /* ignore */
  }
  if (!r.state || !savedState || r.state !== savedState) return null
  if (r.error) {
    if (r.error === 'access_denied' || r.error === 'user_cancelled')
      throw new Error('google-cancel')
    throw new Error('google-fail')
  }
  let idToken = r.idToken
  if (!idToken && r.code) idToken = await exchangeGoogleCode(r.code, clientId)
  if (!idToken) throw new Error('google-fail')
  return googleIdpLogin(idToken, apiKey)
}

export async function googleSignIn(): Promise<QalbUser> {
  const { apiKey, googleClientId } = await getAuthConfig()
  if (!apiKey) throw new Error('auth-setup')
  if (!googleClientId) throw new Error('google-setup')

  // 1) pending redirect? (Chrome se wapas aane par event pehle aa chuka
  //    ho, ya app process wapas khulte hi flow adhoora mila ho)
  const pending = await consumePendingOauth()
  if (pending) {
    const u = await finishGoogleAuth(pending, googleClientId, apiKey)
    if (u) return u
    // stale (state mismatch) — fresh flow se continue
  }

  // 2) loopback server start (native) — Google ka official installed-app
  //    redirect. Web-dev fallback: qalb:// custom scheme (console me
  //    register nahi hota, sirf local testing).
  const { isNativeApp, nativeStartOauthServer, nativeStopOauthServer } = await import(
    '@/plugins/qalb-native'
  )
  const port = await nativeStartOauthServer(7849)
  if (isNativeApp() && port === null) {
    throw new Error('google-server-fail')
  }
  const redirectUri =
    port !== null ? `http://127.0.0.1:${port}/oauth2redirect` : OAUTH_REDIRECT_URI

  // 3) state + PKCE verifier save, Chrome me authorize kholo
  const state = oauthRandom(16)
  const verifier = oauthRandom(32)
  const challenge = await pkceChallenge(verifier)
  try {
    window.localStorage.setItem(OAUTH_STATE_KEY, state)
    window.localStorage.setItem(OAUTH_VERIFIER_KEY, verifier)
  } catch {
    /* ignore */
  }
  const url = buildAuthorizeUrl(googleClientId, redirectUri, state, challenge)
  const opened = await openInSystemBrowser(url)
  if (!opened) {
    void nativeStopOauthServer()
    throw new Error('google-no-browser')
  }

  // 4) redirect ka wait (server event + poll) — phir server band
  let redirect: string
  try {
    redirect = await waitForOauthRedirect(5 * 60_000)
  } finally {
    void nativeStopOauthServer()
  }

  const user = await finishGoogleAuth(redirect, googleClientId, apiKey)
  if (!user) throw new Error('google-fail')
  return user
}

// ── Login completion (shared) ───────────────────────────────────

function completeLogin(user: QalbUser) {
  // guest ke play events user account me migrate (taste aage chalta hai)
  migrateEventsToUser(user.uid)
  useQalbAuth.getState().setSession(user)
  void syncUserDoc(user)
  // v0.4.0: playlists cloud sync — local playlists user account me push,
  // cloud se wapas pull-merge (naya device ho to purani playlist wapis)
  import('@/lib/user-sync')
    .then((m) => m.syncUserPlaylists())
    .catch(() => {})
}

// ── Firestore users/{uid} sync (best-effort, kabhi throw nahi) ──

const FS_BASE = () =>
  `https://firestore.googleapis.com/v1/projects/${QALB.firebaseProjectId}/databases/(default)/documents`

export async function syncUserDoc(user?: QalbUser | null): Promise<void> {
  try {
    const u = user ?? (await ensureIdToken())
    if (!u) return
    const taste = getTasteProfile(u.uid)
    const body = {
      fields: {
        displayName: { stringValue: u.name },
        phone: { stringValue: u.phone ?? '' },
        email: { stringValue: u.email ?? '' },
        provider: { stringValue: u.provider },
        lastSeen: { timestampValue: new Date().toISOString() },
        totalPlays: { integerValue: String(taste.plays) },
        tasteArtists: {
          arrayValue: {
            values: taste.artistScores.slice(0, 5).map(([n]) => ({ stringValue: n })),
          },
        },
      },
    }
    await withNetTimeout(
      fetch(`${FS_BASE()}/users/${u.uid}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${u.idToken}`,
        },
        body: JSON.stringify(body),
      }),
      10_000
    )
    // rules publish hone tak 403 aa sakta hai — chup rehna, best-effort
  } catch {
    /* silent — koi user-facing error nahi */
  }
}

// ── Error messages (UI ke liye) ─────────────────────────────────

export function authErrorMessage(e: unknown): { title: string; desc: string } {
  const kind = e instanceof Error ? e.message : 'auth-fail'
  switch (kind) {
    case 'auth-setup':
      return {
        title: 'Login abhi setup ho raha hai',
        desc: 'Thodi der baad app band kar ke dobara khol kar try karein — naya update login theek kar dega. Tab tak Musafir (guest) mode me app enjoy karein.',
      }
    case 'phone-setup':
      return {
        title: 'Phone login abhi khula nahi hai',
        desc: 'Firebase console me Phone sign-in enable karna baaki hai — thodi der me theek ho jayega. Tab tak Google ya Musafir mode use karein.',
      }
    case 'sms-region':
      return {
        title: 'SMS is region ke liye abhi band hai',
        desc: 'Firebase Console → Authentication → Settings → SMS Region Policy me India (+91) allow karein — ye console se ek dafa karna hota hai.',
      }
    case 'google-setup':
      return {
        title: 'Google login abhi enable nahi hui',
        desc: 'Setup me thoda waqt lag raha hai — filhaal mobile number se login try karein.',
      }
    case 'google-no-browser':
      return {
        title: 'Chrome nahi khul saka',
        desc: 'Google login ke liye phone me Chrome (ya koi browser) chahiye — check kar ke dobara try karein.',
      }
    case 'google-server-fail':
      return {
        title: 'Login server start nahi hua',
        desc: 'App ko poori tarah band kar ke dobara khol kar try karein — phone ki memory thodi busy lag rahi hai.',
      }
    case 'google-unavailable':
      return {
        title: 'Google login is device par nahi khula',
        desc: 'Dobara try karein — ya mobile number se login karein.',
      }
    case 'google-timeout':
      return {
        title: 'Google login poora nahi hua',
        desc: 'Chrome me account select kar ke Qalb me wapas aayein — ya button dobara daba kar try karein.',
      }
    case 'google-fail':
      return {
        title: 'Google login me masla hua',
        desc: 'Dobara try karein — agar baar-baar aaye to mobile number se login karein.',
      }
    case 'google-cancel':
      return { title: 'Google login cancel ho gaya', desc: 'Dobara try karein.' }
    case 'phone-invalid':
      return {
        title: 'Number galat hai',
        desc: '10-digit mobile number check karein (jaise 98XXXXXXXX).',
      }
    case 'otp-invalid':
      return {
        title: 'OTP galat ya expire',
        desc: 'Naya code request karein aur dhyan se daalein.',
      }
    case 'rate-limit':
      return {
        title: 'Bahut zyada tries',
        desc: 'Is number par aaj bahut OTP requests ho gayin — 1-2 ghante baad try karein. Filhaal Google se login karein (button upar hai) — wo turant chalta hai.',
      }
    case 'otp-send-fail':
      return {
        title: 'OTP nahi bheja ja saka',
        desc: 'Network check karein ya thodi der baad try karein.',
      }
    case 'recaptcha-fail':
    case 'recaptcha-timeout':
    case 'recaptcha-load-timeout':
    case 'script-failed':
    case 'script-timeout':
      return {
        title: 'Security check load nahi ho payi',
        desc: 'Network thoda slow lag raha hai — thodi der baad dobara try karein.',
      }
    default:
      return { title: 'Login me masla hua', desc: 'Dobara try karein.' }
  }
}
