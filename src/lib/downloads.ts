'use client'

// Qalb — Offline Download Handler (v0.5.28 — ASLI DOWNLOAD)
// ─────────────────────────────────────────────────────────────────
// Pehle (≤0.5.27): fake tha — web fallback sirf metadata save karta tha,
// native path ek non-existent /api/download route hit karta tha. User
// report: "use dabane se offline download hota nahi hai".
//
// AB ASLI: audio-stream.ts se InnerTube (ANDROID_VR, live-verified)
// ke through googlevideo audio URL milta hai → CapacitorHttp se poori
// audio file download hoti hai (CORS bypass) → @capacitor/filesystem
// se device par Documents/Qalb/{videoId}.m4a me save → record me ASLI
// size (bytes/1MB). Net band hone par bhi yehi file local player se
// bajti hai (player-provider getLocalAudioSrc use karta hai).
//
// Web (browser dev): googlevideo CORS ki wajah se file save shayad na
// ho — tab metadata-only record banta hai (demo, `offline: false`).

import type { QalbTrack, SavedDownload } from '@/lib/types'
import { getTrackAudioUrl } from '@/lib/audio-stream'

const DOWNLOADS_KEY = 'qalb_downloads_v1'

// is se chhoti audio file = kharab/broken download — save hi mat karo
const MIN_BYTES = 100 * 1024

export function isNativeCapacitor(): boolean {
  if (typeof window === 'undefined') return false
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor
  return Boolean(cap?.isNativePlatform?.())
}

export function getDownloads(): SavedDownload[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(DOWNLOADS_KEY)
    return raw ? (JSON.parse(raw) as SavedDownload[]) : []
  } catch {
    return []
  }
}

function saveDownloads(list: SavedDownload[]): void {
  try {
    window.localStorage.setItem(DOWNLOADS_KEY, JSON.stringify(list))
  } catch {
    /* quota — ignore */
  }
}

export function isDownloaded(trackId: string): boolean {
  return getDownloads().some((d) => d.trackId === trackId)
}

export function getDownloadedByVideo(videoId: string): SavedDownload | null {
  return getDownloads().find((d) => d.videoId === videoId) ?? null
}

// ── local file src (offline playback ke liye) ─────────────────────
// v0.5.28: Directory.Data (app-internal) — Android 10+ par public
// Documents ke liye permission NAHI hai (manifest me nahi), Data
// hamesha writable hota hai. convertFileSrc se WebView usable src.
// Result cache — baar-baar getUri na ho.
const localSrcCache = new Map<string, string>()

export async function getLocalAudioSrc(videoId: string): Promise<string | null> {
  if (!isNativeCapacitor()) return null
  const cached = localSrcCache.get(videoId)
  if (cached) return cached
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const { Capacitor } = await import('@capacitor/core')
    const res = await Filesystem.getUri({
      path: `Qalb/${videoId}.m4a`,
      directory: Directory.Data,
    })
    const src = Capacitor.convertFileSrc(res.uri)
    localSrcCache.set(videoId, src)
    return src
  } catch {
    return null
  }
}

// cache invalidation — download/remove ke baad
function invalidateLocalSrc(videoId: string): void {
  localSrcCache.delete(videoId)
}

function pathCandidates(trackId: string, videoId: string): string[] {
  // videoId canonical — trackId purana legacy path (≤0.5.27 me banta tha)
  const set = new Set([`Qalb/${videoId}.m4a`, `Qalb/${trackId}.m4a`])
  return [...set]
}

export async function removeDownload(trackId: string): Promise<void> {
  const record = getDownloads().find((d) => d.trackId === trackId)
  const list = getDownloads().filter((d) => d.trackId !== trackId)
  saveDownloads(list)

  if (isNativeCapacitor()) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem')
      for (const p of pathCandidates(trackId, record?.videoId ?? trackId)) {
        // Data (naya canonical) + Documents (≤0.5.27 legacy path) — dono try
        await Filesystem.deleteFile({ path: p, directory: Directory.Data }).catch(
          () => undefined
        )
        await Filesystem.deleteFile({ path: p, directory: Directory.Documents }).catch(
          () => undefined
        )
      }
      if (record) invalidateLocalSrc(record.videoId)
    } catch {
      /* plugin web build me available nahi — ignore */
    }
  }
}

export interface DownloadProgress {
  (percent: number, note?: string): void
}

export async function downloadTrack(
  track: QalbTrack,
  onProgress?: DownloadProgress
): Promise<SavedDownload> {
  const existing = getDownloads().find((d) => d.trackId === track.id)
  if (existing) return existing

  const baseRecord = (sizeMB: number, offline: boolean): SavedDownload => ({
    trackId: track.id,
    videoId: track.videoId,
    title: track.title,
    artist: track.artist,
    thumbnailUrl: track.thumbnailUrl,
    savedAt: new Date().toISOString(),
    sizeMB,
    offline,
  })

  if (isNativeCapacitor()) {
    // ── Native path: InnerTube URL → CapacitorHttp → Filesystem ──
    try {
      onProgress?.(6, 'Audio link le rahe hain…')
      const { url, reason } = await getTrackAudioUrl(track.videoId)
      if (!url) {
        throw new Error(
          reason === 'blocked'
            ? 'YouTube ne is kalam ka download block kiya'
            : 'Net slow hai — audio link nahi mila'
        )
      }
      onProgress?.(18, 'Audio download ho rahi hai…')

      const { CapacitorHttp } = await import('@capacitor/core')
      const response = await CapacitorHttp.get({
        url, // absolute googlevideo URL — CORS bypass native se
        responseType: 'arraybuffer',
        connectTimeout: 15000,
        readTimeout: 120000,
      })
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Audio download fail (HTTP ${response.status})`)
      }

      const buffer = response.data as unknown as ArrayBuffer
      const byteLen =
        buffer instanceof ArrayBuffer
          ? buffer.byteLength
          : Number(response.headers?.['Content-Length'] ?? 0)
      if (!byteLen || byteLen < MIN_BYTES) {
        throw new Error('Audio file adhoori mili — dobara koshish karein')
      }
      onProgress?.(72, 'Device me save ho rahi hai…')

      const base64 = arrayBufferToBase64(buffer)
      const { Filesystem, Directory } = await import('@capacitor/filesystem')
      await Filesystem.writeFile({
        path: `Qalb/${track.videoId}.m4a`,
        data: base64,
        directory: Directory.Data, // app-internal — permission-free, hamesha writable
        recursive: true,
      })
      onProgress?.(100, 'Ho gaya')

      const sizeMB = Math.round((byteLen / (1024 * 1024)) * 10) / 10
      const record = baseRecord(sizeMB, true)
      saveDownloads([record, ...getDownloads()])
      return record
    } catch (err) {
      // native fail — UI ko saaf wajah dikhani hai, chup-chaap demo save
      // NAHI karte (user ne "fake download" ki complaint ki thi — ab
      // fail = fail hi dikhega, jhoota "Offline saved" kabhi nahi)
      throw err instanceof Error
        ? err
        : new Error('Download fail hua — dobara koshish karein')
    }
  }

  // ── Web fallback (browser dev me) — demo metadata save ──
  for (const p of [25, 50, 75, 90, 100]) {
    await new Promise((r) => setTimeout(r, 220))
    onProgress?.(p)
  }
  const record = baseRecord(0, false)
  saveDownloads([record, ...getDownloads()])
  return record
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}
