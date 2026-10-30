// Qalb — Native UpdaterPlugin bridge (Shivam Staff app style)
// Native side: android/app/src/main/java/com/qalb/app/UpdaterPlugin.java
// Web/purane builds par null return hota hai — engine fallback use karta hai.

import { isNativeCapacitor } from '@/lib/downloads'

export interface UpdateProgressData {
  percent: number
  downloaded: number
  total: number
}

/** OTA web-bundle state (QalbOta.java state machine) */
export interface OtaState {
  state: 'none' | 'ready' | 'active' | 'active_ok'
  code: number
  path: string | null
  versionCode: number
}

interface UpdaterPluginShape {
  getReadyApk(o: { versionCode: string }): Promise<{ path: string | null }>
  downloadApk(o: { url: string; versionCode: string }): Promise<{ path: string }>
  installApk(
    o: { path: string; openSettings?: boolean }
  ): Promise<{ ok: boolean; needsPermission?: boolean }>
  openPermissionSettings(): Promise<void>
  cleanStale(o: { versionCode: string }): Promise<unknown>
  /** v0.3.0+ — OTA web bundle (naye APK me hi milega, purane builds me undefined) */
  getNativeVersion?(): Promise<{ versionCode: number; versionName: string }>
  getOtaState?(): Promise<OtaState>
  markBundleOk?(): Promise<void>
  downloadWebBundle?(o: {
    url: string
    code: string
    sha256?: string
  }): Promise<{ path: string; code: string }>
  resetOta?(): Promise<void>
  addListener?(
    eventName: 'progress',
    cb: (data: UpdateProgressData) => void,
  ): Promise<{ remove: () => void }> | { remove: () => void }
}

export function getUpdaterPlugin(): UpdaterPluginShape | null {
  if (typeof window === 'undefined') return null
  if (!isNativeCapacitor()) return null
  const cap = (window as unknown as { Capacitor?: { Plugins?: { UpdaterPlugin?: UpdaterPluginShape } } })
    .Capacitor
  return cap?.Plugins?.UpdaterPlugin ?? null
}

export async function onDownloadProgress(
  cb: (data: UpdateProgressData) => void,
): Promise<{ remove: () => void } | null> {
  const plugin = getUpdaterPlugin()
  if (!plugin?.addListener) return null
  const handle = plugin.addListener('progress', cb)
  return (await handle) ?? handle ?? null
}
