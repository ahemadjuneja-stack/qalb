'use client'

// Qalb — Global Header (v0.5.9)
// ─────────────────────────────────────────────────────────────────
// HAR screen par wahi header:
//   • LEFT: user ka OFFICIAL LOGO (traced animated SVG mark) — black
//     #1f1f1d tile (logo ka apna bg) me, dono themes me seamless.
//     MEDIUM size (h-11) + heart lub-dub animation zinda.
//   • RIGHT: is waqt kaunsa section khula hai — iPlayer / iTube /
//     Calendar / Profile (neutral chip — theme ke sath matching,
//     koi red border nahi)
//   • Neeche shimmering neutral divider (qalb-divider — B&W theme)
//
// HEADER me KOI RED NAHI — black & white theme matching (user request).
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
        <div className="relative shrink-0 overflow-hidden rounded-xl bg-[#1f1f1d] px-2 py-1.5 shadow-[0_4px_14px_-7px_rgba(0,0,0,0.6)] ring-1 ring-white/15">
          <QalbLogoMark className="h-11 w-auto" />
        </div>
        <span
          className="shrink-0 rounded-full border border-foreground/25 bg-foreground/10 px-3.5 py-1.5 text-[12.5px] font-extrabold tracking-wide text-foreground"
          aria-current="page"
        >
          {section}
        </span>
      </div>
      <div className="qalb-divider mt-2.5" aria-hidden="true" />
    </header>
  )
}
