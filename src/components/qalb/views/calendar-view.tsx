'use client'

// Qalb — Calendar Tab: PrayerTimes-style dashboard
// ── HERO: circular tick-countdown (agli namaz) + Hijri/Gregorian dates +
//    Qibla compass (timer ke niche — user request) — night-mosque card
// ── TABS: Fard Times / Other Times / Tasbih
// ── FARD: Fajr ka start—end (Tulu-e-Aftab tak, red) — screenshot style
// SUNNI HANAFI (India): method=1 (Fajr/Isha 18°) + school=1 (HANAFI Asr)
// LOCATION: FIXED JUNAGADH (Gujarat) — city selector hata diya gaya (user request)
// Hijri: GUJARAT CHAND COMMITTEE (gujchand.com) auto — offline par last-sync cache,
// unavailable hone par umalqura + local ruyat adjust (user +/- se align kar sakta hai)

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  MoonStar,
  Loader2,
  Sunrise,
  Sun,
  SunDim,
  CloudSun,
  Sunset,
  Moon,
  CloudMoon,
  MapPin,
  CalendarDays,
  BadgeCheck,
  Sparkles,
} from 'lucide-react'
import { PRAYER_CITIES } from '@/lib/qalb'
import { getGujchandHijri, type GujchandHijri } from '@/lib/gujchand'
import type { AladhanTimings, HijriDate, PrayerData } from '@/lib/types'
import { TasbihCounter } from './tasbih-counter'
import { useViewBackHandler } from '@/lib/back-stack'

const HIJRI_ADJUST_KEY = 'qalb_hijri_adjust_v1'
// LOCATION: FIXED JUNAGADH — app hamesha Junagadh (Gujarat) ke auqaat dikhayegi
const LOCATION = PRAYER_CITIES[0]
// Kaaba (Haram Sharif) — Qibla bearing calculate karne ke liye
const KAABA = { lat: 21.422487, lng: 39.826206 }

const PRAYER_ORDER: (keyof AladhanTimings)[] = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']

const PRAYER_ICONS = {
  Fajr: Sunrise,
  Dhuhr: Sun,
  Asr: Sunset,
  Maghrib: Moon,
  Isha: CloudMoon,
} as const

const PRAYER_NAMES_UR: Record<string, string> = {
  Fajr: 'Fajr',
  Dhuhr: 'Zuhr',
  Asr: 'Asr',
  Maghrib: 'Maghrib',
  Isha: 'Isha',
}

type CalTab = 'fard' | 'other' | 'tasbih'

const CAL_TABS: { key: CalTab; label: string }[] = [
  { key: 'fard', label: 'Fard Times' },
  { key: 'other', label: 'Other Times' },
  { key: 'tasbih', label: 'Tasbih' },
]

// ── helpers ─────────────────────────────────────────────────────────────

function parseTime(t: string): string {
  const m = t.match(/(\d{1,2}):(\d{2})/)
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : t
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** "05:34" → { time: "05:34", ampm: "AM" } (12h display ke liye) */
function fmt12(hhmm: string): { time: string; ampm: string } {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return { time: hhmm, ampm: '' }
  const h = Number(m[1])
  const min = m[2]
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return { time: `${String(h12).padStart(2, '0')}:${min}`, ampm }
}

function addMin(hhmm: string, delta: number): string {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return hhmm
  const total = (Number(m[1]) * 60 + Number(m[2]) + delta + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** Qibla bearing (initial great-circle bearing, North=0°) Junagadh → Kaaba */
function qiblaBearing(fromLat: number, fromLng: number): number {
  const p1 = (fromLat * Math.PI) / 180
  const p2 = (KAABA.lat * Math.PI) / 180
  const dl = ((KAABA.lng - fromLng) * Math.PI) / 180
  const y = Math.sin(dl) * Math.cos(p2)
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

const COMPASS_UR = [
  'Shumal (N)',
  'Shumal-Mashriq (NE)',
  'Mashriq (E)',
  'Junub-Mashriq (SE)',
  'Junub (S)',
  'Junub-Maghrib (SW)',
  'Maghrib (W)',
  'Shumal-Maghrib (NW)',
]

function compassLabel(deg: number): string {
  return COMPASS_UR[Math.round(deg / 45) % 8]
}

function hijriWithAdjust(offsetDays: number): HijriDate {
  try {
    // Offset gregorian date pe apply hota hai → Intl islamic calendar se
    // hijri nikalta hai (saare month/year rollover automatic handle)
    const target = new Date()
    target.setDate(target.getDate() + offsetDays)
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).formatToParts(target)
    const day = parts.find((p) => p.type === 'day')?.value ?? ''
    const monthEn = parts.find((p) => p.type === 'month')?.value ?? ''
    const year = parts.find((p) => p.type === 'year')?.value ?? ''
    // numeric month (badge ke liye)
    const numParts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
      month: 'numeric',
    }).formatToParts(target)
    const monthNumber = Number(numParts.find((p) => p.type === 'month')?.value ?? 0)
    return {
      day,
      monthNumber,
      monthEn,
      monthAr: '',
      year,
      // hijri weekday = aaj ka hi din hai (shifted date ka nahi)
      weekdayEn: new Intl.DateTimeFormat('en', { weekday: 'long' }).format(new Date()),
      designation: 'Islamic calendar (local ruyat adjust)',
    }
  } catch {
    return {
      day: '—',
      monthNumber: 0,
      monthEn: 'Hijri',
      monthAr: '',
      year: '',
      weekdayEn: '',
      designation: '',
    }
  }
}

const GREG_FMT = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

// ── countdown ring (tick style — screenshot jaisa) ──────────────────────

function CountdownRing({ frac, children }: { frac: number; children: React.ReactNode }) {
  const TICKS = 60
  const remainingTicks = Math.round(Math.max(0, Math.min(1, frac)) * TICKS)
  return (
    <div className="relative h-[128px] w-[128px] shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full" aria-hidden>
        {Array.from({ length: TICKS }, (_, i) => {
          const long = i % 5 === 0
          const a = ((i * 6 - 90) * Math.PI) / 180
          const rOuter = 57
          const rInner = long ? 49 : 52
          const isRemaining = i >= TICKS - remainingTicks
          return (
            <line
              key={i}
              x1={60 + rInner * Math.cos(a)}
              y1={60 + rInner * Math.sin(a)}
              x2={60 + rOuter * Math.cos(a)}
              y2={60 + rOuter * Math.sin(a)}
              stroke={isRemaining ? '#fb7185' : 'rgba(255,255,255,0.82)'}
              strokeWidth={isRemaining ? 2.5 : long ? 1.9 : 1.1}
              strokeLinecap="round"
            />
          )
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

// ── qibla compass (map-style — N upar, needle Qibla ki taraf) ───────────

function QiblaCompass({ deg }: { deg: number }) {
  return (
    <svg viewBox="0 0 96 96" className="h-[78px] w-[78px] shrink-0" aria-hidden>
      <circle
        cx="48"
        cy="48"
        r="45"
        fill="rgba(0,0,0,0.30)"
        stroke="rgba(255,255,255,0.22)"
        strokeWidth="1.4"
      />
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i * 15 * Math.PI) / 180
        const long = i % 6 === 0
        const r1 = long ? 35 : 39
        return (
          <line
            key={i}
            x1={48 + r1 * Math.sin(a)}
            y1={48 - r1 * Math.cos(a)}
            x2={48 + 42 * Math.sin(a)}
            y2={48 - 42 * Math.cos(a)}
            stroke={long ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.25)'}
            strokeWidth={long ? 1.6 : 1}
            strokeLinecap="round"
          />
        )
      })}
      <text x="48" y="17" textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#fb7185">
        N
      </text>
      <text x="83" y="51.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="rgba(255,255,255,0.55)">
        E
      </text>
      <text x="48" y="88" textAnchor="middle" fontSize="8" fontWeight="700" fill="rgba(255,255,255,0.55)">
        S
      </text>
      <text x="13" y="51.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="rgba(255,255,255,0.55)">
        W
      </text>
      <g transform={`rotate(${deg} 48 48)`}>
        <polygon points="48,13 42.5,50 53.5,50" fill="#fb7185" />
        <polygon points="48,86 42.5,50 53.5,50" fill="rgba(255,255,255,0.20)" />
        <circle cx="48" cy="20" r="6" fill="none" stroke="#fecdd3" strokeWidth="1.2" />
      </g>
      <circle cx="48" cy="48" r="3" fill="rgba(255,255,255,0.9)" />
    </svg>
  )
}

// ── main view ───────────────────────────────────────────────────────────

export function CalendarView() {
  const [data, setData] = useState<PrayerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => new Date())
  const [tab, setTab] = useState<CalTab>('fard')

  // Back gesture (v0.3.1): tasbih/other sub-tab se wapas fard par
  useViewBackHandler('cal-tab', 'calendar', () => {
    if (tab === 'fard') return false
    setTab('fard')
    return true
  })
  // GUJARAT CHAND COMMITTEE hijri — auto (gujchand.com)
  const [gujchand, setGujchand] = useState<GujchandHijri | null>(null)
  // fallback: Sunni Hanafi local ruyat adjust — Hindustan me chand aksar 1 din baad
  const [hijriAdjust, setHijriAdjust] = useState<number>(-1)

  useEffect(() => {
    // saved hijri adjust load karo
    const t = setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(HIJRI_ADJUST_KEY)
        if (raw !== null && !Number.isNaN(Number(raw))) setHijriAdjust(Number(raw))
      } catch {
        /* default -1 */
      }
    }, 0)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    // adjust change → persist
    try {
      window.localStorage.setItem(HIJRI_ADJUST_KEY, String(hijriAdjust))
    } catch {
      /* ignore */
    }
  }, [hijriAdjust])

  const fetchPrayerData = useCallback(async (city: typeof LOCATION) => {
    setLoading(true)
    try {
      // Coordinates wali city → timingsByCoordinates (precise, koi geocoding
      // mismatch nahi — Junagadh jaise chhote shehro ke liye zaroori).
      // Sunni Hanafi India: method=1 (Fajr/Isha 18°), school=1 (HANAFI Asr)
      const now = new Date()
      const dmy = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`
      const coordQuery = `latitude=${city.lat}&longitude=${city.lng}&method=1&school=1`
      const url = `https://api.aladhan.com/v1/timings/${dmy}?${coordQuery}`
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
      if (!res.ok) throw new Error('aladhan failed')
      const json = await res.json()
      const d = json?.data
      if (!d?.timings) throw new Error('no data')
      const timings = {
        Fajr: parseTime(d.timings.Fajr),
        Sunrise: parseTime(d.timings.Sunrise),
        Dhuhr: parseTime(d.timings.Dhuhr),
        Asr: parseTime(d.timings.Asr),
        Maghrib: parseTime(d.timings.Maghrib),
        Isha: parseTime(d.timings.Isha),
        // extended auqaat (Other Times tab)
        Imsak: parseTime(d.timings.Imsak ?? ''),
        Midnight: parseTime(d.timings.Midnight ?? ''),
        Lastthird: parseTime(d.timings.Lastthird ?? ''),
      }
      const hijri: HijriDate = hijriWithAdjust(0) // placeholder — render par gujchand/adjust override karta hai
      setData({
        timings,
        hijri,
        gregorian: d.date?.gregorian?.date ?? '',
        timezone: d.meta?.timezone ?? 'Asia/Kolkata',
        city: `${city.city}, ${city.country}`,
      })
    } catch {
      // offline fallback — static approximate timings (Junagadh base)
      setData({
        timings: {
          Fajr: '05:15',
          Sunrise: '06:35',
          Dhuhr: '12:30',
          Asr: '16:00',
          Maghrib: '18:10',
          Isha: '19:30',
          Imsak: '05:05',
          Midnight: '00:52',
          Lastthird: '02:09',
        },
        hijri: hijriWithAdjust(0),
        gregorian: new Date().toLocaleDateString('en-GB'),
        timezone: 'Asia/Kolkata',
        city: `${city.city}, ${city.country}`,
      })
    } finally {
      setLoading(false)
    }
  }, [])

  // GUJARAT CHAND COMMITTEE — live hijri fetch (gujchand.com)
  useEffect(() => {
    let stale = false
    getGujchandHijri()
      .then((h) => {
        if (!stale && h) setGujchand(h)
      })
      .catch(() => {
        /* fallback ruyat adjust chalta rahega */
      })
    return () => {
      stale = true
    }
  }, [])

  useEffect(() => {
    void fetchPrayerData(LOCATION)
  }, [fetchPrayerData])

  // live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // next prayer + countdown + ring progress
  const { nextPrayer, countdown, targetTime, remainingFrac } = useMemo(() => {
    if (!data)
      return { nextPrayer: null, countdown: '--:--:--', targetTime: null as Date | null, remainingFrac: 0 }
    const mkAt = (name: keyof AladhanTimings, dayOffset = 0) => {
      const [h, m] = (data.timings[name] ?? '').split(':').map(Number)
      const d = new Date(now)
      d.setDate(d.getDate() + dayOffset)
      d.setHours(h, m, 0, 0)
      return d
    }
    const cycle: { name: string; at: Date }[] = [
      { name: 'Fajr', at: mkAt('Fajr') },
      { name: 'Dhuhr', at: mkAt('Dhuhr') },
      { name: 'Asr', at: mkAt('Asr') },
      { name: 'Maghrib', at: mkAt('Maghrib') },
      { name: 'Isha', at: mkAt('Isha') },
      { name: 'Fajr', at: mkAt('Fajr', 1) },
    ].sort((a, b) => a.at.getTime() - b.at.getTime())
    const next = cycle.find((p) => p.at > now) ?? cycle[cycle.length - 1]
    const idx = cycle.indexOf(next)
    // prev prayer = cycle me next se pehle wala; subah (Fajr se pehle) Isha kal ka
    const prev =
      (idx > 0 ? cycle[idx - 1] : undefined) ?? { name: 'Isha', at: mkAt('Isha', -1) }
    const diff = Math.max(0, Math.floor((next.at.getTime() - now.getTime()) / 1000))
    const hh = String(Math.floor(diff / 3600)).padStart(2, '0')
    const mm = String(Math.floor((diff % 3600) / 60)).padStart(2, '0')
    const ss = String(diff % 60).padStart(2, '0')
    const total = Math.max(1, next.at.getTime() - prev.at.getTime())
    const remaining = Math.max(0, Math.min(1, (next.at.getTime() - now.getTime()) / total))
    return {
      nextPrayer: next.name,
      countdown: `${hh}:${mm}:${ss}`,
      targetTime: next.at,
      remainingFrac: remaining,
    }
  }, [data, now])

  // render par hijri: GUJARAT CHAND COMMITTEE (auto) > local ruyat adjust
  const view = useMemo(() => {
    if (!data) return null
    if (gujchand) {
      return {
        ...data,
        hijri: {
          day: gujchand.day,
          monthNumber: gujchand.monthNumber,
          monthEn: gujchand.monthEn,
          monthAr: '',
          year: gujchand.year,
          weekdayEn: new Intl.DateTimeFormat('en', { weekday: 'long' }).format(new Date()),
          designation: 'Gujarat Chand Committee',
        } as HijriDate,
      }
    }
    return { ...data, hijri: hijriWithAdjust(hijriAdjust) }
  }, [data, gujchand, hijriAdjust])
  const clampAdjust = (v: number) => Math.max(-2, Math.min(2, v))

  // Qibla bearing — Junagadh fixed, ek hi baar calculate
  const qibla = useMemo(() => qiblaBearing(LOCATION.lat, LOCATION.lng), [])

  // Other Times — Sehri/Ishraq/Zawal/Chasht/Iftar/Nisf-ul-Layl/Tahajjud
  const otherTimes = useMemo(() => {
    if (!view) return []
    const t = view.timings
    const chashtDelta = Math.round((toMin(t.Dhuhr) - toMin(t.Sunrise)) / 2)
    return [
      { icon: MoonStar, label: 'Sehri Khatam', sub: 'Imsak — roza shuru hone ka waqt', time: t.Imsak ?? addMin(t.Fajr, -10) },
      { icon: Sunrise, label: 'Tulu-e-Aftab', sub: 'Sunrise — Fajr waqt khatam', time: t.Sunrise },
      { icon: Sun, label: 'Ishraq', sub: 'Tulu ke ~20 min baad', time: addMin(t.Sunrise, 20) },
      { icon: SunDim, label: 'Zawal', sub: 'Zuhr se ~10 min pehle', time: addMin(t.Dhuhr, -10) },
      { icon: CloudSun, label: 'Chasht (Duha)', sub: 'Ishraq ke baad, Zuhr se pehle', time: addMin(t.Sunrise, chashtDelta) },
      { icon: Sunset, label: 'Iftari (Maghrib)', sub: 'Roza kholne ka waqt', time: t.Maghrib },
      { icon: Moon, label: 'Nisf-ul-Layl', sub: 'Sharahi aadhi raat', time: t.Midnight ?? '—' },
      { icon: Sparkles, label: 'Tahajjud', sub: 'Raat ka aakhri teesra hissa', time: t.Lastthird ?? '—' },
    ]
  }, [view])

  return (
    <div className="space-y-4 px-4 pb-8 pt-5">
      {/* header */}
      <header>
        <h1 className="flex items-center gap-2 text-xl font-extrabold text-emerald-50">
          <MoonStar className="h-5 w-5 text-emerald-400" /> Islamic Calendar
          <span className="rounded-full bg-gold/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold">
            Sunni Hanafi
          </span>
        </h1>
        <p className="text-xs text-emerald-200/50">Hijri date, namaz ke auqaat, Qibla aur tasbih</p>
      </header>

      {loading ? (
        <div className="flex h-56 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-emerald-400" />
        </div>
      ) : view ? (
        <>
          {/* ── HERO: countdown ring + dates + qibla (night mosque card) ── */}
          <section
            aria-label="Namaz dashboard"
            className="relative overflow-hidden rounded-3xl p-5 text-white shadow-[0_18px_50px_-18px_rgba(0,0,0,0.55)]"
            style={{ background: 'linear-gradient(168deg, #14503a 0%, #0d3123 52%, #071e15 100%)' }}
          >
            {/* mosque skyline — decorative */}
            <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 opacity-[0.13]">
              <svg viewBox="0 0 400 80" className="block w-full">
                <rect x="198.75" y="10" width="2.5" height="12" fill="#d9fbe9" />
                <path
                  fill="#d9fbe9"
                  d="M0 80 V62 H60 V30 Q66 19 72 30 V50 H160 A40 30 0 0 1 240 50 H328 V30 Q334 19 340 30 V62 H400 V80 Z"
                />
              </svg>
            </div>

            {/* countdown ring + dates */}
            <div className="relative flex items-center gap-4">
              <CountdownRing frac={remainingFrac}>
                <p className="text-[13px] font-extrabold text-rose-300">
                  {nextPrayer ? PRAYER_NAMES_UR[nextPrayer] : '—'}
                </p>
                <p className="font-mono text-[19px] font-extrabold leading-tight tabular-nums">{countdown}</p>
                <p className="text-[8.5px] font-bold uppercase tracking-[0.2em] text-white/45">baaki</p>
              </CountdownRing>

              <div className="min-w-0 flex-1 space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <MoonStar className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-extrabold leading-tight">
                      {view.hijri.day} {view.hijri.monthEn}, {view.hijri.year}
                    </p>
                    <p className="flex items-center gap-1 text-[9.5px] font-medium text-white/50">
                      {gujchand && <BadgeCheck className="h-3 w-3 text-amber-300" />}
                      {gujchand
                        ? `Gujarat Chand Committee${gujchand.source === 'cache' ? ' (last sync)' : ''}`
                        : 'Local ruyat adjust'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <CalendarDays className="h-4 w-4 shrink-0 text-white/60" />
                  <p className="text-[13px] font-semibold text-white/90">{GREG_FMT.format(now)}</p>
                </div>
                <div className="flex items-center gap-2.5">
                  <MapPin className="h-4 w-4 shrink-0 text-white/60" />
                  <p className="truncate text-[12px] font-medium text-white/70">
                    {LOCATION.city}, Gujarat (IST)
                  </p>
                </div>
              </div>
            </div>

            {/* chand adjust — jab gujchand available na ho */}
            {!gujchand && (
              <div className="relative mt-3 flex items-center gap-2.5 rounded-xl bg-black/20 px-3 py-2">
                <span className="text-[10px] font-bold uppercase tracking-wide text-white/70">
                  Chand adjust
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setHijriAdjust((a) => clampAdjust(a - 1))}
                    disabled={hijriAdjust <= -2}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/25 text-sm font-bold text-white transition hover:bg-black/40 disabled:opacity-30"
                    aria-label="Hijri date ek din peeche"
                  >
                    −
                  </button>
                  <span className="min-w-9 text-center font-mono text-xs font-bold">
                    {hijriAdjust > 0 ? `+${hijriAdjust}` : hijriAdjust}
                  </span>
                  <button
                    type="button"
                    onClick={() => setHijriAdjust((a) => clampAdjust(a + 1))}
                    disabled={hijriAdjust >= 2}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/25 text-sm font-bold text-white transition hover:bg-black/40 disabled:opacity-30"
                    aria-label="Hijri date ek din aage"
                  >
                    +
                  </button>
                </div>
              </div>
            )}

            {/* ── QIBLA — timer ke niche (user request) ── */}
            <div className="relative mt-4 flex items-center gap-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <QiblaCompass deg={qibla} />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-300">
                  Qibla Disha
                </p>
                <p className="text-[15px] font-extrabold">
                  {Math.round(qibla)}° • {compassLabel(qibla)}
                </p>
                <p className="mt-0.5 text-[9.5px] leading-snug text-white/50">
                  Kaaba Sharif ki taraf — map-style (N upar). Junagadh me Qibla Maghrib ke qareeb
                  hai.
                </p>
              </div>
            </div>
          </section>

          {/* ── tabs ── */}
          <div className="flex justify-center">
            <div className="card-surface inline-flex items-center gap-1 rounded-full p-1.5" role="tablist">
              {CAL_TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => setTab(t.key)}
                  className={`rounded-full px-4 py-2 text-[12.5px] font-bold transition ${
                    tab === t.key
                      ? 'emerald-gradient text-emerald-950 shadow-[0_6px_18px_-6px_var(--glow)]'
                      : 'text-emerald-200/50 hover:text-emerald-100'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── FARD TIMES ── */}
          {tab === 'fard' && (
            <section aria-label="Fard namaz timings" className="grid grid-cols-1 gap-2">
              {PRAYER_ORDER.map((name) => {
                const Icon = PRAYER_ICONS[name]
                const isNext = nextPrayer === name
                const main = fmt12(view.timings[name] ?? '')
                const isFajr = name === 'Fajr'
                // Fajr ka waqt Tulu-e-Aftab (Sunrise) tak — screenshot style red end
                const end = isFajr ? fmt12(view.timings.Sunrise) : null
                return (
                  <div
                    key={name}
                    className={`card-surface flex items-center gap-3 rounded-2xl px-4 py-3 transition ${
                      isNext ? 'border-emerald-400/40 shadow-[0_0_24px_-8px_var(--glow)]' : ''
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        isNext ? 'bg-emerald-400/15 text-emerald-300' : 'bg-emerald-400/5 text-emerald-200/60'
                      }`}
                    >
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0">
                      <p className={`text-sm font-bold ${isNext ? 'text-emerald-300' : 'text-emerald-50'}`}>
                        {PRAYER_NAMES_UR[name]}
                        {name === 'Asr' || name === 'Isha' ? (
                          <span className="ml-1.5 text-[11px] font-semibold text-emerald-200/40">
                            — Hanafi
                          </span>
                        ) : null}
                      </p>
                      {isFajr && (
                        <p className="text-[9.5px] text-rose-400/70">Tulu-e-Aftab tak</p>
                      )}
                    </div>
                    <div className="ml-auto text-right font-mono tabular-nums">
                      {isFajr && end ? (
                        <p className="text-[15px] font-bold text-emerald-100/90">
                          {main.time}{' '}
                          <span className="text-[10px] font-semibold text-emerald-200/40">{main.ampm}</span>
                          <span className="mx-1 text-emerald-200/30">—</span>
                          <span className="text-rose-400">{end.time}</span>{' '}
                          <span className="text-[10px] font-semibold text-rose-400/60">{end.ampm}</span>
                        </p>
                      ) : (
                        <p
                          className={`text-[15px] font-bold ${
                            isNext ? 'text-emerald-300' : 'text-emerald-100/80'
                          }`}
                        >
                          {main.time}{' '}
                          <span className="text-[10px] font-semibold opacity-50">{main.ampm}</span>
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </section>
          )}

          {/* ── OTHER TIMES ── */}
          {tab === 'other' && (
            <section aria-label="Other timings" className="grid grid-cols-1 gap-2">
              {otherTimes.map(({ icon: Icon, label, sub, time }) => {
                const { time: tm, ampm } = fmt12(time)
                return (
                  <div
                    key={label}
                    className="card-surface flex items-center gap-3 rounded-2xl px-4 py-2.5"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-bold text-emerald-50">{label}</p>
                      <p className="text-[9.5px] text-emerald-200/40">{sub}</p>
                    </div>
                    <p className="ml-auto font-mono text-[13.5px] font-bold tabular-nums text-emerald-100/80">
                      {tm} <span className="text-[9px] font-semibold text-emerald-200/40">{ampm}</span>
                    </p>
                  </div>
                )
              })}
            </section>
          )}

          {/* ── TASBIH ── */}
          {tab === 'tasbih' && <TasbihCounter />}

          <p className="text-center text-[10px] text-emerald-200/30">
            Auqaat: Aladhan API — Asr Hanafi method • Hijri:{' '}
            {gujchand ? 'Gujarat Chand Committee' : 'local ruyat adjust'} • Timezone:{' '}
            {view.timezone}
          </p>
        </>
      ) : null}
    </div>
  )
}
