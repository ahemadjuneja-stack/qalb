'use client'

// Qalb — Theme engine (Light / Dark)
// LIGHT = "Emerald Ivory" (warm ivory + gehra sabz + gold)
// DARK  = "Midnight Emerald" (sabz-kaali raat + chamakta emerald)
// localStorage: qalb_theme = 'light' | 'dark' (default: dark)
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
  void nativePlugin()?.setStatusBarStyle({ dark: theme === 'dark' }).catch(() => {})
}

export function toggleTheme(): QalbTheme {
  const next: QalbTheme = getTheme() === 'dark' ? 'light' : 'dark'
  applyTheme(next)
  return next
}
