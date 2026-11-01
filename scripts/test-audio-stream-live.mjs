// Live test — InnerTube ANDROID_VR player se audio-only URL nikaal ke
// HEAD request se verify (HTTP 200/206 = URL zinda)
const CLIENTS = [
  {
    key: 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w',
    headers: {
      'User-Agent':
        'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
      'X-YouTube-Client-Name': '28',
      'X-YouTube-Client-Version': '1.60.19',
    },
    client: {
      clientName: 'ANDROID_VR',
      clientVersion: '1.60.19',
      androidSdkVersion: 32,
      deviceModel: 'Quest 3',
      hl: 'en',
      gl: 'IN',
    },
  },
]

function pickAudioUrl(data) {
  const adaptive = data?.streamingData?.adaptiveFormats
  if (Array.isArray(adaptive)) {
    const audio = adaptive.filter(
      (f) => f && typeof f.url === 'string' && String(f.mimeType ?? '').includes('audio/mp4')
    )
    if (audio.length) {
      audio.sort((a, b) => Number(b.bitrate ?? 0) - Number(a.bitrate ?? 0))
      return String(audio[0].url)
    }
  }
  const formats = data?.streamingData?.formats
  if (Array.isArray(formats)) {
    const usable = formats.filter(
      (f) => f && typeof f.url === 'string' && String(f.mimeType ?? '').includes('mp4')
    )
    if (usable.length) {
      const pick18 = usable.find((f) => f.itag === 18)
      const pick22 = usable.find((f) => f.itag === 22)
      return String((pick18 ?? pick22 ?? usable[0]).url)
    }
  }
  return null
}

async function playerCall(videoId) {
  const t = CLIENTS[0]
  const res = await fetch(
    `https://www.youtube.com/youtubei/v1/player?key=${t.key}&prettyPrint=false`,
    {
      method: 'POST',
      headers: { ...t.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: { client: t.client },
        videoId,
        contentCheckOk: true,
        racyCheckOk: true,
      }),
      signal: AbortSignal.timeout(15000),
    }
  )
  const data = await res.json()
  return data
}

async function main() {
  // 1) search se ek asli naat videoId lo
  const sres = await fetch(
    'https://www.youtube.com/youtubei/v1/search?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8&prettyPrint=false',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: { client: { clientName: 'WEB', clientVersion: '2.20261001.01.00', hl: 'en', gl: 'IN' } },
        query: 'tajdar e haram qawwali',
        contentCheckOk: true,
      }),
      signal: AbortSignal.timeout(15000),
    }
  )
  const sdata = await sres.json()
  let videoId = null
  const walk = (n) => {
    if (!n || typeof n !== 'object' || videoId) return
    if (n.videoRenderer?.videoId) {
      videoId = n.videoRenderer.videoId
      return
    }
    for (const k of Object.keys(n)) walk(n[k])
  }
  walk(sdata)
  console.log('SEARCH videoId:', videoId)
  if (!videoId) process.exit(1)

  // 2) player endpoint se audio URL
  const data = await playerCall(videoId)
  const status = data?.playabilityStatus?.status
  const adaptiveCount = data?.streamingData?.adaptiveFormats?.length ?? 0
  const formatsCount = data?.streamingData?.formats?.length ?? 0
  console.log('PLAYABILITY:', status, '| adaptiveFormats:', adaptiveCount, '| formats:', formatsCount)

  const url = pickAudioUrl(data)
  if (!url) {
    console.log('RESULT: FAIL — koi url nahi mila')
    process.exit(1)
  }
  const isAudioOnly = url.includes('mime=audio') || /mimeType/.test('')
  console.log('PICKED URL itag/mime:', (url.match(/itag=(\d+)/) || [])[1], decodeURIComponent((url.match(/mime=([^&]+)/) || [])[1] ?? ''))

  // 3) URL zinda hai? — HEAD + Range probe
  const probe = await fetch(url, {
    method: 'GET',
    headers: { Range: 'bytes=0-1023' },
    signal: AbortSignal.timeout(15000),
  })
  console.log('PROBE HTTP:', probe.status, '| content-type:', probe.headers.get('content-type'), '| len:', probe.headers.get('content-range') ?? probe.headers.get('content-length'))
  const buf = await probe.arrayBuffer()
  console.log('PROBE BYTES:', buf.byteLength)
  console.log(probe.status === 206 || probe.status === 200 ? 'RESULT: PASS ✅' : 'RESULT: FAIL ❌')
}

main().catch((e) => {
  console.error('TEST ERROR:', e.message)
  process.exit(1)
})
