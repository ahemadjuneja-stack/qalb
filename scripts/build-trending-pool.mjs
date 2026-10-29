// InnerTube pool builder — verified Islamic naat/qawwali/hamd/nasheed videos
// collect karta hai (videoId + title + channel + viewCount). Ye output
// src/lib/trending-pool.ts generate karne ke liye hai.
const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'
const CLIENT_VERSION = '2.20250101.00.00'
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function collectVideos(node, videos, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 80) return
  if (Array.isArray(node)) {
    for (const item of node) collectVideos(item, videos, depth + 1)
    return
  }
  const vr = node.videoRenderer
  if (vr && typeof vr === 'object') {
    const videoId = typeof vr.videoId === 'string' ? vr.videoId : null
    const title =
      vr.title?.runs?.[0]?.text ?? vr.title?.accessibility?.accessibilityData?.label ?? null
    const channel =
      vr.ownerText?.runs?.[0]?.text ??
      vr.longBylineText?.runs?.[0]?.text ??
      vr.shortBylineText?.runs?.[0]?.text ??
      null
    // views parse: "12,345,678 views"
    const viewsText =
      vr.shortViewCountText?.simpleText ??
      vr.viewCountText?.simpleText ??
      vr.shortViewCountText?.runs?.[0]?.text ??
      ''
    const views = (() => {
      const m = String(viewsText).replace(/,/g, '').match(/(\d+)\s*(K|M|B)?/i)
      if (!m) return 0
      let n = Number(m[1])
      const suf = (m[2] || '').toUpperCase()
      if (suf === 'K') n *= 1_000
      if (suf === 'M') n *= 1_000_000
      if (suf === 'B') n *= 1_000_000_000
      return n
    })()
    const badgeStyles = Array.isArray(vr.badges)
      ? vr.badges.map((b) => String(b?.metadataBadgeRenderer?.style ?? ''))
      : []
    const isLive = badgeStyles.some((s) => s.toUpperCase().includes('LIVE'))
    if (videoId && title && !isLive && !vr.upcomingEventData) {
      videos.push({ videoId, title, channel: channel || 'YouTube', views })
    }
  }
  for (const key of Object.keys(node)) collectVideos(node[key], videos, depth + 1)
}

async function innertube(q) {
  const body = {
    context: { client: { clientName: 'WEB', clientVersion: CLIENT_VERSION, hl: 'en', gl: 'IN' } },
    query: q,
  }
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
  if (!res.ok) throw new Error(`HTTP ${res.status} for "${q}"`)
  const data = await res.json()
  const videos = []
  collectVideos(data, videos)
  return videos
}

// HARD block — non-Islamic marker (title/channel)
const HARD_BLOCK = [
  'bollywood', 'hollywood', 'movie', 'film', 'bhajan', 'mandir', 'mandal',
  'krishna', 'shiv', 'shiva', 'shankar', 'hanuman', 'ganesh', 'ganesha',
  'devi', 'mata ki', 'gurbani', 'guru nanak', 'gurdwara', 'sahib path',
  'aarti', 'chath', 'chhath', 'navratri', 'diwali', 'holi song', 'dj remix',
  'mashup', 'bhojpuri', 'haryanvi', 'punjabi song', 'hindi song', 'new song',
  'song 202', 'official video song', 'full song', 'music video song',
  'trailers', 'trailer', 'web series',
]

// Islamic markers — in words se koi ek hona chahiye
const ISLAMIC_MARKERS = [
  'naat', 'hamd', 'hamad', 'qawwali', 'qawali', 'kawwali', 'nasheed', 'nashid',
  'noha', 'manqabat', 'marsiya', 'sufi', 'kalam', 'kalaam', 'islamic', 'islam',
  'deen', 'durood', 'darood', 'salawat', 'azan', 'adhan', 'namaz', 'ramzan',
  'ramadan', 'eid', 'milad', 'khwaja', 'gharib nawaz', 'ajmer', 'madina',
  'madinah', 'makkah', 'mecca', 'kaaba', 'haram', 'masjid', 'nabi', 'rasool',
  'rasul', 'mustafa', 'muhammad', 'mohammad', 'mohammed', 'allah', 'allahu',
  'rabb', 'maula', 'hussain', 'quran', 'surah', 'dua', 'hafiz', 'qari',
  'tilawat', 'qirat', 'hadith', 'tajdar', 'tajdaar', 'ghaus', 'ya ali',
  'mast qalandar', 'qalandar', 'bulleh shah', 'bulleya', 'sultan bahu',
  'amir khusrau', 'khusrau', 'kabir', 'waris shah', 'jhoole laal', 'lal meri',
  'chaap tilak', 'damadam', 'dama dam', 'ali da', 'shan e', 'shah e',
  'ya rasool', 'ya nabi', 'lam yati', 'hasbi rabbi', 'ya munir', 'burdah',
  'burda', 'mawlid', 'mehfil e', 'owais raza', 'nusrat', 'rahat fateh',
  'amjad sabri', 'sabri brothers', 'atif aslam', 'maher zain', 'sami yusuf',
  'abida parveen', 'wadali', 'qadri', 'naqshband',
  'rizwan', 'muazzam', 'fareed ayaz', 'tahir qawwal', 'nizami brothers',
  'qutbi brothers', 'hyderabadi', 'aziz mian', 'bari sarkar', 'data diwane',
]

function isIslamic(title, channel) {
  const hay = `${title} ${channel}`.toLowerCase()
  if (HARD_BLOCK.some((w) => hay.includes(w))) return false
  return ISLAMIC_MARKERS.some((w) => hay.includes(w))
}

const QUERIES = [
  'best naat sharif',
  'top qawwali sufi',
  'nusrat fateh ali khan qawwali',
  'owais raza qadri naat',
  'amjad sabri qawwali',
  'rahat fateh ali khan qawwali',
  'maher zain nasheed',
  'sami yusuf nasheed',
  'abida parveen sufi',
  'abdul rahman al shahat? no',
  'hamd e bari taala',
  'famous naat',
  'sufi kalam',
  'abida parveen sufi',
  'sabri brothers qawwali',
  'wadali brothers sufi',
  'aziz mian qawwali',
  'best hamd',
  'urdu naat',
  'panjabi naat',
]

;(async () => {
  const all = new Map()
  for (const q of QUERIES) {
    if (q.includes('?')) continue // typo guard
    try {
      const vids = await innertube(q)
      let kept = 0
      for (const v of vids) {
        if (!isIslamic(v.title, v.channel)) continue
        const prev = all.get(v.videoId)
        if (!prev || v.views > prev.views) all.set(v.videoId, v)
        kept++
      }
      console.error(`  ${q}: ${vids.length} raw, ${kept} islamic (pool=${all.size})`)
    } catch (e) {
      console.error(`  ${q}: FAIL ${e.message}`)
    }
  }
  const list = [...all.values()].sort((a, b) => b.views - a.views)
  console.log(JSON.stringify(list.slice(0, 60), null, 1))
})()
