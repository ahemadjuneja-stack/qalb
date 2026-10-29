'use client'

// Qalb — Native bridge wrapper (Android)
// QalbNative plugin: background playback foreground-service + status bar theming.
// Web preview par koi asar nahi (sirf native platform pe calls jaati hain).

import { Capacitor, registerPlugin } from '@capacitor/core'

export interface QalbNativePluginInterface {
  startPlayback(options: { title: string; artist: string }): Promise<void>
  updatePlayback(options: { title: string; artist: string }): Promise<void>
  stopPlayback(): Promise<void>
  setStatusBarStyle(options: { dark: boolean }): Promise<void>
  // ── Crash Guard (boot health / recovery) ──
  markSessionOk(): Promise<void>
  getBootHealth(): Promise<{ bootCount: number; crashLoop: boolean }>
  getLastNativeCrash(): Promise<{ crash: string | null }>
  clearNativeCrash(): Promise<void>
  factoryResetWebView(): Promise<{ ok: boolean }>
}

const QalbNative = registerPlugin<QalbNativePluginInterface>('QalbNative')

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

/** Naat chalte hi foreground service start — screen lock pe bhi audio chalta rahega */
export async function nativeStartPlayback(title: string, artist: string) {
  if (!isNativeApp()) return
  try {
    await QalbNative.startPlayback({ title, artist })
  } catch {
    /* non-fatal */
  }
}

/** Track change — notification metadata update */
export async function nativeUpdatePlayback(title: string, artist: string) {
  if (!isNativeApp()) return
  try {
    await QalbNative.updatePlayback({ title, artist })
  } catch {
    /* non-fatal */
  }
}

/** Pause/stop — foreground service band */
export async function nativeStopPlayback() {
  if (!isNativeApp()) return
  try {
    await QalbNative.stopPlayback()
  } catch {
    /* non-fatal */
  }
}

/** Status bar icons: dark theme → light icons, light theme → dark icons */
export async function nativeSetStatusBar(darkTheme: boolean) {
  if (!isNativeApp()) return
  try {
    await QalbNative.setStatusBarStyle({ dark: darkTheme })
  } catch {
    /* non-fatal */
  }
}

// ── Crash Guard bridge (boot-guard.ts + shell use karte hain) ──────

/** 12 sec stable session ke baad — native boot counter reset */
export async function nativeMarkSessionOk() {
  if (!isNativeApp()) return
  try {
    await QalbNative.markSessionOk()
  } catch {
    /* non-fatal */
  }
}

/** Native crash-loop counter (hard crashes jahan JS chalta hi nahi) */
export async function nativeGetBootHealth(): Promise<{ bootCount: number; crashLoop: boolean } | null> {
  if (!isNativeApp()) return null
  try {
    return await QalbNative.getBootHealth()
  } catch {
    return null
  }
}

/** Pichli session ka native hard-crash stack (next boot pe report hota hai) */
export async function nativeGetLastCrash(): Promise<string | null> {
  if (!isNativeApp()) return null
  try {
    const res = await QalbNative.getLastNativeCrash()
    return res?.crash ?? null
  } catch {
    return null
  }
}

export async function nativeClearCrash() {
  if (!isNativeApp()) return
  try {
    await QalbNative.clearNativeCrash()
  } catch {
    /* non-fatal */
  }
}

/** WebView storage factory-reset — "uninstall-reinstall" ka in-app replacement */
export async function nativeFactoryResetWebView(): Promise<void> {
  if (!isNativeApp()) return
  try {
    await QalbNative.factoryResetWebView()
  } catch {
    /* non-fatal */
  }
}
