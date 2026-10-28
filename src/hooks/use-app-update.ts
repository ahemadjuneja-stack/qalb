'use client'

// Qalb — Step 5: In-App Auto Updater Hook (engine-backed)
// Profile view ka purana API same rakha hai — ab engine (update-engine.ts)
// single source of truth hai: auto-check + auto-download + install sab isi se.

import { useCallback, useEffect } from 'react'
import {
  checkForUpdateEngine,
  installEngine,
  dismissEngine,
  useUpdateStore,
} from '@/lib/update-engine'
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
  const phase = useUpdateStore((s) => s.phase)
  const info = useUpdateStore((s) => s.info)
  const dismissedCode = useUpdateStore((s) => s.dismissedCode)

  useEffect(() => {
    if (autoCheck) void checkForUpdateEngine(false)
  }, [autoCheck])

  const checkForUpdate = useCallback(() => checkForUpdateEngine(true), [])
  const installUpdate = useCallback(() => installEngine(), [])
  const dismissUpdate = useCallback(() => dismissEngine(), [])

  return {
    checking: phase === 'checking',
    update: info,
    dismissedVersion: dismissedCode,
    hasUpdate: Boolean(info) && info!.versionCode !== dismissedCode,
    checkForUpdate,
    installUpdate,
    dismissUpdate,
  }
}
