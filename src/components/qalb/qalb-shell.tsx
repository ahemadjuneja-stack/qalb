'use client'

// Qalb — App Shell
// 4-tab navigation + global PlayerProvider (Mini-Player + Full Modal saare tabs pe visible)
// NOTE: Store tab temporarily removed (store-view.tsx file safe padi hai)

import { useEffect, useState } from 'react'
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
  const [tab, setTab] = useState<QalbTab>('home')

  // tab switch par upar scroll
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [tab])

  return (
    <PlayerProvider>
      <div className="mx-auto min-h-screen max-w-md md:max-w-lg">
        <main className="pb-40">
          {tab === 'home' && <HomeView />}
          {tab === 'player' && <PlayerView />}
          {tab === 'calendar' && <CalendarView />}
          {tab === 'profile' && <ProfileView />}
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
