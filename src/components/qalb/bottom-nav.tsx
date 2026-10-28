'use client'

// Qalb — 5-Tab Bottom Navigation (Spotify/YouTube Music style)
// Tabs: Home, Player, Calendar, Store, Profile

import { Home, Disc3, CalendarDays, ShoppingBag, UserRound } from 'lucide-react'

export type QalbTab = 'home' | 'player' | 'calendar' | 'store' | 'profile'

const TABS: { key: QalbTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'player', label: 'Player', icon: Disc3 },
  { key: 'calendar', label: 'Calendar', icon: CalendarDays },
  { key: 'store', label: 'Store', icon: ShoppingBag },
  { key: 'profile', label: 'Profile', icon: UserRound },
]

export function BottomNav({
  active,
  onChange,
}: {
  active: QalbTab
  onChange: (tab: QalbTab) => void
}) {
  return (
    <nav
      aria-label="Main navigation"
      className="glass fixed inset-x-0 bottom-0 z-50 border-t border-emerald-400/10 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto flex max-w-md items-stretch justify-around px-1">
        {TABS.map(({ key, label, icon: Icon }) => {
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
                <span className="absolute top-0 h-[3px] w-9 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
              )}
              <Icon
                className={`h-[22px] w-[22px] transition-colors ${
                  isActive
                    ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.6)]'
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
