'use client'

// Qalb — Step 5: In-App Auto Updater Hook
// Firestore (yahan /api/app-version) se latest version compare karta hai.
// Version mismatch par update prompt dikhta hai; native build me APK install intent.

import { useCallback, useEffect, useState } from 'react'
import { QALB } from '@/lib/qalb'
import type { AppVersionInfo } from '@/lib/types'

interface UseAppUpdateReturn {
  checking: boolean
  update: AppVersionInfo | null
  dismissedVersion: number | null
  hasUpdate: boolean
  checkForUpdate: () => Promise<AppVersionInfo | null>
  installUpdate: () => Promise<void>
  dismissUpdate: () => void
}

export function useAppUpdate(autoCheck = false): UseAppUpdateReturn {
  const [checking, setChecking] = useState(false)
  const [update, setUpdate] = useState<AppVersionInfo | null>(null)
  const [dismissedVersion, setDismissedVersion] = useState<number | null>(null)

  const checkForUpdate = useCallback(async (): Promise<AppVersionInfo | null> => {
    setChecking(true)
    try {
      const res = await fetch('/api/app-version', { cache: 'no-store' })
      if (!res.ok) return null
      const latest = (await res.json()) as AppVersionInfo
      if (latest.versionCode > QALB.currentVersionCode) {
        setUpdate(latest)
        return latest
      }
      setUpdate(null)
      return null
    } catch {
      return null
    } finally {
      setChecking(false)
    }
  }, [])

  const installUpdate = useCallback(async () => {
    if (!update) return
    try {
      const cap = (
        window as unknown as {
          Capacitor?: {
            isNativePlatform?: () => boolean
            Plugins?: {
              AppLauncher?: { openUrl?: (o: { url: string }) => Promise<void> }
            }
          }
        }
      ).Capacitor

      if (cap?.isNativePlatform?.() && cap.Plugins?.AppLauncher?.openUrl) {
        // Android me APK url package-installer intent trigger karega
        await cap.Plugins.AppLauncher.openUrl({ url: update.apkUrl })
      } else {
        window.open(update.apkUrl, '_blank', 'noopener')
      }
    } catch {
      window.open(update.apkUrl, '_blank', 'noopener')
    }
  }, [update])

  const dismissUpdate = useCallback(() => {
    if (update) setDismissedVersion(update.versionCode)
    setUpdate(null)
  }, [update])

  useEffect(() => {
    if (autoCheck) void checkForUpdate()
  }, [autoCheck, checkForUpdate])

  return {
    checking,
    update,
    dismissedVersion,
    hasUpdate: Boolean(update) && update?.versionCode !== dismissedVersion,
    checkForUpdate,
    installUpdate,
    dismissUpdate,
  }
}
