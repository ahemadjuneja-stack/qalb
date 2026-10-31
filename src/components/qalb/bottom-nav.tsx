'use client'

// Qalb — Bottom Navigation (v0.5.0)
// Tabs: iPlayer (Home), iTube (Reels ki jagah), Calendar, Profile
// ─────────────────────────────────────────────────────────────────
// v0.5.0 BADE BADLAV (user request):
//   • "Player" tab REMOVE — kisi kaam ka nahi tha (MiniPlayer +
//     FullPlayerModal global hain, playback tab ke bina bhi chalta hai)
//   • "Reels" → "iTube" — YouTube-style Islamic video hub
//   • "Home" → "iPlayer"
// NOTE: QalbTab type me 'player' abhi bhi hai — back-stack.ts compat
// (purana APK/purane refs toot na jayein). Nav me nahi dikhta.

import { Home, Youtube, CalendarDays, UserRound } from 'lucide-react'

export type QalbTab = 'home' | 'player' | 'reels' | 'calendar' | 'profile'

const TABS: { key: QalbTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'home', label: 'iPlayer', icon: Home },
  { key: 'reels', label: 'iTube', icon: Youtube },
  { key: 'calendar', label: 'Calendar', icon: CalendarDays },
  { key: 'profile', label: 'Profile', icon: UserRound },
]

export function BottomNav({
  active,
  onChange,
  hiddenTabs = [],
}: {
  active: QalbTab
  onChange: (tab: QalbTab) => void
  hiddenTabs?: QalbTab[] // remoteConfig se disable hue tabs
}) {
  return (
    <nav
      aria-label="Main navigation"
      className="glass fixed inset-x-0 bottom-0 z-50 border-t border-emerald-400/10 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto flex max-w-md items-stretch justify-around px-1">
        {TABS.filter(({ key }) => !hiddenTabs.includes(key)).map(({ key, label, icon: Icon }) => {
          const isActive = active === key
          return (
            <button
              key={key}
              type="button"
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onChange(key)}
              className="relative flex min-h-[3.5rem] flex-1 flex-col items-center justify-center gap-0.5 py-2 outline-none transition active:scale-95"
            >
              {isActive && (
                <span className="absolute top-0 h-[3px] w-9 rounded-full bg-emerald-400 shadow-[0_0_12px_var(--glow)]" />
              )}
              <Icon
                className={`h-[22px] w-[22px] transition-colors ${
                  isActive
                    ? 'text-emerald-400 drop-shadow-[0_0_8px_var(--glow)]'
                    : 'text-emerald-100/40'
                }`}
              />
              <span
                className={`text-[10px] font-medium tracking-wide transition-colors ${
                  isActive ? 'text-emerald-300' : 'text-emerald-100/40'
                }`}
              >
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
