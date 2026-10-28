'use client'

// Qalb — Step 5: In-App Auto Updater Hook
// Version check ki 2 raahein:
//   • Native APK → Firestore REST DIRECT (appVersions/latest) — server ki zaroorat nahi
//   • Web preview → /api/app-version (Prisma mirror), fallback Firestore REST
// Version mismatch par update prompt dikhta hai; native me APK install intent.

import { useCallback, useEffect, useState } from 'react'
import { QALB } from '@/lib/qalb'
import { fetchAppVersionFromFirestore } from '@/lib/remote-data'
import { isNativeCapacitor } from '@/lib/downloads'
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
      let latest: AppVersionInfo | null = null

      if (isNativeCapacitor()) {
        // APK → Firestore REST direct (offline of hosted backend bhi update milta hai)
        latest = await fetchAppVersionFromFirestore()
      }

      if (!latest) {
        // web preview / hosted API path
        const res = await fetch(`${QALB.apiBase}/api/app-version`, { cache: 'no-store' })
        if (res.ok) latest = (await res.json()) as AppVersionInfo
      }

      if (!latest) {
        // last resort — Firestore (agar API deploy nahi hai magar Firebase hai)
        latest = await fetchAppVersionFromFirestore()
      }

      if (latest && latest.versionCode > QALB.currentVersionCode) {
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
