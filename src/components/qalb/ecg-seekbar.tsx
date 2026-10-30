'use client'

// Qalb — ECG Heartbeat Seekbar (v0.2.3)
// ─────────────────────────────────────────────────────────────────
// Music progress line ab asli ECG/EKG waveform jaisi dikhti hai
// (hospital monitor waali dhadakti line): flat → P bump → lamba R spike
// → S dip → T wave → flat … repeat. Traveled hissa bright emerald me,
// baaki halka sage track me. Playing me poori line dil ki tarah
// upar-niche bounce karti hai (qalb-heartbeat-slider).
//
// Interactive mode (full player): tap/drag se seek + keyboard arrows.
// Compact mode (mini-player): sirf dikhawa, pointer-events-none.

import { useCallback, useId, useRef, useState } from 'react'

// ── ECG waveform geometry (viewBox space) ─────────────────────────
const VW = 300 // viewBox width
const VH = 48 // viewBox height
const PULSES = 5 // itne heartbeats poori line me
const PW = VW / PULSES

// Ek pulse ke anchor points: [fraction-of-pulse, y-offset-from-baseline]
// curve points ke liye control offset bhi (quadratic bump)
type Anchor = { f: number; dy: number; cf?: number }

// Image reference jaisa classic ECG pulse:
// flat → P wave (chhota bump upar) → flat → Q dip → R spike (lamba upar)
// → S dip (neeche) → recover → flat → T wave → flat
const ANCHORS: Anchor[] = [
  { f: 0.0, dy: 0 },
  { f: 0.14, dy: 0 },
  { f: 0.24, dy: 0, cf: -6 }, // P wave bump (control @0.19)
  { f: 0.36, dy: 0 },
  { f: 0.4, dy: 4 }, // Q dip
  { f: 0.46, dy: -16 }, // R spike (lamba upar)
  { f: 0.51, dy: 9 }, // S dip (neeche)
  { f: 0.55, dy: 0 },
  { f: 0.63, dy: 0 },
  { f: 0.73, dy: 0, cf: -7 }, // T wave bump (control @0.68)
  { f: 1.0, dy: 0 },
]

const BASE = VH / 2

/** Poore viewBox ke liye ECG path string */
function buildEcgPath(): string {
  let d = `M 0 ${BASE}`
  for (let i = 0; i < PULSES; i++) {
    const x0 = i * PW
    for (let a = 1; a < ANCHORS.length; a++) {
      const prev = ANCHORS[a - 1]
      const cur = ANCHORS[a]
      const x = x0 + cur.f * PW
      const y = BASE + cur.dy
      if (cur.cf !== undefined) {
        // quadratic bump (P/T wave)
        const cx = x0 + ((prev.f + cur.f) / 2) * PW
        const cy = BASE + cur.cf
        d += ` Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`
      } else {
        d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`
      }
    }
  }
  return d
}

const ECG_PATH = buildEcgPath()

/** ECG line par given progress ratio ke exact (x, y) — playhead dot ke liye */
function ecgPointAt(ratio: number): { x: number; y: number } {
  const x = Math.max(0, Math.min(1, ratio)) * VW
  const pulseIdx = Math.min(PULSES - 1, Math.floor(x / PW))
  const xf = (x - pulseIdx * PW) / PW
  for (let a = 1; a < ANCHORS.length; a++) {
    const prev = ANCHORS[a - 1]
    const cur = ANCHORS[a]
    if (xf <= cur.f) {
      const x0 = pulseIdx * PW
      const t = (xf - prev.f) / (cur.f - prev.f || 1)
      if (cur.cf !== undefined) {
        // quadratic bezier y-approx (control mid-point par)
        const t2 = t * t
        const y0 = BASE + prev.dy
        const cy = BASE + cur.cf
        const y1 = BASE + cur.dy
        return {
          x,
          y: (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t2 * y1,
        }
      }
      return { x, y: BASE + prev.dy + (cur.dy - prev.dy) * t }
    }
  }
  return { x, y: BASE }
}

export function EcgSeekbar({
  position,
  duration,
  onSeek,
  isPlaying = false,
  interactive = true,
  compact = false,
}: {
  position: number
  duration: number
  onSeek?: (sec: number) => void
  isPlaying?: boolean
  interactive?: boolean
  compact?: boolean
}) {
  const clipId = useId().replace(/[^a-zA-Z0-9]/g, '')
  const wrapRef = useRef<HTMLDivElement>(null)
  const [dragRatio, setDragRatio] = useState<number | null>(null)

  const ratio =
    duration > 0 ? Math.min(Math.max(position / duration, 0), 1) : 0
  const shownRatio = dragRatio ?? ratio

  const ratioFromEvent = useCallback(
    (clientX: number): number | null => {
      const el = wrapRef.current
      if (!el || !interactive) return null
      const r = el.getBoundingClientRect()
      if (r.width <= 0) return null
      return Math.min(Math.max((clientX - r.left) / r.width, 0), 1)
    },
    [interactive]
  )

  const handleDown = (e: React.PointerEvent) => {
    if (!interactive) return
    e.stopPropagation()
    try {
      wrapRef.current?.setPointerCapture(e.pointerId)
    } catch {
      /* some browsers */
    }
    setDragRatio(ratioFromEvent(e.clientX))
  }

  const handleMove = (e: React.PointerEvent) => {
    if (!interactive || dragRatio === null) return
    e.stopPropagation()
    const r = ratioFromEvent(e.clientX)
    if (r !== null) setDragRatio(r)
  }

  const commit = (e: React.PointerEvent) => {
    if (!interactive || dragRatio === null) return
    e.stopPropagation()
    const r = ratioFromEvent(e.clientX) ?? dragRatio
    setDragRatio(null)
    if (onSeek && duration > 0) onSeek(r * duration)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (!interactive || duration <= 0) return
    const step = duration * 0.05
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      onSeek?.(Math.min(position + step, duration))
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      onSeek?.(Math.max(position - step, 0))
    }
  }

  const head = ecgPointAt(shownRatio)
  const clipW = shownRatio * VW

  return (
    <div
      ref={wrapRef}
      role={interactive ? 'slider' : undefined}
      aria-label={interactive ? 'Seek — ECG heartbeat line' : undefined}
      aria-valuemin={interactive ? 0 : undefined}
      aria-valuemax={interactive ? Math.round(duration) || undefined : undefined}
      aria-valuenow={interactive ? Math.round(position) : undefined}
      aria-valuetext={interactive ? `${Math.round(position)} / ${Math.round(duration)} sec` : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={handleKey}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={commit}
      onPointerCancel={() => setDragRatio(null)}
      className={[
        'relative w-full touch-none select-none outline-none',
        interactive ? 'cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-400/40' : 'pointer-events-none',
        isPlaying && !compact ? 'qalb-heartbeat-slider' : '',
      ].join(' ')}
      style={compact ? { height: 12 } : { height: 34 }}
    >
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full overflow-visible"
        aria-hidden
      >
        <defs>
          <clipPath id={`ecgclip-${clipId}`}>
            <rect x="0" y="-20" width={clipW} height={VH + 40} />
          </clipPath>
        </defs>

        {/* track — poori ECG line halki sage me */}
        <path
          d={ECG_PATH}
          fill="none"
          stroke="rgba(16, 185, 129, 0.18)"
          strokeWidth={compact ? 4 : 3}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* progress glow — traveled ECG line ke peeche halka roshni */}
        <g clipPath={`url(#ecgclip-${clipId})`}>
          <path
            d={ECG_PATH}
            fill="none"
            stroke="rgba(16, 185, 129, 0.35)"
            strokeWidth={compact ? 10 : 9}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {/* progress — bright emerald ECG line */}
          <path
            d={ECG_PATH}
            fill="none"
            stroke={compact ? '#34d399' : '#10b981'}
            strokeWidth={compact ? 4.5 : 3.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      </svg>

      {/* playhead dot — HTML layer (SVG stretch me circle ellipse ban jata,
          isliye dot ko HTML me position karte hain) — dil ki tarah dhadakta */}
      <span
        aria-hidden
        className="absolute"
        style={{
          left: `${shownRatio * 100}%`,
          top: `${(head.y / VH) * 100}%`,
          transform: 'translate(-50%, -50%)',
        }}
      >
        <span
          className={`block rounded-full ${
            isPlaying ? 'qalb-ph-dot' : 'opacity-70'
          }`}
          style={{
            width: compact ? 8 : 13,
            height: compact ? 8 : 13,
            background: '#a7f3d0',
            border: '2.5px solid rgba(16, 185, 129, 0.9)',
            boxShadow: compact
              ? '0 0 6px 1px rgba(16,185,129,0.55)'
              : '0 0 10px 2px rgba(16,185,129,0.75)',
          }}
        />
      </span>
    </div>
  )
}
