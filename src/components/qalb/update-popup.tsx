'use client'

// Qalb — Global Auto-Update Popup (Shivam Staff app style)
// App khulne pe auto check → update mile to AUTO download (progress % banner)
// → ready hote hi "Install karein?" popup → ek tap install.
// Baad me = dismiss (profile ka manual Check phir se laa sakta hai).

import { useEffect } from 'react'
import { QALB } from '@/lib/qalb'
import {
  useUpdateStore,
  checkForUpdateEngine,
  installEngine,
  retryEngine,
  initAutoInstallRetry,
  dismissEngine,
  openPermissionSettingsEngine,
} from '@/lib/update-engine'

export function UpdatePopup() {
  const phase = useUpdateStore((s) => s.phase)
  const progress = useUpdateStore((s) => s.progress)
  const info = useUpdateStore((s) => s.info)
  const error = useUpdateStore((s) => s.error)
  const needsPermission = useUpdateStore((s) => s.needsPermission)
  const dismissedCode = useUpdateStore((s) => s.dismissedCode)

  // app open pe auto-check + background se wapas aane pe re-check
  // (engine me 3-min throttle hai — isliye har visibility pe bhejna sasta hai)
  // initAutoInstallRetry: permission settings se wapas aate hi auto-install
  useEffect(() => {
    void checkForUpdateEngine(false)
    initAutoInstallRetry()
    const onVis = () => {
      if (document.visibilityState === 'visible') void checkForUpdateEngine(false)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  if (!info || (dismissedCode !== null && dismissedCode >= info.versionCode)) return null

  const verName = info.versionName

  // ── 1. Download progress banner (top) ─────────────────────────────
  if (phase === 'downloading') {
    return (
      <div className="fixed inset-x-0 top-0 z-[70] px-3 pt-3">
        <div className="rounded-2xl border border-emerald-800/60 bg-[#12110d]/95 p-4 shadow-xl backdrop-blur">
          <div className="flex items-center justify-between text-xs text-emerald-300/90">
            <span className="font-semibold">Naya version v{verName} aa raha hai…</span>
            <span className="tabular-nums font-bold text-emerald-200">{progress}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-emerald-950">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${Math.max(4, progress)}%` }}
            />
          </div>
        </div>
      </div>
    )
  }

  // ── 2. Ready / Error popup (bottom, mini-player ke upar) ──────────
  if (phase === 'ready' || phase === 'error') {
    return (
      <div className="fixed inset-x-0 bottom-28 z-[70] px-4">
        <div className="rounded-2xl border border-emerald-700/60 bg-[#14120e]/97 p-4 shadow-2xl backdrop-blur">
          {phase === 'ready' ? (
            <>
              <p className="text-sm font-bold text-emerald-100">
                Naya version taiyar hai! 🎉
              </p>
              <p className="mt-0.5 text-xs text-emerald-300/80">
                Qalb v{verName} — Install dabao, bas.
              </p>
              {error && (
                <p className="mt-1.5 text-xs text-amber-300/90">{error}</p>
              )}
              {needsPermission && (
                <button
                  onClick={openPermissionSettingsEngine}
                  className="mt-2 w-full rounded-xl border border-amber-500/40 bg-amber-400/10 py-2 text-xs font-semibold text-amber-200 active:scale-95"
                >
                  Permission settings kholo (Allow from this source)
                </button>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => void installEngine()}
                  className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-emerald-950 active:scale-95"
                >
                  Abhi Install karein
                </button>
                <button
                  onClick={() => dismissEngine()}
                  className="rounded-xl border border-emerald-800/70 px-4 py-2.5 text-sm text-emerald-300 active:scale-95"
                >
                  Baad me
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-bold text-amber-200">Update download me dikkat</p>
              <p className="mt-0.5 text-xs text-emerald-300/80">{error ?? 'Network issue'}</p>
              {needsPermission && (
                <button
                  onClick={openPermissionSettingsEngine}
                  className="mt-2 w-full rounded-xl border border-emerald-700 py-2 text-xs font-semibold text-emerald-200 active:scale-95"
                >
                  Permission settings kholo (Install unknown apps)
                </button>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => void retryEngine()}
                  className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-emerald-950 active:scale-95"
                >
                  Dobara koshish
                </button>
                <button
                  onClick={() => dismissEngine()}
                  className="rounded-xl border border-emerald-800/70 px-4 py-2.5 text-sm text-emerald-300 active:scale-95"
                >
                  Baad me
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // idle / checking — popup nahi (profile ka card kaam karta hai)
  return null
}
