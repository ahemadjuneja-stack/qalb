'use client'

// Qalb — App Shell + Safety Net
// 4-tab navigation + global PlayerProvider (Mini-Player + Full Modal saare tabs pe visible)
// NOTE: Store tab temporarily removed (store-view.tsx file safe padi hai)
//
// PERF: saare views hamesha mount rehte hain (display:none se chhupe) —
// tab switch INSTANT hota hai (koi re-mount/refetch nahi) aur har tab apna
// scroll position yaad rakhta hai — bilkul native apps jaisa feel.
//
// SAFETY NET (Play Store ke bina self-healing):
//   L1 native CrashGuard     → hard crash loop, WebView auto-wipe
//   L2 crash-report.ts       → crashes Firestore crashLogs me
//   L3 boot-guard.ts         → JS crash-loop → Safe Mode screen
//   L4 QalbErrorBoundary     → render crash → recovery card
//   L5 remote-config.ts      → kill switch / force update / feature off

import { useEffect, useRef, useState } from 'react'
import { PlayerProvider } from '@/components/qalb/player-provider'
import { BottomNav, type QalbTab } from '@/components/qalb/bottom-nav'
import { MiniPlayer } from '@/components/qalb/mini-player'
import { FullPlayerModal } from '@/components/qalb/full-player-modal'
import { HomeView } from '@/components/qalb/views/home-view'
import { PlayerView } from '@/components/qalb/views/player-view'
import { CalendarView } from '@/components/qalb/views/calendar-view'
import { ProfileView } from '@/components/qalb/views/profile-view'
import { UpdatePopup } from '@/components/qalb/update-popup'
import { AddToPlaylistSheet } from '@/components/qalb/add-to-playlist-sheet'
import { LoginSheet } from '@/components/qalb/login-sheet'
import { useQalbAuth } from '@/lib/auth'
import { QalbErrorBoundary } from '@/components/qalb/error-boundary'
import {
  SafeModeScreen,
  ForceUpdateScreen,
  MaintenanceScreen,
  RemoteNoticeBanner,
  BootSplash,
} from '@/components/qalb/recovery-screens'
import { installCrashReporter, reportCrash } from '@/lib/crash-report'
import {
  recordBootAndGetSafeMode,
  markSessionStable,
} from '@/lib/boot-guard'
import { useRemoteConfig, needsForceUpdate } from '@/lib/remote-config'
import {
  nativeGetBootHealth,
  nativeGetLastCrash,
  nativeClearCrash,
  onNativeBackButton,
  nativeBackHandled,
} from '@/plugins/qalb-native'
import { usePlayerStore } from '@/lib/player-store'
import { usePlaylistPicker } from '@/lib/user-playlists'
import { APP_BUILD } from '@/lib/app-build'

// Tab-level feature flags (remoteConfig.disabledFeatures se aate hain)
const GATABLE_TABS: QalbTab[] = ['player', 'calendar']

export function QalbShellCore() {
  // SSR + pehli client frame: inert splash (localStorage/bridge abhi nahi padhte)
  const [booted, setBooted] = useState(false)
  // L3: boot record — crash loop ho to seedha Safe Mode
  const [safeMode, setSafeMode] = useState(false)

  // L2: global crash handlers (ek dafa) + boot decision
  useEffect(() => {
    installCrashReporter()
    setSafeMode(recordBootAndGetSafeMode())
    setBooted(true)
    // auth session restore (localStorage) — login state sab views me ready
    useQalbAuth.getState().init()
  }, [])

  // L1: native crash-loop upgrade + pichli hard-crash ka report
  useEffect(() => {
    void (async () => {
      if (!safeMode) {
        const health = await nativeGetBootHealth()
        if (health?.crashLoop) setSafeMode(true)
      }
      const crash = await nativeGetLastCrash()
      if (crash) {
        void reportCrash('native', 'Native hard crash (pichli session)', crash, {
          versionCode: APP_BUILD.versionCode,
        })
        await nativeClearCrash()
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 12 sec stable session → dono counters reset (L1 + L3)
  useEffect(() => {
    const t = setTimeout(() => markSessionStable(), 12_000)
    return () => clearTimeout(t)
  }, [])

  // L5: remote config (kill switch / force update / features)
  const cfg = useRemoteConfig((s) => s.config)
  const refreshConfig = useRemoteConfig((s) => s.refresh)
  useEffect(() => {
    void refreshConfig()
  }, [refreshConfig])

  if (!booted) return <BootSplash />

  if (safeMode) return <SafeModeScreen />

  if (cfg.killSwitch) {
    return (
      <MaintenanceScreen
        message={cfg.maintenanceMessage}
        onRetry={() => void refreshConfig()}
      />
    )
  }

  if (needsForceUpdate(cfg)) {
    return <ForceUpdateScreen message={cfg.notice} />
  }

  return <QalbShellInner gatableOff={cfg.disabledFeatures} notice={cfg.noticeActive ? cfg.notice : null} />
}

function QalbShellInner({
  gatableOff,
  notice,
}: {
  gatableOff: string[]
  notice: string | null
}) {
  const [tab, setTabState] = useState<QalbTab>('home')
  const scrollPos = useRef<Partial<Record<QalbTab, number>>>({})

  // Back navigation (v0.2.2) — latest tab value ref me (listener re-install na ho)
  const tabRef = useRef<QalbTab>('home')
  const backChainRef = useRef<(next: QalbTab) => void>(() => {})

  const hiddenTabs = GATABLE_TABS.filter((t) => gatableOff.includes(t))
  const showPlayer = !hiddenTabs.includes('player')
  const showCalendar = !hiddenTabs.includes('calendar')

  const setTab = (next: QalbTab) => {
    if (next === tab) return
    scrollPos.current[tab] = window.scrollY
    setTabState(next)
    // DOM paint ke baad target tab ka scroll restore (instant, native jaisa)
    requestAnimationFrame(() => {
      window.scrollTo({
        top: scrollPos.current[next] ?? 0,
        behavior: 'instant' as ScrollBehavior,
      })
    })
  }

  // Back gesture chain (har screen par kaam karta hai):
  //   full player modal → playlist sheet → login sheet → tab → home (yahin ruko)
  // v0.2.4: back se app KABHI minimize nahi hoti — kahi se bhi back dabao,
  // hamesha app ke andar home screen tak le aata hai (user request).
  useEffect(() => {
    tabRef.current = tab
    backChainRef.current = setTab
  }, [tab])

  useEffect(() => {
    let unlisten: (() => void) | null = null
    let alive = true
    void onNativeBackButton(() => {
      try {
        // 1. Full player modal khula? → band karo
        const p = usePlayerStore.getState()
        if (p.fullOpen) {
          p.closeFull()
          void nativeBackHandled()
          return
        }
        // 2. Add-to-playlist sheet khuli? → band karo
        const picker = usePlaylistPicker.getState()
        if (picker.open) {
          picker.closePicker()
          void nativeBackHandled()
          return
        }
        // 3. Login sheet khuli? → band karo
        const auth = useQalbAuth.getState()
        if (auth.loginOpen) {
          auth.closeLogin()
          void nativeBackHandled()
          return
        }
        // 4. Home se doosre tab par? → home par wapas
        if (tabRef.current !== 'home') {
          backChainRef.current('home')
          void nativeBackHandled()
          return
        }
        // 5. Home tab — back par yahin raho (app minimize NAHI hogi)
        void nativeBackHandled()
      } catch {
        // chain me koi exception? app ko waise hi chhodo — minimize nahi
        void nativeBackHandled()
      }
    }).then((fn) => {
      if (!alive) fn()
      else unlisten = fn
    })
    return () => {
      alive = false
      unlisten?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Remote se tab disable hua jo active tha → home par wapas
  useEffect(() => {
    if (tab !== 'home' && hiddenTabs.includes(tab)) setTabState('home')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenTabs.join(',')])

  return (
    <PlayerProvider>
      {notice && <RemoteNoticeBanner notice={notice} />}
      <div className="mx-auto min-h-screen max-w-md md:max-w-lg">
        <main className="pb-40">
          <div style={{ display: tab === 'home' ? 'block' : 'none' }}>
            <HomeView />
          </div>
          {showPlayer && (
            <div style={{ display: tab === 'player' ? 'block' : 'none' }}>
              <PlayerView />
            </div>
          )}
          {showCalendar && (
            <div style={{ display: tab === 'calendar' ? 'block' : 'none' }}>
              <CalendarView />
            </div>
          )}
          <div style={{ display: tab === 'profile' ? 'block' : 'none' }}>
            <ProfileView />
          </div>
        </main>
      </div>

      {/* global floating layers */}
      <UpdatePopup />
      <MiniPlayer />
      <FullPlayerModal />
      <AddToPlaylistSheet />
      <LoginSheet />
      <BottomNav active={tab} onChange={setTab} hiddenTabs={hiddenTabs} />
    </PlayerProvider>
  )
}

// L4: boundary sabse bahar — andar kahin bhi render crash ho to pakde
export function QalbShell() {
  return (
    <QalbErrorBoundary>
      <QalbShellCore />
    </QalbErrorBoundary>
  )
}
