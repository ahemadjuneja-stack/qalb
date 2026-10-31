'use client'

// Qalb — Theme engine (Light / Dark)
// LIGHT = "Ivory Maroon" (warm ivory + gehra maroon + gold)
// DARK  = "Midnight Maroon" (gehra maroon raat + chamakta gold) — DEFAULT
// v0.5.2: poora palette brand images se — deep red + gold + silver-white.
// localStorage: qalb_theme = 'light' | 'dark' (default: dark — brand look)
// Native side par status-bar icons bhi sync hote hain (QalbNative plugin).

type QalbNativeInterface = {
  setStatusBarStyle: (opts: { dark: boolean }) => Promise<void>
}

function nativePlugin(): QalbNativeInterface | null {
  try {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    if (!cap?.isNativePlatform?.()) return null
    return (
      window as unknown as {
        QalbNative?: QalbNativeInterface
      }
    ).QalbNative ?? null
  } catch {
    return null
  }
}

export type QalbTheme = 'light' | 'dark'

export const THEME_KEY = 'qalb_theme'

export function getTheme(): QalbTheme {
  if (typeof window === 'undefined') return 'dark'
  try {
    // default DARK (brand) — sirf 'light' save hone par light
    return window.localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function applyTheme(theme: QalbTheme) {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }
  try {
    window.localStorage.setItem(THEME_KEY, theme)
  } catch {
    /* private mode */
  }
  // native status bar icons sync (light theme → dark icons)
  void nativePlugin()?.setStatusBarStyle({ dark: theme !== 'light' }).catch(() => {})
}

export function toggleTheme(): QalbTheme {
  const next: QalbTheme = getTheme() === 'light' ? 'dark' : 'light'
  applyTheme(next)
  return next
}
