'use client'

// Qalb — Native bridge wrapper (Android)
// QalbNative plugin: background playback foreground-service + status bar theming
// + MediaSession lock-screen controls (mediaAction events) .
// Web preview par koi asar nahi (sirf native platform pe calls jaati hain).

import { Capacitor, registerPlugin } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'

export type QalbMediaAction = 'play' | 'pause' | 'next' | 'prev' | 'stop' | `seek:${number}`

export interface ReelDownloadProgress {
  id: string
  filename: string
  percent: number
}

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
  // ── Reel offline download (v0.2.6) ──
  downloadVideo(options: {
    url: string
    filename: string
    id: string
  }): Promise<{ ok: boolean; uri?: string; gallery?: boolean }>
  cancelDownload(options: { id: string }): Promise<void>
  addListener(
    eventName: 'downloadProgress',
    listenerFunc: (data: ReelDownloadProgress) => void
  ): Promise<PluginListenerHandle> & PluginListenerHandle
  // ── App background media pause (v0.3.3) ──
  setBgPauseMedia(options: { pause: boolean }): Promise<void>
  // ── Google OAuth deep-link (v0.4.4) ──
  openExternal(options: { url: string }): Promise<void>
  consumeOauthRedirect(): Promise<{ url: string | null }>
  startOauthServer(options?: { port?: number }): Promise<{ port: number }>
  stopOauthServer(): Promise<void>
  // ── Google in-app sheet (v0.4.5) — Chrome nahi khulta ──
  googleIdToken(options: { serverClientId: string }): Promise<{
    idToken: string
    email?: string
  }>
  googleSignOut(): Promise<void>
  // ── Native HTTP (v0.4.5) — WebView DNS/CORS bypass fallback ──
  httpPostForm(options: { url: string; body: string }): Promise<{
    status: number
    body: string
  }>
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

// ── Reel offline download (v0.2.6) ────────────────────────────────
// Progressive mp4 ko native HTTP se download karke Gallery
// (Movies/Qalb) me save — CORS WebView me block karta hai, native
// me nahi. Progress events ke sath.

/** Ek reel download (promise complete hone par resolve) */
export async function nativeDownloadReel(
  url: string,
  filename: string,
  id: string,
  onProgress?: (percent: number) => void
): Promise<{ ok: boolean; uri?: string; gallery?: boolean }> {
  if (!isNativeApp()) throw new Error('download sirf app (APK) me available hai')
  // progress listener pehle register (race — pehla event miss na ho)
  let handle: PluginListenerHandle | null = null
  try {
    handle = await QalbNative.addListener('downloadProgress', (d) => {
      if (d?.id === id && typeof d.percent === 'number') onProgress?.(d.percent)
    })
  } catch {
    /* progress optional */
  }
  try {
    return await QalbNative.downloadVideo({ url, filename, id })
  } finally {
    try {
      await handle?.remove()
    } catch {
      /* ignore */
    }
  }
}

/** Chalta hua reel download cancel karo */
export async function nativeCancelReelDownload(id: string) {
  if (!isNativeApp()) return
  try {
    await QalbNative.cancelDownload({ id })
  } catch {
    /* non-fatal */
  }
}

// ── App background media pause (v0.3.3) ────────────────────────────
// Reels tab dikh raha ho + naat CHUP ho to flag ON — app minimize hote
// hi MainActivity WebView ka media NATIVELY pause kar deta hai (reel
// sound band). Naat chal rahi ho to flag OFF — naat background me
// chalti rahegi. Purane APK par method nahi milega — silent ignore.
export async function nativeSetBgPauseMedia(pause: boolean) {
  if (!isNativeApp()) return
  try {
    await QalbNative.setBgPauseMedia({ pause })
  } catch {
    /* purana APK — method nahi hai */
  }
}

// ── Google OAuth deep-link (v0.4.4) ────────────────────────────────
// Google login ab system Chrome me hota hai (WebView GIS popup block
// hota hai + console custom scheme accept nahi karta). Loopback flow:
// app 127.0.0.1:PORT par chhota HTTP server chalati hai — Chrome me
// consent ke baad Google isi par redirect karta hai, server query ko
// qalb:// fake deep-link me wrap karke JS tak pahunchata hai (event +
// pending static, dono channels — cold-start-proof).

/** URL system browser (Chrome) me kholo — khula? true/false */
export async function nativeOpenExternal(url: string): Promise<boolean> {
  if (!isNativeApp()) return false
  try {
    await QalbNative.openExternal({ url })
    return true
  } catch {
    return false
  }
}

/** Pending OAuth redirect URL (ek baar — auto clear). Nahi? null */
export async function nativeConsumeOauthRedirect(): Promise<string | null> {
  if (!isNativeApp()) return null
  try {
    const r = await QalbNative.consumeOauthRedirect()
    return r?.url ?? null
  } catch {
    return null
  }
}

/**
 * Loopback OAuth server start — bind hua port (native), ya null
 * (web dev / bind fail). Server sirf 127.0.0.1 par sunta hai.
 */
export async function nativeStartOauthServer(preferredPort = 7849): Promise<number | null> {
  if (!isNativeApp()) return null
  try {
    const r = await QalbNative.startOauthServer({ port: preferredPort })
    return typeof r?.port === 'number' ? r.port : null
  } catch {
    return null
  }
}

/** Loopback OAuth server band (flow ke baad/timeout par) */
export async function nativeStopOauthServer(): Promise<void> {
  if (!isNativeApp()) return
  try {
    await QalbNative.stopOauthServer()
  } catch {
    /* ignore */
  }
}

/**
 * Google ka ACCOUNT-PICKER SHEET app ke andar (v0.4.5) — Chrome bilkul
 * nahi khulta. Result:
 *   { idToken, email }  → sheet se token mil gaya
 *   { cancelled: true } → user ne sheet band kar di / back maara
 *   null                → sheet khula hi nahi (play services missing,
 *                         Android client/SHA-1 missing, sheet exception)
 */
export type NativeGoogleResult =
  | { idToken: string; email: string | null }
  | { cancelled: true }
  | null

export async function nativeGoogleIdToken(
  serverClientId: string
): Promise<NativeGoogleResult> {
  if (!isNativeApp()) return null
  try {
    const r = await QalbNative.googleIdToken({ serverClientId })
    if (r?.idToken) return { idToken: r.idToken, email: r.email ?? null }
    return null
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? '')
    // user ne sheet khud band ki (sheet 600ms+ chali) — cancel hai, fail nahi.
    // Baaki sab (api-10/api-13/sheet-fail-fast/play-services fail) → null,
    // auth.ts Chrome loopback fallback chalayega — login kabhi atka nahi.
    if (msg.includes('cancelled')) {
      return { cancelled: true }
    }
    return null
  }
}

/** Device ka Google session saaf (logout ke saath chalao) */
export async function nativeGoogleSignOut(): Promise<void> {
  if (!isNativeApp()) return
  try {
    await QalbNative.googleSignOut()
  } catch {
    /* ignore */
  }
}

/**
 * Native HTTP POST (form) — WebView ke DNS/CORS maslon ka bypass
 * (v0.4.5). Result null = method nahi mili / fail (purana APK ya web).
 */
export async function nativeHttpPostForm(
  url: string,
  body: string
): Promise<{ status: number; body: string } | null> {
  if (!isNativeApp()) return null
  try {
    const r = await QalbNative.httpPostForm({ url, body })
    if (typeof r?.status === 'number' && typeof r?.body === 'string') return r
    return null
  } catch {
    return null
  }
}
