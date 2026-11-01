'use client'

// Qalb — Global Header (v0.5.8)
// ─────────────────────────────────────────────────────────────────
// HAR screen par wahi header:
//   • LEFT: user ka OFFICIAL LOGO (traced animated SVG mark) — black
//     #1f1f1d tile (logo ka apna bg) me, dono themes me seamless.
//     Thoda bada (h-12 + wide letters) — aasani se dikhe, magar itna
//     nahi ki header ke design se alag lage.
//   • RIGHT: is waqt kaunsa section khula hai — iPlayer / iTube /
//     Calendar / Profile (gold chip, theme se matching)
//   • Neeche shimmering gold-red divider (qalb-divider)
//
// Shell me ek dafa mount hota hai — tab badalne par sirf section
// label badalta hai. Sticky glass — scroll par bhi upar chipakta hai.

import { QalbLogoMark } from '@/components/qalb/qalb-logo-mark'

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
        {/* OFFICIAL LOGO — animated mark, black tile, MEDIUM size (user request) */}
        <div className="relative shrink-0 overflow-hidden rounded-xl bg-[#1f1f1d] px-2 py-1.5 shadow-[0_4px_14px_-6px_rgba(187,0,0,0.5)] ring-1 ring-red-600/30">
          <QalbLogoMark className="h-11 w-auto" />
        </div>
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
