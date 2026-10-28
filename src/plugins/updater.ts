// Qalb — Native UpdaterPlugin bridge (Shivam Staff app style)
// Native side: android/app/src/main/java/com/qalb/app/UpdaterPlugin.java
// Web/purane builds par null return hota hai — engine fallback use karta hai.

import { isNativeCapacitor } from '@/lib/downloads'

export interface UpdateProgressData {
  percent: number
  downloaded: number
  total: number
}

interface UpdaterPluginShape {
  getReadyApk(o: { versionCode: string }): Promise<{ path: string | null }>
  downloadApk(o: { url: string; versionCode: string }): Promise<{ path: string }>
  installApk(o: { path: string }): Promise<{ ok: boolean; needsPermission?: boolean }>
  openPermissionSettings(): Promise<void>
  cleanStale(o: { versionCode: string }): Promise<unknown>
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
