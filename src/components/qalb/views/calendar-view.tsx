'use client'

// Qalb — Calendar Tab: Hijri date + 5 Prayer timings + live countdown (Aladhan API)
// SUNNI HANAFI (India): method=1 (Fajr/Isha 18°) + school=1 (HANAFI Asr)
// LOCATION: DEFAULT JUNAGADH (Gujarat) — coordinates se precise timings
// (city-name geocoding se behtar).
// Hijri date: GUJARAT CHAND COMMITTEE (gujchand.com) ke hisaab se AUTO —
// live fetch (native direct / hosted API), offline par last-sync cache.
// Agar gujchand available nahi → umalqura + LOCAL RUAYAT adjust (-2..+2)
// — user +/- buttons se align kar sakta hai (Hanafi maslak).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { MapPin, MoonStar, Loader2, Sunrise, Sun, Sunset, Moon, CloudMoon, AlarmClock, BadgeCheck } from 'lucide-react'
import { PRAYER_CITIES } from '@/lib/qalb'
import { getGujchandHijri, type GujchandHijri } from '@/lib/gujchand'
import type { AladhanTimings, HijriDate, PrayerData } from '@/lib/types'

const LOCATION_KEY = 'qalb_location_v1'
const HIJRI_ADJUST_KEY = 'qalb_hijri_adjust_v1'
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
  Dhuhr: 'Zohar',
  Asr: 'Asr',
  Maghrib: 'Maghrib',
  Isha: 'Isha',
}

function parseTime(t: string): string {
  const m = t.match(/(\d{1,2}):(\d{2})/)
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : t
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

export function CalendarView() {
  const [location, setLocation] = useState<(typeof PRAYER_CITIES)[number]>(PRAYER_CITIES[0])
  const [data, setData] = useState<PrayerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [now, setNow] = useState(() => new Date())
  // GUJARAT CHAND COMMITTEE hijri — auto (gujchand.com)
  const [gujchand, setGujchand] = useState<GujchandHijri | null>(null)
  // fallback: Sunni Hanafi local ruyat adjust — Hindustan me chand aksar 1 din baad
  const [hijriAdjust, setHijriAdjust] = useState<number>(-1)

  useEffect(() => {
    // localStorage read → async (cascading render se bachne ke liye)
    const t = setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(LOCATION_KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          const found = PRAYER_CITIES.find((c) => c.city === parsed.city)
          if (found) setLocation(found)
        }
      } catch {
        /* default */
      }
    }, 0)
    return () => clearTimeout(t)
  }, [])

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

  const fetchPrayerData = useCallback(async (city: typeof location) => {
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
        timings: { Fajr: '05:15', Sunrise: '06:35', Dhuhr: '12:30', Asr: '16:00', Maghrib: '18:10', Isha: '19:30' },
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
    void fetchPrayerData(location)
  }, [location, fetchPrayerData])

  // live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // next prayer + countdown
  const { nextPrayer, countdown, targetTime } = useMemo(() => {
    if (!data) return { nextPrayer: null, countdown: '--:--:--', targetTime: null as Date | null }
    const times = PRAYER_ORDER.map((name) => {
      const [h, m] = data.timings[name].split(':').map(Number)
      const d = new Date(now)
      d.setHours(h, m, 0, 0)
      if (d <= now) d.setDate(d.getDate() + 1)
      return { name, at: d }
    }).sort((a, b) => a.at.getTime() - b.at.getTime())

    const next = times[0]
    const diff = Math.max(0, Math.floor((next.at.getTime() - now.getTime()) / 1000))
    const hh = String(Math.floor(diff / 3600)).padStart(2, '0')
    const mm = String(Math.floor((diff % 3600) / 60)).padStart(2, '0')
    const ss = String(diff % 60).padStart(2, '0')
    return { nextPrayer: next.name, countdown: `${hh}:${mm}:${ss}`, targetTime: next.at }
  }, [data, now])

  const pickCity = (city: (typeof PRAYER_CITIES)[number]) => {
    setLocation(city)
    setPickerOpen(false)
    try {
      window.localStorage.setItem(LOCATION_KEY, JSON.stringify(city))
    } catch {
      /* ignore */
    }
  }

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

  return (
    <div className="space-y-5 px-4 pb-8 pt-5">
      {/* header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-extrabold text-emerald-50">
            <MoonStar className="h-5 w-5 text-emerald-400" /> Islamic Calendar
            <span className="rounded-full bg-gold/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold">
              Sunni Hanafi
            </span>
          </h1>
          <p className="text-xs text-emerald-200/50">Hijri date aur namaz ke auqaat — Hindustan</p>
        </div>
        <button
          type="button"
          onClick={() => setPickerOpen(!pickerOpen)}
          className="flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-[11px] font-semibold text-emerald-200 transition hover:bg-emerald-400/10"
          aria-label="Shehar badlein"
        >
          <MapPin className="h-3.5 w-3.5 text-emerald-400" />
          {location.flag} {location.city}
        </button>
      </header>

      {/* city picker */}
      {pickerOpen && (
        <div className="card-surface thin-scrollbar max-h-56 overflow-y-auto rounded-2xl p-2" role="listbox" aria-label="Shehar chunein">
          {PRAYER_CITIES.map((c) => (
            <button
              key={`${c.city}-${c.country}`}
              type="button"
              role="option"
              aria-selected={c.city === location.city}
              onClick={() => pickCity(c)}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[13px] transition hover:bg-emerald-400/10 ${
                c.city === location.city ? 'text-emerald-300' : 'text-emerald-100/80'
              }`}
            >
              <span>{c.flag}</span> {c.city}
              <span className="ml-auto text-[10px] text-emerald-200/40">{c.country}</span>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex h-56 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-emerald-400" />
        </div>
      ) : view ? (
        <>
          {/* hijri card */}
          <section
            aria-label="Hijri date"
            className="emerald-gradient relative overflow-hidden rounded-3xl p-5 text-emerald-950 shadow-[0_16px_48px_-16px_var(--glow)]"
          >
            <div className="absolute -right-6 -top-8 text-[110px] leading-none opacity-15">🕌</div>
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-emerald-900/70">
              {view.hijri.weekdayEn || 'Hijri'}
            </p>
            <p className="mt-1 text-3xl font-extrabold tracking-tight">
              {view.hijri.day} {view.hijri.monthEn} {view.hijri.year} AH
            </p>
            <p className="mt-1 text-[12px] font-semibold opacity-75">
              {view.gregorian} • {view.city}
            </p>
            {/* hijri source: GUJARAT CHAND COMMITTEE auto ya local ruyat adjust */}
            {gujchand ? (
              <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-black/15 px-3 py-2">
                <BadgeCheck className="h-4 w-4 shrink-0 text-gold" />
                <span className="text-[10.5px] font-bold leading-tight">
                  Gujarat Chand Committee ke mutabiq
                  <span className="ml-1.5 font-medium opacity-60">
                    {gujchand.source === 'cache' ? `(last sync: ${gujchand.fetchedOn})` : 'auto-updated'}
                  </span>
                </span>
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-black/15 px-3 py-2">
                <span className="text-[10px] font-bold uppercase tracking-wide opacity-80">
                  Chand adjust
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setHijriAdjust((a) => clampAdjust(a - 1))}
                    disabled={hijriAdjust <= -2}
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/20 text-sm font-bold transition hover:bg-black/30 disabled:opacity-30"
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
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/20 text-sm font-bold transition hover:bg-black/30 disabled:opacity-30"
                    aria-label="Hijri date ek din aage"
                  >
                    +
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* countdown */}
          {nextPrayer && (
            <section
              aria-label="Next prayer countdown"
              className="card-surface flex items-center justify-between rounded-2xl border-gold/25 p-4"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gold/10 text-xl">
                  <AlarmClock className="h-5 w-5 text-gold" />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gold">
                    Agli Namaz — {PRAYER_NAMES_UR[nextPrayer]}
                  </p>
                  <p className="font-mono text-xl font-bold tabular-nums text-emerald-50">
                    {countdown}
                  </p>
                </div>
              </div>
              {targetTime && (
                <p className="text-right text-[11px] text-emerald-200/50">
                  {targetTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </section>
          )}

          {/* prayer timings */}
          <section aria-label="Prayer timings" className="grid grid-cols-1 gap-2">
            {PRAYER_ORDER.map((name) => {
              const Icon = PRAYER_ICONS[name]
              const isNext = nextPrayer === name
              return (
                <div
                  key={name}
                  className={`card-surface flex items-center justify-between rounded-2xl px-4 py-3 transition ${
                    isNext ? 'border-emerald-400/40 shadow-[0_0_24px_-8px_var(--glow)]' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                        isNext ? 'bg-emerald-400/15 text-emerald-300' : 'bg-emerald-400/5 text-emerald-200/60'
                      }`}
                    >
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <div>
                      <p className={`text-sm font-bold ${isNext ? 'text-emerald-300' : 'text-emerald-50'}`}>
                        {PRAYER_NAMES_UR[name]}
                      </p>
                      <p className="text-[10px] text-emerald-200/40">
                        {name === 'Asr' ? `${name} (Hanafi)` : name}
                      </p>
                    </div>
                  </div>
                  <p
                    className={`font-mono text-[15px] font-bold tabular-nums ${
                      isNext ? 'text-emerald-300' : 'text-emerald-100/80'
                    }`}
                  >
                    {view.timings[name]}
                  </p>
                </div>
              )
            })}
          </section>

          <p className="text-center text-[10px] text-emerald-200/30">
            Namaz: Aladhan API — Asr Hanafi method • Timezone: {view.timezone}
          </p>
        </>
      ) : null}
    </div>
  )
}
