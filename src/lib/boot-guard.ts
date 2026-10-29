'use client'

// Qalb — Boot Guard (Layer 3: crash-loop recovery)
// ─────────────────────────────────────────────────────────────────
// Har boot pe timestamp localStorage me log hota hai. 12 sec stable
// chalne pe list clear = session OK. Agar 10 min me 3+ boots hain
// (matlab app baar-baar turant mar raha hai) → SAFE MODE.
//
// Safe mode me sirf tiny recovery screen render hoti hai — koi data
// fetch, koi player, koi heavy view. Wahan se: restart / reset /
// update check. Isse "uninstall karke dobara download" wala scenario
// khatam ho jata hai.
//
// Native (Android) side ka apna counter hai (CrashGuard.java) —
// wo hard crashes pakadta hai jahan JS chalta hi nahi.

import {
  nativeMarkSessionOk,
  nativeFactoryResetWebView,
} from '@/plugins/qalb-native'

const BOOTS_KEY = 'qalb_boots'
const STABLE_AFTER_MS = 12_000
const WINDOW_MS = 10 * 60_000
const THRESHOLD = 3

/**
 * Boot record karo + safe-mode chahiye ya nahi batao.
 * Sync hai — shell pehle render se pehle decision le sakta hai.
 */
export function recordBootAndGetSafeMode(): boolean {
  if (typeof window === 'undefined') return false

  // Native wipe flow / manual escape hatch: ?safemode=1
  try {
    if (new URLSearchParams(window.location.search).get('safemode') === '1') return true
  } catch {
    /* ignore */
  }

  try {
    const now = Date.now()
    let list: number[] = []
    try {
      const raw = JSON.parse(window.localStorage.getItem(BOOTS_KEY) ?? '[]')
      if (Array.isArray(raw)) list = raw.filter((n) => typeof n === 'number')
    } catch {
      /* corrupted list — fresh start */
    }
    list = list.filter((ts) => now - ts < WINDOW_MS)
    list.push(now)
    list = list.slice(-8)
    window.localStorage.setItem(BOOTS_KEY, JSON.stringify(list))
    return list.length >= THRESHOLD
  } catch {
    return false
  }
}

/**
 * 12 sec stable chalne ke baad — dono layers (JS + native) reset.
 * Iske baad crash hua to agli boot pe list me sirf 1 entry hogi.
 */
export function markSessionStable(): void {
  try {
    window.localStorage.removeItem(BOOTS_KEY)
  } catch {
    /* ignore */
  }
  void nativeMarkSessionOk()
}

/** SafeModeScreen "Restart" — counters clear karke fresh boot */
export function resetBootCounters(): void {
  try {
    window.localStorage.removeItem(BOOTS_KEY)
  } catch {
    /* ignore */
  }
  void nativeMarkSessionOk()
}

/**
 * Nuclear option: WebView storage (localStorage/cache/cookies) +
 * service worker caches clear karke reload. User ka "uninstall-reinstall"
 * yahan ek button me ho jata hai — app hi apna data theek karti hai.
 */
export async function fullResetAndReload(): Promise<void> {
  try {
    window.localStorage.clear()
  } catch {
    /* ignore */
  }
  try {
    window.sessionStorage?.clear?.()
  } catch {
    /* ignore */
  }
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } catch {
    /* ignore */
  }
  await nativeFactoryResetWebView()
  try {
    window.location.reload()
  } catch {
    /* last resort — native wipe ne already kaam kar diya hoga */
  }
}
