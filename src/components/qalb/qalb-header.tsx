'use client'

// Qalb — Global Header (v0.5.2)
// ─────────────────────────────────────────────────────────────────
// HAR screen par wahi header — user request:
//   • LEFT: Qalb brand logo (dil + ECG heartbeat line — animated,
//     pulse line ECG pe daudti rehti hai + sparkles twinkle)
//   • RIGHT: is waqt kaunsa section khula hai — iPlayer / iTube /
//     Calendar / Profile (gold chip, theme se matching)
//   • Neeche shimmering gold-red divider (qalb-divider)
//
// Shell me ek dafa mount hota hai — tab badalne par sirf section
// label badalta hai. Sticky glass — scroll par bhi upar chipakta hai.

import { QalbLogo } from '@/components/qalb/qalb-logo'

export type QalbSection =
  | 'iPlayer'
  | 'iTube'
  | 'Calendar'
  | 'Profile'

export function QalbHeader({ section }: { section: QalbSection }) {
  return (
    <header
      className="glass sticky top-0 z-40 px-4 pb-2.5 pt-[calc(env(safe-area-inset-top)+0.65rem)]"
      aria-label={`Qalb — ${section}`}
    >
      <div className="flex items-center justify-between gap-3">
        <QalbLogo className="h-10 w-auto shrink-0" />
        <span
          className="shrink-0 rounded-full border border-gold/35 bg-gold/10 px-3.5 py-1.5 text-[12.5px] font-extrabold tracking-wide text-gold shadow-[0_0_16px_-6px_var(--gold)]"
          aria-current="page"
        >
          {section}
        </span>
      </div>
      <div className="qalb-divider mt-2.5" aria-hidden="true" />
    </header>
  )
}
