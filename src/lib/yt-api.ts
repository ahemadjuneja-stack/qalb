'use client'

// Qalb — YouTube IFrame API loader (v0.5.19)
// Shared: player-provider (naat/qawwali engine) + itube-watch (video mode)
// dono isi se YT API load karte hain — single script, single promise.

export interface YTPlayer {
  loadVideoById: (videoId: string) => void
  cueVideoById: (videoId: string) => void
  playVideo: () => void
  pauseVideo: () => void
  stopVideo: () => void
  seekTo: (s: number, allow: boolean) => void
  getCurrentTime: () => number
  getDuration: () => number
  getPlayerState: () => number
  destroy: () => void
}

export interface YTNamespace {
  Player: new (
    el: HTMLElement | string,
    config: {
      height?: string
      width?: string
      videoId?: string
      host?: string
      playerVars?: Record<string, string | number>
      events?: {
        onReady?: () => void
        onStateChange?: (e: { data: number }) => void
        onError?: (e: { data: number }) => void
      }
    }
  ) => YTPlayer
  PlayerState: {
    ENDED: number
    PLAYING: number
    PAUSED: number
    BUFFERING: number
    CUED: number
  }
}

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

let ytApiLoading = false

/** YT IFrame API script ek hi baar load — har caller ko wahi promise */
export function loadYouTubeIframeApi(): Promise<YTNamespace> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('no window'))
    if (window.YT?.Player) return resolve(window.YT)
    if (ytApiLoading) {
      const wait = setInterval(() => {
        if (window.YT?.Player) {
          clearInterval(wait)
          resolve(window.YT)
        }
      }, 150)
      setTimeout(() => clearInterval(wait), 15000)
      return
    }
    ytApiLoading = true
    window.onYouTubeIframeAPIReady = () => {
      if (window.YT) resolve(window.YT)
    }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    tag.async = true
    tag.onerror = () => reject(new Error('YT API load failed'))
    document.head.appendChild(tag)
    setTimeout(() => {
      if (!window.YT?.Player) reject(new Error('YT API timeout'))
    }, 15000)
  })
}
