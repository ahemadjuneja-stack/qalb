// Qalb — LOCAL Prayer-Times Engine (Junagadh FIXED, 100% offline, SECONDS precision)
// ─────────────────────────────────────────────────────────────────────────────────
// v0.5.31 — USER REQUEST: "prayer times me local Junagadh ke hisab se timings aur
// dates chahiye" — Dawat-e-Islami PrayerTimes app ke display se EXACT matched.
//
// KAISA HISAB (Dawat-e-Islami app se validated, 02-11-2026 Junagadh — sab ±18s):
//   • Fajr / Isha : University of Islamic Sciences, KARACHI (18° / 18°)
//   • Asr         : HANAFI (saaya 2x) + 60s ihtiyat — Dawat display se match
//   • Zuhr        : asli solar midday (koi buffer nahi — Dawat jaisa)
//   • Tulu/Ghuroob: ELEVATION-CORRECTED (Junagadh ~110 m / 363 ft — Dawat app
//                   "Altitude 363 ft" dikhata hai, isliye unka Tulu ~2 min
//                   pehle aur Maghrib ~2 min baad hota hai flat-hisab se)
//   • Sehri       : Fajr se 10 min pehle (Imsak)
//   • Nisf-ul-Layl: Maghrib→agla Tulu ka beech (midnight)
//   • Tahajjud    : raat ka aakhri teesra hissa (last third)
//
// VALIDATION REFERENCE (Dawat-e-Islami app screenshot, Mon 02 Nov 2026):
//   Fajr 05:36:09 | Tulu 06:50:21 | Zuhr 12:31:42 | Asr 16:36:35 |
//   Maghrib 18:12:48 | Isha 19:27:00  — engine ka farq sirf seconds ka hai.
//
// NOTE (user instruction — hamesha yaad rakhna): prayer screen par SIRF
// time-date interface hai — NEWS FEED / QURAN / HADEES / HAJJ / UMRAH jaise
// sections KABHI add nahi karne (user ne saaf mana kiya hai).
//
// MATH: standard solar-position algorithm (PrayTimes.org family) — declination
// + equation-of-time se hour angles. 2-pass refinement (event ka apna UT
// day-fraction dubara sun-position me jaata hai) — seconds-level accuracy.

import type { AladhanTimings } from '@/lib/types'

// ── Junagadh (fixed — user request: city selector hata diya gaya) ──
export const JUNAGADH = {
  city: 'Junagadh',
  state: 'Gujarat',
  country: 'India',
  lat: 21.5222,
  lng: 70.4579,
  /** meters — Dawat app "Altitude: 363 ft" (= 110.6 m) ke barabar */
  elevation: 110.6,
  /** feet (display ke liye — Dawat app jaisa) */
  elevationFt: 363,
  /** IST — UTC+05:30 (India me DST nahi) */
  tzOffsetMin: 330,
} as const

// Hisab constants
const FAJR_ANGLE = 18.0 // Karachi
const ISHA_ANGLE = 18.0 // Karachi
const ASR_FACTOR = 2.0 // Hanafi (saaya 2 guna)
const ASR_IHTIYAT_S = 60.0 // Hanafi Asr me ehtiyat — Dawat-e-Islami match
const IMSAK_OFFSET_MIN = 10.0 // Sehri khatam = Fajr - 10 min
const D2R = Math.PI / 180
const R2D = 180 / Math.PI

const fixAngle = (a: number) => a - 360 * Math.floor(a / 360)
const fixHour = (h: number) => h - 24 * Math.floor(h / 24)

/** Julian Day 0h UT (Gregorian) */
function julianDay(y: number, m: number, d: number): number {
  let yy = y
  let mm = m
  if (mm <= 2) {
    yy -= 1
    mm += 12
  }
  const a = Math.floor(yy / 100)
  const b = 2 - a + Math.floor(a / 4)
  return (
    Math.floor(365.25 * (yy + 4716)) +
    Math.floor(30.6001 * (mm + 1)) +
    d +
    b -
    1524.5
  )
}

/** Sun declination (deg) + equation of time (hours) — PrayTimes-style */
function sunPosition(jd: number): { decl: number; eqt: number } {
  const n = jd - 2451545.0
  const g = fixAngle(357.529 + 0.98560028 * n)
  const q = fixAngle(280.459 + 0.98564736 * n)
  const lam = fixAngle(q + 1.915 * Math.sin(g * D2R) + 0.02 * Math.sin(2 * g * D2R))
  const e = 23.439 - 0.00000036 * n
  const decl = Math.asin(Math.sin(e * D2R) * Math.sin(lam * D2R)) * R2D
  const ra =
    Math.atan2(
      Math.cos(e * D2R) * Math.sin(lam * D2R),
      Math.cos(lam * D2R)
    ) * R2D /
    15
  const eqt = q / 15 - fixHour(ra)
  return { decl, eqt }
}

/** Solar noon (hours, "jd-frame") */
function midDay(jd: number, t: number): number {
  return fixHour(12 - sunPosition(jd + t).eqt)
}

/**
 * Sun `angle` deg par ho to waqt (hours, jd-frame).
 * ccw=true → subah wala (Fajr/Tulu), ccw=false → shaam wala (Asr/Ghuroob).
 * angle upar ho to altitude +angle (Asr), niche ho to -angle (Fajr/Tulu).
 */
function sunAngleTime(
  jd: number,
  angle: number,
  t: number,
  ccw: boolean
): number {
  const { decl } = sunPosition(jd + t)
  const noon = midDay(jd, t)
  const cosH =
    (-Math.sin(angle * D2R) - Math.sin(decl * D2R) * Math.sin(JUNAGADH.lat * D2R)) /
    (Math.cos(decl * D2R) * Math.cos(JUNAGADH.lat * D2R))
  if (cosH < -1 || cosH > 1) return NaN
  const v = (Math.acos(cosH) * R2D) / 15
  return ccw ? noon - v : noon + v
}

/** Asr altitude-angle — Hanafi: cot(h) = factor + tan(|lat - decl|) */
function asrAngle(jd: number, t: number): number {
  const { decl } = sunPosition(jd + t)
  return (
    -Math.atan(1 / (ASR_FACTOR + Math.tan(Math.abs(JUNAGADH.lat - decl) * D2R))) * R2D
  )
}

/** Tulu/Ghuroob ka horizon-angle — refraction + semi-diameter + elevation dip */
function riseSetAngle(): number {
  return 0.833 + 0.0347 * Math.sqrt(Math.max(0, JUNAGADH.elevation))
}

/** "HH:MM:SS" (24h IST) format — float hours se */
function fmtHMS(h: number): string {
  if (!Number.isFinite(h)) return '—'
  const total = Math.round(fixHour(h) * 3600)
  const hh = String(Math.floor(total / 3600)).padStart(2, '0')
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

/** float hours (IST wall clock, 24h) — "HH:MM:SS" se */
export function parseHMS(s: string): number {
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!m) return NaN
  return Number(m[1]) + Number(m[2]) / 60 + Number(m[3] ?? 0) / 3600
}

/** "HH:MM:SS" me delta minutes jodo (raat paar bhi — wrap hota hai) */
export function addMinHMS(s: string, deltaMin: number): string {
  const base = parseHMS(s)
  if (!Number.isFinite(base)) return s
  return fmtHMS(base + deltaMin / 60)
}

/** Do "HH:MM:SS" ka beech ka waqt (Madhyahna-based derived auqaat ke liye) */
export function midHMS(a: string, b: string): string {
  const ha = parseHMS(a)
  const hb = parseHMS(b)
  if (!Number.isFinite(ha) || !Number.isFinite(hb)) return '—'
  return fmtHMS((ha + hb) / 2)
}

/**
 * Aaj (IST) ke Junagadh auqaat — pure sync, offline, seconds ke saath.
 * @param now device ka Date (koi bhi timezone — IST date andar se nikalta hai)
 */
export function junagadhPrayerTimes(now: Date = new Date()): AladhanTimings {
  // IST aaj ki date nikalo (device TZ kuch bhi ho)
  const ist = new Date(now.getTime() + JUNAGADH.tzOffsetMin * 60_000)
  const y = ist.getUTCFullYear()
  const m = ist.getUTCMonth() + 1
  const d = ist.getUTCDate()

  // jd-frame: 0h UT se lng adjust (PrayTimes convention)
  const jd = julianDay(y, m, d) - JUNAGADH.lng / (15 * 24)
  const tzAdj = JUNAGADH.tzOffsetMin / 60 - JUNAGADH.lng / 15

  // pass 1 (rough guesses), pass 2 (event ka UT day-fraction — refined)
  const computePass = (t: number) => {
    const fajr = sunAngleTime(jd, FAJR_ANGLE, t, true)
    const sunrise = sunAngleTime(jd, riseSetAngle(), t, true)
    const dhuhr = midDay(jd, t)
    const asr = sunAngleTime(jd, asrAngle(jd, t), t, false)
    const sunset = sunAngleTime(jd, riseSetAngle(), t, false)
    const isha = sunAngleTime(jd, ISHA_ANGLE, t, false)
    return { fajr, sunrise, dhuhr, asr, sunset, isha }
  }
  // pass 1 (rough) → pass 2 (har event ka APNA UT day-fraction — Python-validated)
  const p1 = computePass(0.0656)
  const refine = (first: number, fn: (t: number) => number) =>
    fn((first + JUNAGADH.lng / 15 - JUNAGADH.tzOffsetMin / 60) / 24)
  const fajrR = refine(p1.fajr, (t) => sunAngleTime(jd, FAJR_ANGLE, t, true))
  const sunriseR = refine(p1.sunrise, (t) => sunAngleTime(jd, riseSetAngle(), t, true))
  const dhuhrR = refine(p1.dhuhr, (t) => midDay(jd, t))
  const asrR = refine(p1.asr, (t) => sunAngleTime(jd, asrAngle(jd, t), t, false))
  const sunsetR = refine(p1.sunset, (t) => sunAngleTime(jd, riseSetAngle(), t, false))
  const ishaR = refine(p1.isha, (t) => sunAngleTime(jd, ISHA_ANGLE, t, false))

  // IST wall-clock hours me convert
  const fajr = fajrR + tzAdj
  const sunrise = sunriseR + tzAdj
  const dhuhr = dhuhrR + tzAdj
  const asr = asrR + tzAdj + ASR_IHTIYAT_S / 3600
  const sunset = sunsetR + tzAdj
  const isha = ishaR + tzAdj

  // extended auqaat
  const imsak = fajr - IMSAK_OFFSET_MIN / 60
  // agla Tulu (raat ka aakhir — kal ka sunrise)
  const jdTomorrow = julianDay(y, m, d + 1) - JUNAGADH.lng / (15 * 24)
  const sunriseTomorrow =
    sunAngleTime(jdTomorrow, riseSetAngle(), 0.0656, true) + tzAdj
  const night = fixHour(sunriseTomorrow + 24 - sunset) // Maghrib → Tulu raat
  const midnight = sunset + night / 2 // Nisf-ul-Layl (sharahi aadhi raat)
  const lastthird = sunriseTomorrow - night / 3 // Tahajjud

  return {
    Fajr: fmtHMS(fajr),
    Sunrise: fmtHMS(sunrise),
    Dhuhr: fmtHMS(dhuhr),
    Asr: fmtHMS(asr),
    Maghrib: fmtHMS(sunset),
    Isha: fmtHMS(isha),
    Imsak: fmtHMS(imsak),
    Sunset: fmtHMS(sunset),
    Midnight: fmtHMS(midnight),
    Lastthird: fmtHMS(lastthird),
  }
}

/**
 * IST wall-clock "HH:MM:SS" (+IST date) → device-epoch Date.
 * Countdown ke liye — device TZ kuch bhi ho, IST hi sahi render hoga.
 */
export function istWallToDate(
  now: Date,
  hms: string,
  dayOffset = 0
): Date {
  const ist = new Date(now.getTime() + JUNAGADH.tzOffsetMin * 60_000)
  ist.setUTCDate(ist.getUTCDate() + dayOffset)
  const y = ist.getUTCFullYear()
  const mo = ist.getUTCMonth()
  const d = ist.getUTCDate()
  const t = parseHMS(hms)
  const hh = Number.isFinite(t) ? Math.floor(t) : 0
  const mm = Number.isFinite(t) ? Math.floor((t * 60) % 60) : 0
  const ss = Number.isFinite(t) ? Math.round((t * 3600) % 60) : 0
  return new Date(Date.UTC(y, mo, d, hh, mm, ss) - JUNAGADH.tzOffsetMin * 60_000)
}

/** IST "aaj" ki identity — midnight-rollover par auqaat refresh karne ke liye */
export function istDayKey(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + JUNAGADH.tzOffsetMin * 60_000)
  return `${ist.getUTCFullYear()}-${ist.getUTCMonth() + 1}-${ist.getUTCDate()}`
}
