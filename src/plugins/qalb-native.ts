'use client'

// Qalb — Native bridge wrapper (Android)
// QalbNative plugin: background playback foreground-service + status bar theming
// + MediaSession lock-screen controls (mediaAction events) .
// Web preview par koi asar nahi (sirf native platform pe calls jaati hain).

import { Capacitor, registerPlugin } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'

export type QalbMediaAction = 'play' | 'pause' | 'next' | 'prev' | 'stop' | `seek:${number}`

export interface QalbNativePluginInterface {
  startPlayback(options: {
    title: string
    artist: string
    thumbUrl?: string
  }): Promise<void>
  updatePlayback(options: {
    title: string
    artist: string
    thumbUrl?: string
    isPlaying?: boolean
    position?: number
    duration?: number
  }): Promise<void>
  stopPlayback(): Promise<void>
  setStatusBarStyle(options: { dark: boolean }): Promise<void>
  addListener(
    eventName: 'mediaAction',
    listenerFunc: (data: { action: QalbMediaAction }) => void
  ): Promise<PluginListenerHandle> & PluginListenerHandle
  addListener(
    eventName: 'backButton',
    listenerFunc: () => void
  ): Promise<PluginListenerHandle> & PluginListenerHandle
  backHandled(): Promise<void>
  minimizeApp(): Promise<void>
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
export async function nativeStartPlayback(title: string, artist: string, thumbUrl?: string | null) {
  if (!isNativeApp()) return
  try {
    await QalbNative.startPlayback({ title, artist, thumbUrl: thumbUrl ?? undefined })
  } catch {
    /* non-fatal */
  }
}

export interface NativePlaybackState {
  title: string
  artist: string
  thumbUrl?: string | null
  isPlaying: boolean
  position: number
  duration: number
}

/** Full playback state push — notification seekbar + play/pause icon + thumbnail update */
export async function nativeUpdatePlayback(state: NativePlaybackState) {
  if (!isNativeApp()) return
  try {
    await QalbNative.updatePlayback({
      title: state.title,
      artist: state.artist,
      thumbUrl: state.thumbUrl ?? undefined,
      isPlaying: state.isPlaying,
      position: state.position,
      duration: state.duration,
    })
  } catch {
    /* non-fatal */
  }
}

/** Stop — foreground service band (queue khatam / app close / notification close) */
export async function nativeStopPlayback() {
  if (!isNativeApp()) return
  try {
    await QalbNative.stopPlayback()
  } catch {
    /* non-fatal */
  }
}

/** Lock-screen / status-bar media buttons → JS player control */
export async function onNativeMediaAction(cb: (action: QalbMediaAction) => void) {
  if (!isNativeApp()) return () => {}
  try {
    const handle = await QalbNative.addListener('mediaAction', (data) => {
      if (data?.action) cb(data.action)
    })
    return () => {
      handle.remove().catch(() => {})
    }
  } catch {
    return () => {}
  }
}

// ── Back navigation (v0.2.2) ─────────────────────────────────────
// Android back gesture/button → JS view-stack decision.
// Native 500ms fallback hai — JS dead ho to app khud background jati hai.

/** Android back gesture/button → JS ko event do */
export async function onNativeBackButton(cb: () => void) {
  if (!isNativeApp()) return () => {}
  try {
    const handle = await QalbNative.addListener('backButton', () => cb())
    return () => {
      handle.remove().catch(() => {})
    }
  } catch {
    return () => {}
  }
}

/** JS ne back handle kar liya (modal/sheet/tab band hua) — native fallback cancel */
export async function nativeBackHandled() {
  if (!isNativeApp()) return
  try {
    await QalbNative.backHandled()
  } catch {
    /* non-fatal */
  }
}

/** Root screen par back → app background (home-button jaisa, exit nahi) */
export async function nativeMinimizeApp() {
  if (!isNativeApp()) return
  try {
    await QalbNative.minimizeApp()
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
