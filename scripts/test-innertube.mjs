// InnerTube search test — verify YouTube WEB client search works + parser
const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'
const CLIENT_VERSION = '2.20250101.00.00'
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function collectVideos(node, videos, tokens, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 80) return
  if (Array.isArray(node)) {
    for (const item of node) collectVideos(item, videos, tokens, depth + 1)
    return
  }
  const vr = node.videoRenderer
  if (vr && typeof vr === 'object') {
    const videoId = typeof vr.videoId === 'string' ? vr.videoId : null
    const title = vr.title?.runs?.[0]?.text ?? vr.title?.accessibility?.accessibilityData?.label ?? null
    const channel =
      vr.ownerText?.runs?.[0]?.text ?? vr.longBylineText?.runs?.[0]?.text ?? vr.shortBylineText?.runs?.[0]?.text ?? null
    const badgeStyles = Array.isArray(vr.badges)
      ? vr.badges.map((b) => String(b?.metadataBadgeRenderer?.style ?? ''))
      : []
    const isLive = badgeStyles.some((s) => s.toUpperCase().includes('LIVE'))
    if (videoId && title && !isLive && !vr.upcomingEventData) {
      videos.push({ videoId, title, channel: channel || 'YouTube' })
    }
  }
  const token = node?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token
  if (typeof token === 'string' && token && !tokens.includes(token)) tokens.push(token)
  for (const key of Object.keys(node)) collectVideos(node[key], videos, tokens, depth + 1)
}

async function innertube(q, continuation = null) {
  const body = continuation
    ? { context: { client: { clientName: 'WEB', clientVersion: CLIENT_VERSION, hl: 'en', gl: 'IN' } }, continuation }
    : { context: { client: { clientName: 'WEB', clientVersion: CLIENT_VERSION, hl: 'en', gl: 'IN' } }, query: q }
  const res = await fetch(
    `https://www.youtube.com/youtubei/v1/search?key=${INNERTUBE_KEY}&prettyPrint=false`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': DESKTOP_UA,
        'Accept-Language': 'en-US,en;q=0.9,ur;q=0.8',
        'X-YouTube-Client-Name': '1',
        'X-YouTube-Client-Version': CLIENT_VERSION,
        Referer: 'https://www.youtube.com/',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    }
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const videos = []
  const tokens = []
  collectVideos(data, videos, tokens)
  return { count: videos.length, tokens: tokens.length, first: videos.slice(0, 5), continuation: tokens[0] ?? null }
}

// HTML scrape fallback test
async function scrape(q) {
  const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIQAQ%3D%3D&hl=en&gl=IN`, {
    headers: { 'User-Agent': DESKTOP_UA, 'Accept-Language': 'en-US,en;q=0.9', Cookie: 'SOCS=CAI; CONSENT=YES+cb' },
    signal: AbortSignal.timeout(20000),
  })
  const html = await res.text()
  const marker = 'var ytInitialData = '
  const start = html.indexOf(marker)
  if (start === -1) return { ok: false, htmlLen: html.length }
  const end = html.indexOf(';</script>', start + marker.length)
  const data = JSON.parse(html.slice(start + marker.length, end))
  const videos = []
  const tokens = []
  collectVideos(data, videos, tokens)
  return { ok: true, count: videos.length, first: videos.slice(0, 3) }
}

;(async () => {
  try {
    console.log('── InnerTube test: "old naat" ──')
    const r1 = await innertube('old naat')
    console.log(JSON.stringify(r1, null, 1).slice(0, 1200))

    console.log('\n── Pagination test (continuation) ──')
    if (r1.continuation) {
      const r2 = await innertube('old naat', r1.continuation)
      console.log('page2 count:', r2.count, 'new tokens:', r2.tokens)
    } else {
      console.log('koi continuation token nahi mila')
    }

    console.log('\n── HTML scrape fallback test ──')
    const r3 = await scrape('owais raza qadri naat')
    console.log(JSON.stringify(r3).slice(0, 600))
  } catch (e) {
    console.error('FAIL:', e.message)
    process.exit(1)
  }
})()
