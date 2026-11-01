'use client'

// Qalb — Track Audio Stream URL (v0.5.28)
// ─────────────────────────────────────────────────────────────────
// Offline download ke liye ASLI audio stream URL nikaalta hai.
// reels.ts ka live-verified InnerTube pattern (ANDROID_VR client —
// test: itag HTTP 206 verified) wesa hi yahan use hota hai, bas
// AUDIO-ONLY format preference ke saath:
//
//   1. adaptiveFormats me audio/mp4 (itag 140 ≈ 128kbps m4a) —
//      sabse chhoti file, sirf awaaz
//   2. fallback: progressive itag 18 (360p mp4, video+audio) —
//      file badi par hamesha chalega
//
// googlevideo URL direct download karta hai (CapacitorHttp = CORS
// bypass). Fail hone par reason wapas — UI saaf message dikha sakta hai.

import { innertubePostJson } from '@/lib/youtube-search-source'

export type AudioStreamFailReason = 'network' | 'blocked' | 'none'

// reels.ts jaise hi clients — ANDROID_VR primary (bina login chalta hai),
// 1.61.34 + purana ANDROID fallback
const CLIENT_TRIES = [
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
  {
    key: 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w',
    headers: {
      'User-Agent':
        'com.google.android.apps.youtube.vr.oculus/1.61.34 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
      'X-YouTube-Client-Name': '28',
      'X-YouTube-Client-Version': '1.61.34',
    },
    client: {
      clientName: 'ANDROID_VR',
      clientVersion: '1.61.34',
      androidSdkVersion: 32,
      deviceModel: 'Quest 3',
      hl: 'en',
      gl: 'IN',
    },
  },
  {
    key: 'AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w',
    headers: {
      'User-Agent': 'com.google.android.youtube/19.09.37 (Linux; U; Android 14) gzip',
      'X-YouTube-Client-Name': '3',
      'X-YouTube-Client-Version': '19.09.37',
    },
    client: {
      clientName: 'ANDROID',
      clientVersion: '19.09.37',
      androidSdkVersion: 34,
      hl: 'en',
      gl: 'IN',
    },
  },
]

/* eslint-disable @typescript-eslint/no-explicit-any */

// audio/mp4 (m4a) — sabse badi bitrate wali audio-only format
function pickAudioUrl(data: any): string | null {
  const adaptive = data?.streamingData?.adaptiveFormats
  if (Array.isArray(adaptive)) {
    const audio = adaptive.filter(
      (f: any) =>
        f &&
        typeof f.url === 'string' &&
        String(f.mimeType ?? '').includes('audio/mp4')
    )
    if (audio.length) {
      audio.sort(
        (a: any, b: any) => Number(b.bitrate ?? 0) - Number(a.bitrate ?? 0)
      )
      return String(audio[0].url)
    }
  }
  // fallback — progressive mp4 (video+audio) se awaaz mil jayegi
  const formats = data?.streamingData?.formats
  if (Array.isArray(formats)) {
    const usable = formats.filter(
      (f: any) => f && typeof f.url === 'string' && String(f.mimeType ?? '').includes('mp4')
    )
    if (usable.length) {
      const pick18 = usable.find((f: any) => f.itag === 18)
      const pick22 = usable.find((f: any) => f.itag === 22)
      return String((pick18 ?? pick22 ?? usable[0]).url)
    }
  }
  return null
}

// null = try nahi hua (network), 'BLOCKED' = YouTube ne mana kiya,
// string = asli audio URL
async function tryClient(
  t: (typeof CLIENT_TRIES)[number],
  videoId: string
): Promise<string | 'BLOCKED' | null> {
  const data = await innertubePostJson(
    `https://www.youtube.com/youtubei/v1/player?key=${t.key}&prettyPrint=false`,
    t.headers,
    {
      context: { client: t.client },
      videoId,
      contentCheckOk: true,
      racyCheckOk: true,
    }
  ).catch(() => null)
  if (!data) return null // network fail
  // CapacitorHttp kabhi-kabhi JSON string deta hai — defensive
  const parsed = typeof data === 'string' ? safeParse(data) : data
  if (!parsed) return null
  const status = String(parsed?.playabilityStatus?.status ?? '')
  if (status && status !== 'OK') return 'BLOCKED' // LOGIN_REQUIRED = bot-check
  return pickAudioUrl(parsed) // mila / format nahi mila
}

function safeParse(s: string): any | null {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}

// 20 min cache — ek video ka URL dobara download me dobara fetch na ho
// (googlevideo URL ~6 ghante valid rehta hai)
const urlCache = new Map<string, string>()

export async function getTrackAudioUrl(videoId: string): Promise<{
  url: string | null
  reason: AudioStreamFailReason
}> {
  const cached = urlCache.get(videoId)
  if (cached) return { url: cached, reason: 'none' }

  let sawNetworkFail = false
  let sawBlocked = false

  for (const t of CLIENT_TRIES) {
    const res = await tryClient(t, videoId)
    if (res && res !== 'BLOCKED') {
      urlCache.set(videoId, res)
      return { url: res, reason: 'none' }
    }
    if (res === 'BLOCKED') sawBlocked = true
    else sawNetworkFail = true
  }

  // flaky network — ruk kar primary client ek baar aur
  if (sawNetworkFail && !sawBlocked) {
    await new Promise((r) => setTimeout(r, 1500))
    const retry = await tryClient(CLIENT_TRIES[0], videoId)
    if (retry && retry !== 'BLOCKED') {
      urlCache.set(videoId, retry)
      return { url: retry, reason: 'none' }
    }
  }

  return { url: null, reason: sawBlocked ? 'blocked' : sawNetworkFail ? 'network' : 'none' }
}
