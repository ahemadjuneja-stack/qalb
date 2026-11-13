// E2E sanity — naya trending pipeline (bun)
// Famous-artist DIRECT queries + month window (viewCount+30d) +
// islamic filter + famous-first ranking — wahi jo live-catalog.ts
// getLiveFeed ab karta hai. Real YouTube Data API par verify.
import { readFileSync } from 'node:fs'
import { ytSearch, type DataVideo } from '../src/lib/yt-data'
import { famousScore } from '../src/lib/famous-channels'
import { isBlockedResultX, hasIslamicMarker } from '../src/lib/result-filter'

// key — repo-committed Firebase web key (v0.5.39 se Data API allowed)
// (ytApiKey() call-time par env padhta hai — pehle set kar do)
process.env.YOUTUBE_API_KEY = readFileSync('.firebase/web-apikey.txt', 'utf8').trim()

// live-catalog.ts ke TREND_QUERIES ka subset (quota bacha ke sample)
const TREND_QUERIES_SAMPLE = [
  'owais raza qadri new naat',
  'hafiz ahmed raza qadri new naat',
  'rahat fateh ali khan qawwali',
  'bukhari studio new naat',
]

async function main() {
  const all: DataVideo[] = []
  for (const q of TREND_QUERIES_SAMPLE) {
    const page = await ytSearch(q, {
      order: 'viewCount',
      publishedAfterDays: 30,
      maxResults: 25,
      type: 'video',
    })
    if (!page) {
      console.log(`FAIL: "${q}" — API call null (key/quota?)`)
      process.exit(1)
    }
    console.log(`"${q}": ${page.videos.length} videos`)
    all.push(...page.videos)
  }

  // islamicOnly replica (result-filter se, same logic)
  const islamic = all.filter((v) => {
    const text = `${v.title} ${v.channel}`.toLowerCase()
    return !isBlockedResultX(text) && hasIslamicMarker(text)
  }).filter((v) => (v.views || 0) > 0)

  // famous-first + famous>=8 preference (live-catalog jaisa)
  const ranked = [...islamic].sort((a, b) => {
    const fa = famousScore({ title: a.title, artist: a.channel } as never)
    const fb = famousScore({ title: b.title, artist: b.channel } as never)
    if (fa !== fb) return fb - fa
    return (b.views || 0) - (a.views || 0)
  })
  const famousCount = ranked.filter(
    (v) => famousScore({ title: v.title, artist: v.channel } as never) > 0
  ).length
  const top = (famousCount >= 8 ? ranked.filter(
    (v) => famousScore({ title: v.title, artist: v.channel } as never) > 0
  ) : ranked).slice(0, 10)

  console.log(`\nislamic-filtered: ${islamic.length}/${all.length} — famous: ${famousCount}`)
  console.log('=== TRENDING (naya pipeline) — top 10 ===')
  top.forEach((v, i) => {
    const s = famousScore({ title: v.title, artist: v.channel } as never)
    console.log(
      `${i + 1}. [score ${s}] ${v.views.toLocaleString()} views — ${v.title.slice(0, 58)} — ${v.channel.slice(0, 30)}`
    )
  })
  process.exit(0)
}

main().catch((e) => {
  console.error('E2E FAIL:', e.message)
  process.exit(1)
})
