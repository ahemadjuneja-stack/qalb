'use client'

// Qalb — Digital Tasbih Counter (Calendar tab ke andar "Tasbih" tab)
// - Dhikr chips: SubhanAllah / Alhamdulillah / Allahu Akbar / Kalima / Astaghfirullah
// - Target: 33 / 99 / 100 / Free — target complete par round++
// - v0.3.1: vibration hata di (user request) — ab sirf visual pulse
// - Count/round/dhikr/target localStorage me save — app band karke bhi yaad rahe

import { useEffect, useRef, useState } from 'react'
import { RotateCcw, Infinity as InfinityIcon } from 'lucide-react'

const TASBIH_KEY = 'qalb_tasbih_v1'

const DHIKRS = [
  { ar: 'سُبْحَانَ اللّٰهِ', en: 'SubhanAllah', mean: 'Allah paak hai' },
  { ar: 'اَلْحَمْدُ لِلّٰهِ', en: 'Alhamdulillah', mean: 'Saare tareef Allah ke liye' },
  { ar: 'اَللّٰهُ أَكْبَرُ', en: 'Allahu Akbar', mean: 'Allah sabse bada hai' },
  { ar: 'لَا اِلٰهَ اِلَّا اللّٰهُ', en: 'La ilaha illallah', mean: 'Allah ke siwa koi maabood nahi' },
  { ar: 'أَسْتَغْفِرُ اللّٰهَ', en: 'Astaghfirullah', mean: 'Allah se maafi maangta hoon' },
] as const

const TARGETS = [33, 99, 100] as const

interface TasbihState {
  dhikrIdx: number
  count: number
  targetIdx: number // 0..2 = 33/99/100, 3 = Free
  rounds: number
}

export function TasbihCounter() {
  const [st, setSt] = useState<TasbihState>({ dhikrIdx: 0, count: 0, targetIdx: 0, rounds: 0 })
  const [pulse, setPulse] = useState(false)
  const hydrated = useRef(false)

  // saved state load
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(TASBIH_KEY)
        if (raw) {
          const s = JSON.parse(raw) as Partial<TasbihState>
          setSt({
            dhikrIdx: Math.min(Math.max(0, s.dhikrIdx ?? 0), DHIKRS.length - 1),
            count: Math.max(0, s.count ?? 0),
            targetIdx: Math.min(Math.max(0, s.targetIdx ?? 0), 3),
            rounds: Math.max(0, s.rounds ?? 0),
          })
        }
      } catch {
        /* fresh start */
      }
      hydrated.current = true
    }, 0)
    return () => clearTimeout(t)
  }, [])

  // state change → persist
  useEffect(() => {
    if (!hydrated.current) return
    try {
      window.localStorage.setItem(TASBIH_KEY, JSON.stringify(st))
    } catch {
      /* ignore */
    }
  }, [st])

  const target = st.targetIdx < 3 ? TARGETS[st.targetIdx] : null
  const dhikr = DHIKRS[st.dhikrIdx]
  const progress = target ? Math.min(1, st.count / target) : 0

  const tap = () => {
    setPulse(true)
    setTimeout(() => setPulse(false), 140)
    setSt((s) => {
      if (target !== null && s.count + 1 >= target) {
        // round complete — auto reset, round count++
        return { ...s, count: 0, rounds: s.rounds + 1 }
      }
      return { ...s, count: s.count + 1 }
    })
  }

  return (
    <div className="space-y-4">
      {/* dhikr selector */}
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {DHIKRS.map((d, i) => (
          <button
            key={d.en}
            type="button"
            onClick={() => setSt((s) => ({ ...s, dhikrIdx: i }))}
            className={`shrink-0 rounded-full px-3.5 py-2 text-[12px] font-bold transition ${
              i === st.dhikrIdx
                ? 'emerald-gradient text-emerald-950 shadow-[0_6px_18px_-6px_var(--glow)]'
                : 'card-surface text-emerald-200/60'
            }`}
            aria-pressed={i === st.dhikrIdx}
          >
            {d.en}
          </button>
        ))}
      </div>

      {/* current dhikr */}
      <div className="card-surface rounded-3xl px-5 py-4 text-center">
        <p dir="rtl" className="text-[26px] font-bold leading-snug text-emerald-50">
          {dhikr.ar}
        </p>
        <p className="mt-1 text-[11px] font-semibold text-emerald-200/50">
          {dhikr.en} — {dhikr.mean}
        </p>
      </div>

      {/* tap circle */}
      <div className="flex flex-col items-center">
        <button
          type="button"
          onPointerDown={tap}
          className={`emerald-gradient relative flex h-44 w-44 select-none flex-col items-center justify-center rounded-full shadow-[0_20px_50px_-14px_var(--glow)] transition-transform duration-100 active:scale-[0.96] ${
            pulse ? 'scale-[0.97]' : ''
          }`}
          aria-label="Tasbih ginein — tap karein"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-2 rounded-full border-2 border-dashed border-emerald-950/25"
          />
          <span className="font-mono text-6xl font-extrabold tabular-nums text-emerald-950">
            {st.count}
          </span>
          <span className="mt-1 text-[11px] font-bold uppercase tracking-widest text-emerald-950/60">
            {target ? `Target ${target}` : 'Free Count'}
          </span>
        </button>

        {/* progress bar (target mode) */}
        {target ? (
          <div className="mt-4 w-full max-w-[260px]">
            <div className="h-2 overflow-hidden rounded-full bg-emerald-400/10">
              <div
                className="emerald-gradient h-full rounded-full transition-[width] duration-200"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <p className="mt-1.5 text-center text-[10.5px] font-semibold text-emerald-200/50">
              {target - st.count} baaki • {st.rounds} round{st.rounds === 1 ? '' : 's'} mukammal
            </p>
          </div>
        ) : (
          <p className="mt-4 text-[10.5px] font-semibold text-emerald-200/50">
            Total: {st.count} • {st.rounds} round mukammal
          </p>
        )}
      </div>

      {/* target chips + reset */}
      <div className="flex items-center justify-center gap-2">
        {[...TARGETS.map((v, i) => ({ v, i })), { v: null as number | null, i: 3 }].map(({ v, i }) => (
          <button
            key={i}
            type="button"
            onClick={() => setSt((s) => ({ ...s, targetIdx: i }))}
            className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
              st.targetIdx === i
                ? 'bg-gold/15 text-gold ring-1 ring-gold/40'
                : 'card-surface text-emerald-200/50'
            }`}
            aria-pressed={st.targetIdx === i}
          >
            {v ? (
              `${v}`
            ) : (
              <>
                <InfinityIcon className="h-3.5 w-3.5" /> Free
              </>
            )}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setSt((s) => ({ ...s, count: 0 }))
          }}
          className="ml-1 flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1.5 text-[11px] font-bold text-rose-400 ring-1 ring-rose-500/25 transition hover:bg-rose-500/20"
          aria-label="Count reset karein"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </button>
      </div>

      <p className="flex items-center justify-center gap-1.5 text-center text-[10px] text-emerald-200/30">
        Har tap par count save hota hai — app band karke bhi yaad rahega
      </p>
    </div>
  )
}
