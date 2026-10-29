// Qalb — GET /api/hijri
// Gujarat Chand Committee (gujchand.com) ki aaj ki Hijri date.
// Server-side fetch (site kuch clients ko block/slow karti hai — server se
// reliable hai) + in-memory cache: 6h TTL. Hijri date roz sirf 7 PM IST
// badalti hai isliye 6h cache kaafi hai aur quota-friendly bhi.

import { NextResponse } from 'next/server'
import { cacheGet, cacheSet } from '@/lib/search-cache'

const GUJCHAND_URL = 'https://gujchand.com/'
const CACHE_TTL = 6 * 60 * 60 * 1000 // 6h

interface HijriResponse {
  day: string
  monthEn: string
  monthNumber: number
  year: string
  gregorian: string
  source: 'gujchand.com'
  fetchedAt: string
}

const MONTH_MAP: Record<string, number> = {
  muharram: 1, moharram: 1, muharam: 1, safar: 2,
  'rabi-ul-awwal': 3, 'rabi ul awwal': 3, 'rabiulawwal': 3, 'rabi-al-awwal': 3,
  'rabi al awwal': 3,
  'rabi-ul-thani': 4, 'rabi ul thani': 4, 'rabiulakhir': 4, 'rabi-al-thani': 4,
  'rabi ul akhir': 4,
  'jamad-ul-awwal': 5, 'jamad ul awwal': 5, 'jamadulawwal': 5,
  'jumada al ula': 5, 'jumada-al-ula': 5, 'jumad ul awwal': 5,
  'jamadi ul awwal': 5, 'jumada al awwal': 5,
  'jamad-ul-thani': 6, 'jamad ul thani': 6, 'jamadulakhir': 6,
  'jumada al akhirah': 6, 'jumada-al-akhirah': 6, 'jumad ul akhir': 6,
  'jamadi ul akhir': 6, 'jumada al thani': 6,
  rajab: 7, shaban: 8, shaaban: 8, shabaan: 8,
  ramzan: 9, ramadan: 9, ramzaan: 9,
  shawwal: 10, shawaal: 10,
  zulqadah: 11, 'dhu al qadah': 11, 'dhul qadah': 11, 'zul qadah': 11,
  zilqad: 11,
  zulhijjah: 12, 'dhu al hijjah': 12, 'dhul hijjah': 12, 'zul hijjah': 12,
  zilhij: 12, zilhijjah: 12,
}

function monthNumber(name: string): number {
  const norm = name.toLowerCase().replace(/[^a-z' -]/g, '').replace(/\s+/g, ' ').trim()
  if (MONTH_MAP[norm]) return MONTH_MAP[norm]
  for (const [k, v] of Object.entries(MONTH_MAP)) {
    if (norm.startsWith(k.split(' ')[0]) && norm.includes(k.split('-').pop() ?? '')) return v
  }
  return 0
}

function parseHijri(html: string): Omit<HijriResponse, 'gregorian' | 'source' | 'fetchedAt'> | null {
  try {
    const text = html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;|&amp;|&#\d+;/g, ' ')
      .replace(/\s+/g, ' ')
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

async function fetchGujchand(): Promise<string> {
  const res = await fetch(GUJCHAND_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(12000),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`gujchand ${res.status}`)
  return await res.text()
}

export async function GET() {
  const cached = cacheGet<HijriResponse>('hijri:gujchand')
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'Cache-Control': 'public, max-age=1800' },
    })
  }

  try {
    const html = await fetchGujchand()
    const h = parseHijri(html)
    if (!h) throw new Error('parse fail')
    const out: HijriResponse = {
      ...h,
      gregorian: new Date().toISOString(),
      source: 'gujchand.com',
      fetchedAt: new Date().toISOString(),
    }
    cacheSet('hijri:gujchand', out, CACHE_TTL)
    return NextResponse.json(out, {
      headers: { 'Cache-Control': 'public, max-age=1800' },
    })
  } catch (e) {
    return NextResponse.json(
      { error: 'gujchand-unavailable', detail: e instanceof Error ? e.message : 'unknown' },
      { status: 502 }
    )
  }
}
