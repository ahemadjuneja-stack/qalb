'use client'

// Qalb — App Shell
// 4-tab navigation + global PlayerProvider (Mini-Player + Full Modal saare tabs pe visible)
// NOTE: Store tab temporarily removed (store-view.tsx file safe padi hai)
//
// PERF: saare views hamesha mount rehte hain (display:none se chhupe) —
// tab switch INSTANT hota hai (koi re-mount/refetch nahi) aur har tab apna
// scroll position yaad rakhta hai — bilkul native apps jaisa feel.

import { useRef, useState } from 'react'
import { PlayerProvider } from '@/components/qalb/player-provider'
import { BottomNav, type QalbTab } from '@/components/qalb/bottom-nav'
import { MiniPlayer } from '@/components/qalb/mini-player'
import { FullPlayerModal } from '@/components/qalb/full-player-modal'
import { HomeView } from '@/components/qalb/views/home-view'
import { PlayerView } from '@/components/qalb/views/player-view'
import { CalendarView } from '@/components/qalb/views/calendar-view'
import { ProfileView } from '@/components/qalb/views/profile-view'
import { UpdatePopup } from '@/components/qalb/update-popup'

export function QalbShell() {
  const [tab, setTabState] = useState<QalbTab>('home')
  const scrollPos = useRef<Partial<Record<QalbTab, number>>>({})

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

  return (
    <PlayerProvider>
      <div className="mx-auto min-h-screen max-w-md md:max-w-lg">
        <main className="pb-40">
          <div style={{ display: tab === 'home' ? 'block' : 'none' }}>
            <HomeView />
          </div>
          <div style={{ display: tab === 'player' ? 'block' : 'none' }}>
            <PlayerView />
          </div>
          <div style={{ display: tab === 'calendar' ? 'block' : 'none' }}>
            <CalendarView />
          </div>
          <div style={{ display: tab === 'profile' ? 'block' : 'none' }}>
            <ProfileView />
          </div>
        </main>
      </div>

      {/* global floating layers */}
      <UpdatePopup />
      <MiniPlayer />
      <FullPlayerModal />
      <BottomNav active={tab} onChange={setTab} />
    </PlayerProvider>
  )
}
