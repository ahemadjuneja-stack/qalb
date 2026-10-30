'use client'

// Qalb — OTA Live Update (v0.3.0): WhatsApp-style silent web updates
//
// Chote-mote web-layer fixes APK install kiya bina apne aap lag jate hain:
//   1. update-engine Firestore appVersions/latest se webCode/webUrl uthata hai
//   2. webCode > is bundle ka code  &&  webMinNative <= installed APK
//      → UpdaterPlugin.downloadWebBundle: zip download → sha256 verify →
//        unzip → validate → state=ready (ye session nahi badalta)
//   3. AGLA app start naye bundle se chalta hai (Capacitor 8 built-in
//      live update — CapWebViewSettings/serverBasePath pref)
//   4. Boot safe hua (shell mount) → markBundleOk() — warna agle start par
//      QalbOta.bootstrap khud rollback kar deta hai (worst case: 1 kharab session)
//
// Native-level changes (Java/permission) phir bhi APK update mangte hain —
// wo update-engine ka existing popup flow karta hai.

import { create } from 'zustand'
import { APP_BUILD } from '@/lib/app-build'
import { isNativeCapacitor } from '@/lib/downloads'
import { getUpdaterPlugin } from '@/plugins/updater'
import type { AppVersionInfo } from '@/lib/types'

interface OtaStore {
  /** "Update taiyar hai" pill ka message (null = hidden) */
  toast: string | null
  /** abhi serve ho raha bundle ka code (0 = APK ka apna bundle) */
  appliedCode: number
  setToast: (msg: string | null) => void
}

export const useOtaStore = create<OtaStore>((set) => ({
  toast: null,
  appliedCode: 0,
  setToast: (toast) => set({ toast }),
}))

const BOOT_MARK_DELAY_MS = 1_500
const TOAST_HIDE_MS = 5_000

/**
 * Shell mount ke baad call hota hai. Naya bundle serve ho raha hai to OK
 * mark karo — warna agla start auto-rollback kar dega. SafeMode/kill-switch/
 * force-update screens par ye chalta hi nahi (QalbShellInner me hai) —
 * wahan bundle dobara download ho lega agli check par. Ye by design hai.
 */
export async function otaBoot(): Promise<void> {
  if (!isNativeCapacitor()) return
  const plugin = getUpdaterPlugin()
  if (!plugin?.getOtaState || !plugin.markBundleOk) return
  try {
    const st = await plugin.getOtaState()
    useOtaStore.setState({ appliedCode: Number(st?.code ?? 0) })
    if (st?.state === 'active') {
      setTimeout(() => {
        void plugin.markBundleOk?.().catch(() => {})
      }, BOOT_MARK_DELAY_MS)
    }
  } catch {
    /* purana build (v0.2.x) — OTA nahi hai, ignore */
  }
}

let bundleBusy = false

/**
 * Web-bundle check (update-engine se har successful Firestore check par).
 * Eligible ho to silent download shuru + true return (engine APK prompt
 * suppress karega). Download fail ho to chup — agli check par dobara.
 */
export function maybeOtaUpdate(info: AppVersionInfo, nativeCode: number): boolean {
  if (!isNativeCapacitor()) return false
  const plugin = getUpdaterPlugin()
  if (!plugin?.downloadWebBundle) return false
  if (!info.webCode || !info.webUrl) return false
  // is bundle ka code jitna chalta hai usse naya hona chahiye
  if (info.webCode <= APP_BUILD.versionCode) return false
  // bundle ko jo native chahiye, ye APK uske layak hai?
  if ((info.webMinNative ?? 0) > nativeCode) return false
  if (bundleBusy) return false

  bundleBusy = true
  void plugin
    .downloadWebBundle({
      url: info.webUrl,
      code: String(info.webCode),
      sha256: info.webSha256 ?? undefined,
    })
    .then(() => {
      useOtaStore
        .getState()
        .setToast('Update taiyar hai ✓ — agli baar app khulne par apne aap lagega')
      setTimeout(() => {
        useOtaStore.getState().setToast(null)
      }, TOAST_HIDE_MS)
    })
    .catch(() => {
      /* silent — agli check par retry */
    })
    .finally(() => {
      bundleBusy = false
    })
  return true
}
