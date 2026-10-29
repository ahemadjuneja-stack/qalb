// Qalb — Gujarat Chand Committee hijri date (gujchand.com)
// ─────────────────────────────────────────────────────────────────
// User requirement: Hijri date GUJARAT CHAND COMMITTEE ke hisaab se
// AUTOMATIC change ho (https://gujchand.com/). Unki site roz 7:00 PM
// chand status update karti hai (e.g. "17 Jamad-ul-awwal 1448 Hijri").
//
// Chain (har fail par agla):
//   1. Native (APK): CapacitorHttp DIRECT gujchand.com — CORS nahi lagta
//   2. Web: hosted /api/hijri (server-side fetch + cache)
//   3. localStorage cache (last successful sync)
//   4. null → caller umalqura + manual ruyat adjust use karega
//
// Offline-first: cache me "fetchedOn" date hoti hai — aaj ki fetch fail
// ho to kal ki cache dikhti hai (hijri date sirf 7 PM par badalti hai).

import { QALB } from '@/lib/qalb'

export interface GujchandHijri {
  day: string // "17"
  monthEn: string // "Jamad-ul-awwal"
  monthNumber: number // 5
  year: string // "1448"
  fetchedOn: string // "2026-10-29" (cache freshness)
  source: 'live' | 'cache'
}

const CACHE_KEY = 'qalb_gujchand_v1'
const GUJCHAND_URL = 'https://gujchand.com/'

// gujchand.com ke month spellings → number (flexible matching ke liye
// har islamic month ke common variants included)
const MONTH_MAP: Record<string, number> = {
  muharram: 1, moharram: 1, muharam: 1,
  safar: 2,
  'rabi-ul-awwal': 3, 'rabi ul awwal': 3, 'rabiulawwal': 3,
  'rabi-al-awwal': 3, 'rabbi ul awwal': 3, 'rabi al awwal': 3,
  'rabi-ul-thani': 4, 'rabi ul thani': 4, 'rabiulakhir': 4,
  'rabi-al-thani': 4, 'rabi ul akhir': 4, 'rabiulawal': 3,
  'jamad-ul-awwal': 5, 'jamad ul awwal': 5, 'jamadulawwal': 5,
  'jumada al ula': 5, 'jumada-al-ula': 5, 'jumad ul awwal': 5,
  'jamadi ul awwal': 5, 'jamad-al-oola': 5, 'jumada al awwal': 5,
  'jamad-ul-thani': 6, 'jamad ul thani': 6, 'jamadulakhir': 6,
  'jumada al akhirah': 6, 'jumada-al-akhirah': 6, 'jumad ul akhir': 6,
  'jamadi ul akhir': 6, 'jumada al thani': 6,
  rajab: 7,
  'shaban': 8, "sha'ban": 8, shaaban: 8, shabaan: 8,
  ramzan: 9, ramadan: 9, ramzaan: 9,
  shawwal: 10, shawaal: 10,
  'zulqadah': 11, 'zul-qa-dah': 11, 'dhu al qadah': 11, 'dhul qadah': 11,
  'zul qadah': 11, 'zilqad': 11, 'dhu al qi dah': 11,
  'zulhijjah': 12, 'dhu al hijjah': 12, 'dhul hijjah': 12,
  'zul hijjah': 12, 'zilhij': 12, 'zilhijjah': 12,
}

function monthNumber(name: string): number {
  const norm = name.toLowerCase().replace(/[^a-z' -]/g, '').replace(/\s+/g, ' ').trim()
  if (MONTH_MAP[norm]) return MONTH_MAP[norm]
  // fuzzy: prefix match (site kabhi "Jamad-ul-awwal" kabhi "Jamadulawwal")
  for (const [k, v] of Object.entries(MONTH_MAP)) {
    if (norm.startsWith(k.split(' ')[0]) && norm.includes(k.split('-').pop() ?? '')) return v
  }
  return 0
}

/** gujchand.com HTML se "17 Jamad-ul-awwal 1448 Hijri" parse karta hai */
export function parseGujchandHtml(html: string): Omit<GujchandHijri, 'fetchedOn' | 'source'> | null {
  try {
    // HTML entities strip + tags strip
    const text = html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;|&amp;|&#\d+;/g, ' ')
      .replace(/\s+/g, ' ')
    // pattern: "17 Jamad-ul-awwal 1448 Hijri" (day month year "Hijri")
    const m = text.match(/(\d{1,2})\s*([A-Za-z][A-Za-z'\- ]{2,25}?)\s*[, ]?\s*(\d{4})\s*Hijri/i)
    if (!m) return null
    const day = m[1]
    const monthEn = m[2].trim()
    const mn = monthNumber(monthEn)
    if (!mn || Number(day) < 1 || Number(day) > 30) return null
    return { day, monthEn, monthNumber: mn, year: m[3] }
  } catch {
    return null
  }
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function readCache(): GujchandHijri | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as GujchandHijri
    if (!c.day || !c.monthNumber || !c.year) return null
    return { ...c, source: 'cache' }
  } catch {
    return null
  }
}

function writeCache(h: Omit<GujchandHijri, 'fetchedOn' | 'source'>) {
  try {
    const rec: GujchandHijri = { ...h, fetchedOn: todayStr(), source: 'live' }
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(rec))
  } catch {
    /* quota — ignore */
  }
}

async function fetchViaNative(): Promise<string | null> {
  try {
    const { CapacitorHttp } = await import('@capacitor/core')
    const res = await CapacitorHttp.get({
      url: GUJCHAND_URL,
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android) AppleWebKit/537.36', Accept: 'text/html' },
      connectTimeout: 8000,
      readTimeout: 15000,
      responseType: 'text',
    })
    if (res.status >= 200 && res.status < 300) {
      return typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
    }
    return null
  } catch {
    return null
  }
}

async function fetchViaHosted(): Promise<string | null> {
  try {
    const res = await fetch(`${QALB.apiBase}/api/hijri`, {
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      day?: string
      monthEn?: string
      monthNumber?: number
      year?: string
    }
    if (data.day && data.monthEn && data.year) {
      return `${data.day} ${data.monthEn} ${data.year} Hijri`
    }
    return null
  } catch {
    return null
  }
}

/**
 * Gujarat Chand Committee hijri date — live fetch (native direct ya hosted
 * API), fail hone par localStorage cache, warna null (caller fallback).
 * Har call par max 1 network attempt — UI turant render ho sake.
 */
export async function getGujchandHijri(): Promise<GujchandHijri | null> {
  // 1) native direct (APK) — CORS bypass
  let html: string | null = null
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (Capacitor.isNativePlatform?.()) {
      html = await fetchViaNative()
    }
  } catch {
    /* not native */
  }

  // 2) hosted /api/hijri (web ya native fallback)
  if (!html) {
    const parsed = await fetchViaHosted()
    if (parsed) {
      const h = parseGujchandHtml(parsed)
      if (h) {
        writeCache(h)
        return { ...h, fetchedOn: todayStr(), source: 'live' }
      }
    }
  }

  // 3) direct HTML parse (native ya hosted raw html)
  if (html) {
    const h = parseGujchandHtml(html)
    if (h) {
      writeCache(h)
      return { ...h, fetchedOn: todayStr(), source: 'live' }
    }
  }

  // 4) cache — last successful sync
  return readCache()
}
