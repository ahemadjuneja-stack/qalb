// Sanity test — famous-channels.ts matching logic (bun)
import { famousScore, rankFamousFirst, famousOnly } from '../src/lib/famous-channels'

const cases: Array<[string, string, number]> = [
  // [artist/channel, title, expected score]
  ['Alhaj Owais Raza Qadri Official', 'New Naat 2026', 2],
  ['Bukhari Studio', 'Brand New Naat', 2],
  ['HI-TECH ISLAMIC', 'kalam', 2],
  ['Random Vlogs TV', 'Owais Raza Qadri ki nayi naat', 1],
  ['Naat Central', 'Nusrat Fateh Ali Khan - Tumhein Dillagi (new mix)', 1],
  ['Music Daily', 'top 10 songs', 0],
  ['Amjad Fareed Sabri', 'Bhar Do Jholi', 2],
  ['Qawwal Party', 'Hafiz Ahmed Raza Qadri new kalam 2026', 1],
  ['Wadali Brothers Sufi', 'Tu Mane Ya Na Mane', 2],
  ['tech reviews', 'mobile unboxing', 0],
]

let fail = 0
for (const [artist, title, expected] of cases) {
  const got = famousScore({ title, artist } as never)
  const ok = got === expected
  if (!ok) fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  score=${got} (expected ${expected})  [${artist}] "${title}"`)
}

// ranking check — famous non-famous mix
const tracks = [
  { videoId: 'a', title: 'random naat', artist: 'xyz channel', playCount: 9_000_000 },
  { videoId: 'b', title: 'new kalam', artist: 'Owais Raza Qadri Official', playCount: 50_000 },
  { videoId: 'c', title: 'naat', artist: 'abc', playCount: 5_000_000 },
  { videoId: 'd', title: 'Hafiz Ahmed Raza Qadri new naat', artist: 'studio 9', playCount: 80_000 },
] as never[]
const ranked = rankFamousFirst(tracks as never) as Array<{ videoId: string }>
const order = ranked.map((t) => t.videoId).join(',')
console.log(`rank order: ${order} (expected b,d,a,c — famous pehle, views desc)`)
if (order !== 'b,d,a,c') fail++

const famous = famousOnly(tracks as never) as Array<{ videoId: string }>
console.log(`famousOnly count: ${famous.length} (expected 2)`)
if (famous.length !== 2) fail++

console.log(fail === 0 ? 'ALL TESTS PASS' : `${fail} FAILURES`)
process.exit(fail === 0 ? 0 : 1)
