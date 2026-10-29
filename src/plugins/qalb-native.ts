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
