'use client'

// QALB BANNER ECG — banner ki dhadkan (v0.5.5)
// ─────────────────────────────────────────────────────────────────
// User ki demand: "Banner ecg wali line me animation kro"
// Banner image ke upar ek asli heartbeat (ECG) waveform chalti hai —
//   • base halki gold line (dono heartbeats, banner ke apne ECG se match)
//   • ek chamakta pulse dash jo left→right daudta hai (lub-dub rhythm)
// Sirf stroke-dashoffset/opacity animate hote hain — compositor-friendly,
// Android WebView me bhi 60fps. pointer-events-none — tap banner par hi jaye.
//
// Path: 400×64 viewBox, 2 complete heartbeat groups (P wave, QRS spike,
// T bump) — Qalb = dil, isliye asli ECG shape (flat → bump → SPIKE → bump).

const ECG_D =
  'M0 32 H70 q6 -7 12 0 h16 l5 5 l6 -26 l6 30 l5 -9 h18 q7 -10 14 0 H240 ' +
  'q6 -7 12 0 h16 l5 5 l6 -26 l6 30 l5 -9 h18 q7 -10 14 0 H400'

export function BannerEcg({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 64"
      preserveAspectRatio="none"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      aria-hidden="true"
    >
      {/* base dhadkan line — halki, banner ke apne gold ECG se baat karti hai */}
      <path
        d={ECG_D}
        fill="none"
        stroke="var(--qalb-ekg)"
        strokeWidth={1.4}
        strokeLinecap="round"
        opacity={0.32}
        vectorEffect="non-scaling-stroke"
      />
      {/* travelling pulse — dil ki dhadkan ki tarah daudta hai */}
      <path
        d={ECG_D}
        fill="none"
        stroke="var(--qalb-ekg-pulse)"
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeDasharray="30 500"
        className="qalb-ecg-pulse"
        vectorEffect="non-scaling-stroke"
        style={{ filter: 'drop-shadow(0 0 4px rgba(233,196,106,0.8))' }}
      />
    </svg>
  )
}
