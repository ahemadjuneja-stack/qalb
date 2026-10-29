'use client'

// Qalb — Auto Update Engine (Shivam Staff app style)
// Flow: check (Firestore REST) → native AUTO-download (progress + retry)
//       → ready → install popup → FileProvider install intent
// Profile view ka manual "Check" bhi isi engine se chalta hai (single source of truth).

import { create } from 'zustand'
import { QALB } from '@/lib/qalb'
import { fetchAppVersionFromFirestore, withNetTimeout } from '@/lib/remote-data'
import { isNativeCapacitor } from '@/lib/downloads'
import { getUpdaterPlugin, onDownloadProgress } from '@/plugins/updater'
import type { AppVersionInfo } from '@/lib/types'

export type UpdatePhase = 'idle' | 'checking' | 'downloading' | 'ready' | 'error'

interface UpdateState {
  phase: UpdatePhase
  progress: number // 0-100
  info: AppVersionInfo | null
  readyPath: string | null
  error: string | null
  needsPermission: boolean
  dismissedCode: number | null
  lastCheckAt: number
  checkingSince: number // stale 'checking' phase detect karne ke liye
  lastCheckOk: boolean // false = pichla check network fail hua tha
}

export const useUpdateStore = create<UpdateState>(() => ({
  phase: 'idle',
  progress: 0,
  info: null,
  readyPath: null,
  error: null,
  needsPermission: false,
  dismissedCode: null,
  lastCheckAt: 0,
  checkingSince: 0,
  lastCheckOk: true,
}))

const set = useUpdateStore.setState
const CHECK_THROTTLE_MS = 3 * 60_000 // background re-check max 3 min baad
const CHECK_FAIL_RETRY_MS = 30_000 // FAIL hua check sirf 30s baad dobara
const CHECK_RETRY_DELAYS = [20_000, 40_000, 80_000, 160_000] // auto-retry backoff
const RETRY_DELAYS = [60_000, 60_000, 60_000, 60_000]

let retryTimer: ReturnType<typeof setTimeout> | null = null
let checkRetryTimer: ReturnType<typeof setTimeout> | null = null
let checkAttempt = 0

// Permission settings se wapas aane pe auto-install (ek dafa armed hota hai)
let autoInstallArmed = false
let autoRetryInitDone = false

function errMsg(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  return m.replace(/^Download error:\s*/i, '')
}

function clearRetry() {
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
}

function clearCheckRetry() {
  if (checkRetryTimer) {
    clearTimeout(checkRetryTimer)
    checkRetryTimer = null
  }
}

// Check fail hone pe auto-retry — app restart ki zaroorat nahi
function scheduleCheckRetry() {
  clearCheckRetry()
  if (checkAttempt >= CHECK_RETRY_DELAYS.length) return
  const delay = CHECK_RETRY_DELAYS[checkAttempt]
  checkRetryTimer = setTimeout(() => {
    checkRetryTimer = null
    void checkForUpdateEngine(true)
  }, delay)
}

// ── Check ────────────────────────────────────────────────────────────
// force=false → background auto-check (3 min throttle, dismissed respect)
// force=true  → user ne Profile se "Check" dabaya (dismiss ignore, turant)
export async function checkForUpdateEngine(force = false): Promise<AppVersionInfo | null> {
  const st = useUpdateStore.getState()
  // stuck-checking recovery — CapacitorHttp ka known issue: cold-start pe
  // native promise kabhi-kabhi settle nahi hota. 25s+ purana 'checking'
  // phase stale mana jayega, naya check allow.
  const checkingStale = st.phase === 'checking' && Date.now() - st.checkingSince > 25_000
  if ((st.phase === 'checking' || st.phase === 'downloading') && !checkingStale) return st.info
  // FAIL hua check 30s baad retry ho sakta hai; successful check 3 min throttle
  const throttleMs = st.lastCheckOk ? CHECK_THROTTLE_MS : CHECK_FAIL_RETRY_MS
  if (!force && Date.now() - st.lastCheckAt < throttleMs) return st.info

  clearCheckRetry()
  set({ phase: 'checking', error: null, checkingSince: Date.now() })

  let latest: AppVersionInfo | null = null
  let failed = false
  try {
    // 1) native APK → Firestore REST direct (10s timeout ke sath)
    if (isNativeCapacitor()) latest = await fetchAppVersionFromFirestore()

    // 2) web preview / hosted API (10s timeout ke sath)
    if (!latest) {
      const res = await withNetTimeout(
        fetch(`${QALB.apiBase}/api/app-version`, { cache: 'no-store' })
      )
      if (res.ok) latest = (await res.json()) as AppVersionInfo
    }

    // 3) last resort — Firestore REST
    if (!latest) latest = await fetchAppVersionFromFirestore()
  } catch {
    failed = true
  }

  // check FAIL hua (network cold-start / hang) → chhote backoff pe auto-retry.
  // Pehle fail pe bhi 3-min throttle lagta tha + koi retry nahi tha — isliye
  // user ko app band karke dobara kholna padta tha. Ab engine khud recover.
  if (!latest) {
    set({ phase: 'idle', info: null, lastCheckAt: Date.now(), lastCheckOk: !failed })
    if (failed) {
      checkAttempt++
      scheduleCheckRetry()
    } else {
      checkAttempt = 0
    }
    return null
  }

  // successful check → throttle normal, retry counter reset
  set({ lastCheckAt: Date.now(), lastCheckOk: true, checkingSince: 0 })
  checkAttempt = 0

  // same/older version → idle
  if (latest.versionCode <= QALB.currentVersionCode) {
    // stale APKs clean kar do (space bachao)
    // NOTE: plugin version-aware hai — pending update ka APK (naya
    // versionCode) SURAKSHIT rehta hai, sirf purane delete hote hain.
    const plugin = getUpdaterPlugin()
    if (plugin) {
      void plugin
        .cleanStale({ versionCode: String(QALB.currentVersionCode) })
        .catch(() => {})
    }
    set({ phase: 'idle', info: null })
    return null
  }

  set({ info: latest })

  // dismissed hai aur force nahi → auto-download nahi (profile card rehne do)
  // EXCEPTION: mandatory update (remoteConfig/server ka minVersionCode cross
  // ho chuka) → dismiss maane hi nahi, popup wapas aa hi jayega.
  if (
    !latest.mandatory &&
    st.dismissedCode !== null &&
    st.dismissedCode >= latest.versionCode &&
    !force
  ) {
    set({ phase: 'idle' })
    return latest
  }

  // native + plugin → AUTO download shuru
  const plugin = getUpdaterPlugin()
  if (plugin && latest.apkUrl) {
    void startDownload(latest)
    return latest
  }

  // web / purana build → old flow (profile card "Download Karein" → URL open)
  set({ phase: 'idle' })
  return latest
}

// ── Retry ("Dobara koshish") ─────────────────────────────────────────
// IMPORTANT: ye checkForUpdateEngine() NAHI call karta — wo same-version
// case me cleanStale chala ke downloaded APK DELETE kar deta tha, isliye
// "install hota nahi hai" wala bug banta tha. Ab: APK ready hai to seedha
// install (permission ab mil gayi hogi), warna download dobara.
export async function retryEngine(): Promise<void> {
  const st = useUpdateStore.getState()
  if (st.phase === 'downloading') return
  if (!st.info) {
    void checkForUpdateEngine(true)
    return
  }

  const plugin = getUpdaterPlugin()
  if (plugin) {
    try {
      const ready = await plugin.getReadyApk({ versionCode: String(st.info.versionCode) })
      if (ready?.path) {
        set({ phase: 'ready', readyPath: ready.path, progress: 100 })
        void installEngine()
        return
      }
    } catch {
      /* fallthrough → re-download */
    }
  }
  void startDownload(st.info)
}

// ── Auto-install on return from permission settings ──────────────────
// Ek dafa init karo (UpdatePopup mount pe): user settings me "Allow from
// this source" ON karke wapas aaye to install khud attempt ho jata hai.
export function initAutoInstallRetry(): void {
  if (autoRetryInitDone || typeof document === 'undefined') return
  autoRetryInitDone = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    if (!autoInstallArmed) return
    autoInstallArmed = false
    // thoda wait — Android activity resume settle ho jaye
    setTimeout(() => {
      void installEngine({ openSettings: false })
    }, 700)
  })
}

// ── Download (auto + retry) ──────────────────────────────────────────
async function startDownload(info: AppVersionInfo, attempt = 0): Promise<void> {
  const plugin = getUpdaterPlugin()
  if (!plugin || !info.apkUrl) return

  set({ phase: 'downloading', progress: 0, error: null, needsPermission: false })

  try {
    const ready = await plugin.getReadyApk({ versionCode: String(info.versionCode) })
    if (ready?.path) {
      set({ phase: 'ready', readyPath: ready.path, progress: 100 })
      return
    }

    const handle = await onDownloadProgress((d) => {
      set({ progress: Math.max(0, Math.min(100, Math.round(d.percent))) })
    })

    try {
      const res = await plugin.downloadApk({
        url: info.apkUrl,
        versionCode: String(info.versionCode),
      })
      set({ phase: 'ready', readyPath: res.path, progress: 100 })
    } finally {
      handle?.remove()
    }
  } catch (e) {
    set({ phase: 'error', error: errMsg(e) })
    scheduleRetry(info, attempt)
  }
}

function scheduleRetry(info: AppVersionInfo, attempt: number) {
  clearRetry()
  if (attempt >= RETRY_DELAYS.length) return
  retryTimer = setTimeout(() => {
    const st = useUpdateStore.getState()
    if (st.phase !== 'error' || st.info?.versionCode !== info.versionCode) return
    void startDownload(info, attempt + 1) // network wapas aaya to khud ho jayega
  }, RETRY_DELAYS[attempt])
}

// ── Install ──────────────────────────────────────────────────────────
export async function installEngine(
  opts: { openSettings?: boolean } = {}
): Promise<void> {
  const st = useUpdateStore.getState()
  if (st.phase === 'downloading') return // already chal raha hai
  if (!st.info) return

  const plugin = getUpdaterPlugin()
  if (!plugin) {
    // web / purana build — purana URL-open behaviour
    window.open(st.info.apkUrl, '_blank', 'noopener')
    return
  }

  // ready nahi hai → abhi se download shuru (popup progress dikhayega)
  if (!st.readyPath) {
    void startDownload(st.info)
    return
  }

  try {
    const res = await plugin.installApk({
      path: st.readyPath,
      openSettings: opts.openSettings !== false,
    })
    if (res?.needsPermission) {
      // Settings screen khul gayi (ya khulni chahiye thi). Wapas aate hi
      // auto-install attempt hoga (initAutoInstallRetry listener).
      autoInstallArmed = true
      set({
        phase: 'error',
        needsPermission: true,
        error:
          'Settings me "Allow from this source" ON karein — wapas aate hi install khud ho jayega',
      })
    }
  } catch (e) {
    set({ phase: 'error', error: errMsg(e) })
  }
}

export function openPermissionSettingsEngine(): void {
  const plugin = getUpdaterPlugin()
  if (plugin) {
    autoInstallArmed = true
    void plugin.openPermissionSettings().catch(() => {})
  }
}

export function dismissEngine(): void {
  const st = useUpdateStore.getState()
  clearRetry()
  set({
    phase: 'idle',
    error: null,
    dismissedCode: st.info ? st.info.versionCode : st.dismissedCode,
  })
}
