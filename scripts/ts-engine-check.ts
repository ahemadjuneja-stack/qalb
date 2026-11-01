// TS engine validation — Python-prototype se exact match + Dawat reference check.
// Run: npx tsx scripts/ts-engine-check.ts
import { junagadhPrayerTimes, istWallToDate } from '../src/lib/prayer-times'

function istDate(y: number, m: number, d: number): Date {
  // IST wall date → device-epoch anchor (dopahar 12:00 IST)
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0) - 330 * 60_000)
}

const DAWAT_REF: Record<string, string> = {
  Fajr: '05:36:09',
  Sunrise: '06:50:21',
  Dhuhr: '12:31:42',
  Asr: '16:36:35',
  Maghrib: '18:12:48',
  Isha: '19:27:00',
}

const PY_EXPECT: Record<string, Record<string, string>> = {
  // Python engine (validated) — HH:MM:SS
  '2026-11-02': {
    Fajr: '05:36:09', Sunrise: '06:50:07', Dhuhr: '12:31:44',
    Asr: '16:36:24', Maghrib: '18:13:06', Isha: '19:27:03',
  },
}

const sec = (s: string) => {
  const [h, m, x] = s.split(':').map(Number)
  return h * 3600 + m * 60 + x
}

let fail = 0

// 1) Dawat reference — har namaz SAME MINUTE hona chahiye (±30s)
const t = junagadhPrayerTimes(istDate(2026, 11, 2))
console.log('Dawat-e-Islami match check (02-11-2026):')
for (const k of Object.keys(DAWAT_REF)) {
  const mine = t[k as keyof typeof t] as string
  const d = sec(mine) - sec(DAWAT_REF[k])
  const ok = Math.abs(d) <= 30
  if (!ok) fail++
  console.log(
    `  ${ok ? 'OK ' : '>>> '}${k.padEnd(8)} engine=${mine}  dawat=${DAWAT_REF[k]}  diff=${d >= 0 ? '+' : ''}${d}s`
  )
}

// 2) Python-prototype exact match
console.log('\nPython prototype match check:')
for (const [date, exp] of Object.entries(PY_EXPECT)) {
  const [y, m, d] = date.split('-').map(Number)
  const tt = junagadhPrayerTimes(istDate(y, m, d))
  for (const k of Object.keys(exp)) {
    const mine = tt[k as keyof typeof tt] as string
    const ok = mine === exp[k]
    if (!ok) fail++
    console.log(`  ${ok ? 'OK ' : '>>> '}${date} ${k.padEnd(8)} ts=${mine}  py=${exp[k]}`)
  }
}

// 3) Extended auqaat sanity (02-11-2026): Imsak 05:26, Midnight ~00:31-00:32, Tahajjud ~02:38-02:39
console.log('\nExtended auqaat (02-11-2026):')
console.log(
  `  Imsak=${t.Imsak} (expect 05:26:09)  Midnight=${t.Midnight} (expect ~00:31:56)  Tahajjud=${t.Lastthird} (expect ~02:38:44)`
)

// 4) istWallToDate sanity: 05:36:09 IST 02-11-2026 → epoch check
const inst = istWallToDate(istDate(2026, 11, 2), t.Fajr)
const istView = new Date(inst.getTime() + 330 * 60_000)
const p = (n: number) => String(n).padStart(2, '0')
const rendered = `${p(istView.getUTCHours())}:${p(istView.getUTCMinutes())}:${p(istView.getUTCSeconds())}`
const ok = rendered === t.Fajr
if (!ok) fail++
console.log(`\nistWallToDate: ${rendered} (expect ${t.Fajr}) ${ok ? 'OK' : '>>>'}`)

console.log(fail === 0 ? '\nALL CHECKS PASSED ✅' : `\n${fail} CHECKS FAILED ❌`)
process.exit(fail === 0 ? 0 : 1)
