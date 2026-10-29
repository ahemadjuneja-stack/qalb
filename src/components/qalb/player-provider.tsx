'use client'

// Qalb — Step 3: Dual-mode YouTube Media Player Engine
// • Ek single hidden YT.IFrame instance poori app (saare tabs) ko drive karta hai
// • Audio-only mode: video offscreen, spinning cover art UI me dikhti hai
// • Media Session API: lock-screen / notification controls
// • Background playback: Android foreground service — screen lock pe bhi naat chalti rahe
// • Global: Mini-Player aur Full-screen Modal isi provider pe chalte hain

import { useEffect, useRef } from 'react'
import { usePlayerStore, ytBridge } from '@/lib/player-store'
import { useToast } from '@/hooks/use-toast'
import {
  nativeUpdatePlayback,
  nativeStopPlayback,
  nativeSetStatusBar,
  onNativeMediaAction,
  type QalbMediaAction,
} from '@/plugins/qalb-native'
import { getTheme } from '@/lib/theme'

// ── minimal YT IFrame typings ────────────────────────────────────
interface YTPlayer {
  loadVideoById: (videoId: string) => void
  playVideo: () => void
  pauseVideo: () => void
  seekTo: (s: number, allow: boolean) => void
  getCurrentTime: () => number
  getDuration: () => number
  destroy: () => void
}
interface YTNamespace {
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
function loadYouTubeIframeApi(): Promise<YTNamespace> {
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

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const { toast } = useToast()

  const queue = usePlayerStore((s) => s.queue)
  const currentIndex = usePlayerStore((s) => s.currentIndex)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const audioOnly = usePlayerStore((s) => s.audioOnly)
  const fullOpen = usePlayerStore((s) => s.fullOpen)

  const currentTrack = currentIndex >= 0 ? queue[currentIndex] : null
  const currentVideoId = currentTrack?.videoId ?? null

  // ── init YT player once ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    loadYouTubeIframeApi()
      .then((YT) => {
        if (cancelled || !hostRef.current || playerRef.current) return
        const player = new YT.Player(hostRef.current, {
          height: '100%',
          width: '100%',
          playerVars: {
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
          },
          events: {
            onReady: () => {
              usePlayerStore.getState().setYtApiReady(true)
            },
            onStateChange: (e) => {
              const st = usePlayerStore.getState()
              if (!window.YT) return
              if (e.data === window.YT.PlayerState.PLAYING) {
                st.setBuffering(false)
                if (!st.isPlaying) st.toggle() // store sync → true
              } else if (e.data === window.YT.PlayerState.PAUSED) {
                if (st.isPlaying && !st.isBuffering) st.toggle() // store sync → false
              } else if (e.data === window.YT.PlayerState.BUFFERING) {
                st.setBuffering(true)
              } else if (e.data === window.YT.PlayerState.ENDED) {
                st.next(true) // auto-advance
              }
            },
            onError: () => {
              const st = usePlayerStore.getState()
              const t = st.currentIndex >= 0 ? st.queue[st.currentIndex] : null
              if (t) {
                st.markFailed(t.videoId)
                toast({
                  title: 'Track available nahi',
                  description: `"${t.title}" embed nahi ho saka — agla kalam chal raha hai.`,
                })
                setTimeout(() => usePlayerStore.getState().next(true), 900)
              }
            },
          },
        })
        playerRef.current = player
      })
      .catch(() => {
        // sandbox me YT script block ho sakti hai — app phir bhi navigable rahe
      })
    return () => {
      cancelled = true
    }
  }, [])

  // ── bridge store → player ──────────────────────────────────────
  useEffect(() => {
    ytBridge.loadVideo = (videoId) => {
      playerRef.current?.loadVideoById(videoId)
    }
    ytBridge.play = () => playerRef.current?.playVideo()
    ytBridge.pause = () => playerRef.current?.pauseVideo()
    ytBridge.seekTo = (s, allow = true) => playerRef.current?.seekTo(s, allow)
  }, [])

  // ── native media controls (Android) ─────────────────────────────
  // Status bar + lock screen media card sync — play/pause/next/prev/seek
  // sab jagah kaam kare (app me, notification, lock screen, headset).
  useEffect(() => {
    nativeSetStatusBar(getTheme() === 'dark') // startup sync

    // Notification / lock-screen / headset buttons → player store
    let unlisten: (() => void) | null = null
    onNativeMediaAction((action: QalbMediaAction) => {
      const st = usePlayerStore.getState()
      if (action === 'play') {
        if (st.queue.length && st.currentIndex >= 0) {
          usePlayerStore.setState({ isPlaying: true })
        }
      } else if (action === 'pause') {
        usePlayerStore.setState({ isPlaying: false })
      } else if (action === 'next') {
        st.next()
      } else if (action === 'prev') {
        st.prev()
      } else if (action === 'stop') {
        usePlayerStore.setState({ isPlaying: false })
        nativeStopPlayback() // service + notification band
      } else if (typeof action === 'string' && action.startsWith('seek:')) {
        const target = Number.parseFloat(action.slice(5))
        if (Number.isFinite(target)) st.seek(target)
      }
    }).then((fn) => {
      unlisten = fn
    })

    return () => {
      unlisten?.()
    }
  }, [])

  // State changes → notification turant update (play/pause icon, thumbnail, seekbar)
  useEffect(() => {
    return usePlayerStore.subscribe((s, prev) => {
      const t = s.currentIndex >= 0 ? s.queue[s.currentIndex] : null
      const prevT = prev.currentIndex >= 0 ? prev.queue[prev.currentIndex] : null

      if (!t) {
        if (prevT) nativeStopPlayback() // queue khatam
        return
      }

      const trackChanged = !prevT || t.videoId !== prevT.videoId
      if (s.isPlaying !== prev.isPlaying || trackChanged) {
        // Pause pe bhi notification zinda rehta hai (Play button ke saath) —
        // sirf explicit stop / queue clear / swipe-close pe service band hota hai.
        nativeUpdatePlayback({
          title: t.title,
          artist: t.artist,
          thumbUrl: t.thumbnailUrl,
          isPlaying: s.isPlaying,
          position: s.position,
          duration: s.duration,
        })
      }
    })
  }, [])

  // Position ticker (3s) — notification seekbar aage badhta rahe +
  // pause me seek karne par bhi sync ho.
  useEffect(() => {
    const lastPushed = { playing: false, pos: -1 }
    const interval = setInterval(() => {
      const s = usePlayerStore.getState()
      const t = s.currentIndex >= 0 ? s.queue[s.currentIndex] : null
      if (!t) return
      const drifted = Math.abs(s.position - lastPushed.pos) > 2.5
      if (!s.isPlaying && !drifted && lastPushed.playing === s.isPlaying) return
      lastPushed.playing = s.isPlaying
      lastPushed.pos = s.position
      nativeUpdatePlayback({
        title: t.title,
        artist: t.artist,
        thumbUrl: t.thumbnailUrl,
        isPlaying: s.isPlaying,
        position: s.position,
        duration: s.duration,
      })
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  // video change → load
  const loadedVideoRef = useRef<string | null>(null)
  useEffect(() => {
    if (!currentVideoId) return
    if (!usePlayerStore.getState().ytApiReady) {
      // API abhi load ho rahi hai — ready hone pe retry
      const unsub = usePlayerStore.subscribe((s) => {
        if (s.ytApiReady && loadedVideoRef.current !== currentVideoId) {
          loadedVideoRef.current = currentVideoId
          ytBridge.loadVideo(currentVideoId)
        }
      })
      return unsub
    }
    if (loadedVideoRef.current === currentVideoId) return
    loadedVideoRef.current = currentVideoId
    ytBridge.loadVideo(currentVideoId)
  }, [currentVideoId])

  // play/pause sync
  useEffect(() => {
    if (!usePlayerStore.getState().ytApiReady || !currentVideoId) return
    if (isPlaying) ytBridge.play()
    else ytBridge.pause()
  }, [isPlaying, currentVideoId])

  // ── position polling ───────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const p = playerRef.current
      if (!p) return
      try {
        const t = p.getCurrentTime()
        const d = p.getDuration()
        if (typeof t === 'number' && !Number.isNaN(t)) usePlayerStore.getState().setPosition(t)
        if (typeof d === 'number' && d > 0) usePlayerStore.getState().setDuration(d)
      } catch {
        /* iframe not ready */
      }
    }, 500)
    return () => clearInterval(interval)
  }, [])

  // ── Media Session API (lock-screen controls) ───────────────────
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    const ms = navigator.mediaSession

    if (currentTrack) {
      ms.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: 'Qalb — Naat, Hamd & Sufi Qawwali',
        artwork: currentTrack.thumbnailUrl
          ? [{ src: currentTrack.thumbnailUrl, sizes: '480x360', type: 'image/jpeg' }]
          : [],
      })
      ms.playbackState = isPlaying ? 'playing' : 'paused'
    }

    try {
      ms.setActionHandler('play', () => {
        usePlayerStore.setState({ isPlaying: true })
        ytBridge.play()
      })
      ms.setActionHandler('pause', () => {
        usePlayerStore.setState({ isPlaying: false })
        ytBridge.pause()
      })
      ms.setActionHandler('previoustrack', () => usePlayerStore.getState().prev())
      ms.setActionHandler('nexttrack', () => usePlayerStore.getState().next())
      ms.setActionHandler('seekbackward', () => usePlayerStore.getState().seekBy(-10))
      ms.setActionHandler('seekforward', () => usePlayerStore.getState().seekBy(10))
      ms.setActionHandler('seekto', (details) => {
        if (typeof details.seekTime === 'number') usePlayerStore.getState().seek(details.seekTime)
      })
    } catch {
      /* some handlers unsupported */
    }
  }, [currentTrack, isPlaying])

  // ── player host placement (audio-only vs video mode) ──────────
  const videoMode = fullOpen && !audioOnly && Boolean(currentTrack)

  return (
    <>
      {children}
      {/* Single global YouTube player host — position switches between
          hidden (audio-only) and modal video area (video mode) */}
      <div
        aria-hidden={!videoMode}
        className={
          videoMode
            ? 'fixed inset-x-0 top-0 z-[65] h-[240px] w-full bg-black'
            : 'pointer-events-none fixed bottom-0 right-0 z-0 h-1 w-1 overflow-hidden opacity-[0.02]'
        }
      >
        <div ref={hostRef} className="h-full w-full" />
      </div>
    </>
  )
}
