'use client'

// Qalb — Offline Download Handler (Step 3)
// Native (Capacitor Android): @capacitor/filesystem + @capacitor/http se
// audio file device par Documents/Qalb folder me save hoti hai.
// Web fallback: download metadata localStorage me save hota hai (demo mode).

import type { QalbTrack, SavedDownload } from '@/lib/types'

const DOWNLOADS_KEY = 'qalb_downloads_v1'

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

export async function removeDownload(trackId: string): Promise<void> {
  const list = getDownloads().filter((d) => d.trackId !== trackId)
  saveDownloads(list)

  if (isNativeCapacitor()) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem')
      await Filesystem.deleteFile({
        path: `Qalb/${trackId}.m4a`,
        directory: Directory.Documents,
      }).catch(() => undefined)
    } catch {
      /* plugin web build me available nahi — ignore */
    }
  }
}

interface DownloadProgress {
  (percent: number): void
}

export async function downloadTrack(
  track: QalbTrack,
  onProgress?: DownloadProgress
): Promise<SavedDownload> {
  const existing = getDownloads().find((d) => d.trackId === track.id)
  if (existing) return existing

  // simulated size (real app me server se content-length aata hai)
  const sizeMB = Math.round((4 + Math.random() * 8) * 10) / 10

  if (isNativeCapacitor()) {
    // ── Native path: Capacitor Filesystem ──
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem')
      const { CapacitorHttp } = await import('@capacitor/core')

      // Real build me yeh URL server-side audio extraction proxy point karega
      const audioUrl = `/api/download/${track.videoId}.m4a`

      onProgress?.(15)
      const response = await CapacitorHttp.get({
        url: audioUrl,
        responseType: 'arraybuffer',
        readTimeout: 60000,
      })
      onProgress?.(70)

      const base64 = arrayBufferToBase64(response.data as unknown as ArrayBuffer)

      await Filesystem.writeFile({
        path: `Qalb/${track.id}.m4a`,
        data: base64,
        directory: Directory.Documents,
        recursive: true,
      })
      onProgress?.(100)

      const record: SavedDownload = {
        trackId: track.id,
        videoId: track.videoId,
        title: track.title,
        artist: track.artist,
        thumbnailUrl: track.thumbnailUrl,
        savedAt: new Date().toISOString(),
        sizeMB,
        offline: true,
      }
      saveDownloads([record, ...getDownloads()])
      return record
    } catch {
      // native download fail → web-style metadata save
    }
  }

  // ── Web fallback (demo mode) ──
  for (const p of [25, 50, 75, 90, 100]) {
    await new Promise((r) => setTimeout(r, 220))
    onProgress?.(p)
  }

  const record: SavedDownload = {
    trackId: track.id,
    videoId: track.videoId,
    title: track.title,
    artist: track.artist,
    thumbnailUrl: track.thumbnailUrl,
    savedAt: new Date().toISOString(),
    sizeMB,
    offline: false,
  }
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
