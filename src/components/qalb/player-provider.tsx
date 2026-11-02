'use client'

// Qalb — Step 3: Dual-mode YouTube Media Player Engine — v0.5.28
// • Ek single hidden YT.IFrame instance poori app (saare tabs) ko drive karta hai
// • Audio-only mode: video offscreen, spinning cover art UI me dikhti hai
// • v0.5.28 VIDEO-IN-PLACE: full-player video mode me host measured rect par
//   baithta hai (walkman cover ki EXACT jagah — full-player-modal VideoAnchor)
// • v0.5.28 NET OFF/ON FAST RECOVERY: net wapas aate hi video current
//   position se reload — lambi "loading" khatam
// • Media Session API: lock-screen / notification controls
// • Background playback: Android foreground service — screen lock pe bhi naat chalti rahe

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { usePlayerStore, ytBridge } from '@/lib/player-store'
import { useToast } from '@/hooks/use-toast'
import { loadYouTubeIframeApi, type YTNamespace } from '@/lib/yt-api'
import {
  nativeUpdatePlayback,
  nativeStopPlayback,
  nativeSetStatusBar,
  onNativeMediaAction,
  isNativeApp,
  type QalbMediaAction,
} from '@/plugins/qalb-native'
import { getTheme } from '@/lib/theme'

// ── minimal YT IFrame typings ────────────────────────────────────
interface YTPlayer {
  loadVideoById: (videoId: string, startSeconds?: number) => void
  cueVideoById: (videoId: string, startSeconds?: number) => void
  playVideo: () => void
  pauseVideo: () => void
  seekTo: (s: number, allow: boolean) => void
  getCurrentTime: () => number
  getDuration: () => number
  destroy: () => void
}

// YT API loader ab shared lib (yt-api.ts) me hai — itube-watch bhi wahi use karta hai
function loadYouTubeIframeApiLocal(): Promise<YTNamespace> {
  return loadYouTubeIframeApi()
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
  const videoRect = usePlayerStore((s) => s.videoRect)
  const itubeActive = usePlayerStore((s) => s.itubeActive)

  const currentTrack = currentIndex >= 0 ? queue[currentIndex] : null
  const currentVideoId = currentTrack?.videoId ?? null

  // ── init YT player once ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    loadYouTubeIframeApiLocal()
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
                if (st.isPlaying && !st.isBuffering) {
                  st.toggle() // store sync → false
                }
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

  // ── bridge store → player ───────────────────────────────────────
  useEffect(() => {
    ytBridge.loadVideo = (videoId) => {
      playerRef.current?.loadVideoById(videoId)
    }
    ytBridge.play = () => {
      playerRef.current?.playVideo()
    }
    ytBridge.pause = () => {
      playerRef.current?.pauseVideo()
    }
    ytBridge.seekTo = (s, allow = true) => {
      playerRef.current?.seekTo(s, allow)
    }
  }, [])

  // ── MODE SYNC — audioOnly toggle par YT iframe store ke saath sync ──
  // (v0.5.33: local-file offline playback gaya — download feature removed.
  //  loadedVideoRef ab sirf YT iframe ka current video track karta hai —
  //  net-recovery isse use karta hai.)
  const loadedVideoRef = useRef<string | null>(null)
  useEffect(() => {
    if (!currentVideoId) return
    let cancelled = false

    const go = () => {
      if (cancelled) return
      const wantPlay = usePlayerStore.getState().isPlaying
      if (loadedVideoRef.current === currentVideoId) {
        // video mode toggle — YT state store ke saath sync (warna video
        // mode me rukka hua reh jata tha jab isPlaying change nahi hota)
        try {
          if (wantPlay) playerRef.current?.playVideo()
          else playerRef.current?.pauseVideo()
        } catch {
          /* not ready */
        }
        return
      }
      loadedVideoRef.current = currentVideoId
      const pos = usePlayerStore.getState().position
      try {
        if (wantPlay) {
          playerRef.current?.loadVideoById(currentVideoId, pos > 2 ? Math.floor(pos) : undefined)
        } else {
          // pause state me cue — autoplay-blip nahi
          playerRef.current?.cueVideoById(currentVideoId, pos > 2 ? Math.floor(pos) : undefined)
        }
      } catch {
        /* not ready */
      }
    }

    if (usePlayerStore.getState().ytApiReady) {
      go()
    } else {
      // YT API abhi load ho rahi hai — ready hone pe ek hi dafa
      let unsub: (() => void) | null = null
      unsub = usePlayerStore.subscribe((s) => {
        if (s.ytApiReady) {
          unsub?.()
          unsub = null
          go()
        }
      })
      return () => {
        cancelled = true
        unsub?.()
      }
    }
    return () => {
      cancelled = true
    }
  }, [currentVideoId, audioOnly])

  // play/pause sync
  useEffect(() => {
    if (!usePlayerStore.getState().ytApiReady || !currentVideoId) return
    if (isPlaying) ytBridge.play()
    else ytBridge.pause()
  }, [isPlaying, currentVideoId])

  // ── native media controls (Android) ─────────────────────────────
  // Status bar + lock screen media card sync — play/pause/next/prev/seek
  // sab jagah kaam kare (app me, notification, lock screen, headset).
  useEffect(() => {
    nativeSetStatusBar(getTheme() === 'dark') // startup sync

    // Notification / lock-screen / headset buttons → player store
    let unlisten: (() => void) | null = null
    onNativeMediaAction((action: QalbMediaAction) => {
      // v0.5.19: iTube video watch khula hai? — notification buttons iTube
      // apne YT player par chalata hai (naat store touch NAHI karna warna
      // video + naat dono bajenge). iTube band hote hi flag false.
      if (usePlayerStore.getState().itubeActive) return
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

  // ── v0.5.35 — BACKGROUND PLAYBACK (user decision) ────────────────
  // PiP jugad (v0.5.34) hata diya — background sunne ka rasta ab wahi
  // proven setup hai: PlaybackService FGS + media card + wake lock
  // (native) + KeepAliveWebView (visibility hack). Neeche wala store-
  // subscribe har state change par nativeUpdatePlayback() bhejta hai —
  // service start/update hoti hai, screen lock par audio chalta rehta
  // hai, notification/lock-screen controls zinda rehte hain.

  // ── Foreground wapas — YT iframe re-sync ────────────────────────
  // Agar kisi OEM ROM ne background me media pause kar diya ho
  // (KeepAlive ke bawajood) to store isPlaying true rehta hai — wapas
  // aate hi wahi se chalao (Chrome jaisa resume).
  useEffect(() => {
    const onFg = () => {
      const s = usePlayerStore.getState()
      if (s.isPlaying && s.currentIndex >= 0 && s.ytApiReady) {
        window.setTimeout(() => {
          try {
            ytBridge.play()
          } catch {
            /* iframe not ready */
          }
        }, 250)
      }
    }
    window.addEventListener('qalbAppFg', onFg)
    return () => window.removeEventListener('qalbAppFg', onFg)
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

  // ── position polling — YT iframe se ────────────────────────────
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

  // ── v0.5.28 NET OFF/ON FAST RECOVERY ───────────────────────────
  // Net katte hi YT iframe atak jata tha (endless buffering) aur net
  // wapas aane par bhi khud recover nahi karta. Ab: offline par pause +
  // buffering state, online par 1s baad video CURRENT POSITION se
  // reload — 2-3 dab me wapas chalu (pehle: lambi loading / silence).
  useEffect(() => {
    const netResumeRef = { current: false }

    const onOffline = () => {
      const st = usePlayerStore.getState()
      if (st.isPlaying) netResumeRef.current = true
      try {
        playerRef.current?.pauseVideo()
      } catch {
        /* ignore */
      }
      if (st.queue.length && st.currentIndex >= 0) st.setBuffering(true)
    }

    const onOnline = () => {
      const st = usePlayerStore.getState()
      const t = st.currentIndex >= 0 ? st.queue[st.currentIndex] : null
      if (!t) return
      // 1s ruk kar — network stack settle (turant reload adhoora aata hai)
      window.setTimeout(() => {
        const cur = usePlayerStore.getState()
        const curT = cur.currentIndex >= 0 ? cur.queue[cur.currentIndex] : null
        if (!curT) return
        const resume = netResumeRef.current || cur.isPlaying
        netResumeRef.current = false
        loadedVideoRef.current = curT.videoId
        try {
          playerRef.current?.loadVideoById(curT.videoId, Math.floor(cur.position))
          if (resume) playerRef.current?.playVideo()
          else playerRef.current?.pauseVideo()
        } catch {
          /* iframe gone */
        }
      }, 1000)
    }

    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
    }
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

  // ── player host placement ──────────────────────────────────────
  // video mode me host VideoAnchor ke measured rect par baithta hai
  // (walkman logo ki jagah); rect aane tak invisible; warna hidden corner.
  const videoMode = fullOpen && !audioOnly && Boolean(currentTrack)
  // v0.5.34 — mini video card sirf PLAYING + full-player-band + iTube-band
  const cardMode =
    Boolean(currentTrack) && isPlaying && !fullOpen && !itubeActive

  let hostClass: string
  let hostStyle: React.CSSProperties = {}
  if (videoMode && videoRect) {
    hostClass = 'bg-black'
    hostStyle = {
      position: 'fixed',
      top: videoRect.top,
      left: videoRect.left,
      width: videoRect.width,
      height: videoRect.height,
      zIndex: 65,
    }
  } else if (videoMode) {
    // rect measure hone tak invisible (80ms me aa jata hai)
    hostClass = 'pointer-events-none fixed inset-x-0 top-0 z-[65] h-[240px] w-full bg-black opacity-0'
  } else if (cardMode) {
    // v0.5.34 — VISIBLE MINI VIDEO CARD: audio-only playback me bhi YT
    // iframe chhota sa VISIBLE rehta hai (bottom-right, mini-player ke
    // upar) — YouTube ka "player ko chhupao mat" rule ab compliant hai
    // (1px hidden hack gaya). Tap → full video player, ✕ → pause.
    hostClass =
      'pointer-events-none fixed right-3 z-40 h-[83px] w-[148px] overflow-hidden rounded-xl bg-black shadow-xl ring-1 ring-white/15'
    hostStyle = { bottom: 'calc(8rem + env(safe-area-inset-bottom))' }
  } else {
    hostClass =
      'pointer-events-none fixed bottom-0 right-0 z-0 h-1 w-1 overflow-hidden opacity-[0.02]'
  }

  return (
    <>
      {children}
      {/* Single global YouTube player host — position switches between
          hidden (audio-only) and measured video spot (video mode) */}
      <div aria-hidden={!videoMode} className={hostClass} style={hostStyle}>
        <div ref={hostRef} className="h-full w-full" />
      </div>
      {/* mini video card controls — tap = full video player, ✕ = pause */}
      {cardMode && (
        <div
          className="pointer-events-none fixed right-3 z-[41]"
          style={{ bottom: 'calc(8rem + env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            aria-label="Full player kholen"
            onClick={() => usePlayerStore.setState({ fullOpen: true, audioOnly: false })}
            className="pointer-events-auto absolute inset-0 h-[83px] w-[148px] cursor-pointer"
          />
          <button
            type="button"
            aria-label="Playback pause"
            onClick={() => usePlayerStore.setState({ isPlaying: false })}
            className="pointer-events-auto absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-neutral-900/90 text-white/90 shadow ring-1 ring-white/20"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </>
  )
}
