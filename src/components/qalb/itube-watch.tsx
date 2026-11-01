'use client'

// iTube WATCH — YouTube watch-page (v0.5.19)
// ─────────────────────────────────────────────────────────────────
// YouTube app ke watch screen jaisa:
//   • Top: edge-to-edge 16:9 YouTube player (YT ke apne controls —
//     seek, play/pause, quality, captions, fullscreen)
//   • Title, channel • views • published
//   • Action chips: Pasand (like) + Share
//   • "Aage dekhein" related videos — tap → video switch
//
// v0.5.19 — BACKGROUND PLAYBACK + LOCK-SCREEN CONTROLS (user request):
//   • Plain iframe ki jagah YT.IFrame API player (naat engine jaisa)
//     — playVideo/pauseVideo JS se control ho sakta hai
//   • App background/lock → player container naat-style 1x1 me chhota
//     (visible-video pipeline ka surface-bind tootna band) + keepalive
//     loop jo YT ke auto-pause ko playVideo se jawab deta hai
//   • nativeSetBgPauseMedia(false) — MainActivity WebView ka native
//     media-pause is screen par KABHI nahi (v0.3.3 reel-pause bypass)
//   • Video playing → PlaybackService notification (custom clustered
//     bar) — lock screen par play/pause + next/prev buttons
//   • Notification buttons → mediaAction events → YT commands
//     (player-provider itubeActive guard se naat store touch nahi karta)
//   • ENDED par auto-next related video; PREV session history se
//   • Naat start hote hi iTube video chup (dono audio ek sath nahi)
//
// Back button (Android) aur back-arrow dono screen band karte hain.

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, Loader2, Share2, ThumbsUp } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useViewBackHandler } from '@/lib/back-stack'
import { viewsLabel } from '@/lib/innertube-x'
import { recordPlay } from '@/lib/recommend'
import { recordItubeWatch, updateLastWatchDuration, rankRelated } from '@/lib/itube-brain'
import { trackPub } from '@/lib/itube'
import { loadYouTubeIframeApi, type YTPlayer } from '@/lib/yt-api'
import { usePlayerStore } from '@/lib/player-store'
import {
  nativeUpdatePlayback,
  nativeStopPlayback,
  nativeSetBgPauseMedia,
  onNativeMediaAction,
} from '@/plugins/qalb-native'
import type { QalbTrack } from '@/lib/types'

// like registry (per-device)
const LIKE_KEY = 'qalb_itube_likes_v1'

function getLikes(): Set<string> {
  try {
    const raw = localStorage.getItem(LIKE_KEY)
    const arr = raw ? (JSON.parse(raw) as string[]) : []
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

function setLiked(videoId: string, liked: boolean) {
  try {
    const set = getLikes()
    if (liked) set.add(videoId)
    else set.delete(videoId)
    localStorage.setItem(LIKE_KEY, JSON.stringify([...set]))
  } catch {
    /* private mode */
  }
}

/** like status read — likeTick compiler ko cache-na-karne ke liye (localStorage read) */
function isLiked(videoId: string, tick: number): boolean {
  void tick
  return getLikes().has(videoId)
}

export function ItubeWatch({
  track,
  related,
  onPick,
  onClose,
}: {
  track: QalbTrack
  related: QalbTrack[]
  onPick: (t: QalbTrack) => void
  onClose: () => void
}) {
  const { toast } = useToast()
  // readyVid: kaunsi video ka player start ho chuka (splash ke liye)
  const [readyVid, setReadyVid] = useState<string | null>(null)
  const [likeTick, setLikeTick] = useState(0)
  const [bgTiny, setBgTiny] = useState(false)
  const scrollerRef = useRef<HTMLDivElement>(null)
  // v0.5.15 WATCH-TIME TRAINING — video kitne second dekha gaya (close/
  // switch par flush). Jitna dekha utna strong algorithm signal.
  const openedAtRef = useRef<number>(Date.now())
  const curVidRef = useRef<string>(track.videoId)
  const flushWatch = () => {
    const secs = (Date.now() - openedAtRef.current) / 1000
    if (secs >= 3) updateLastWatchDuration(Math.round(secs))
  }

  // ── v0.5.19 YT player engine refs ──────────────────────────────
  const playerHostRef = useRef<HTMLDivElement>(null)
  const ytPlayerRef = useRef<YTPlayer | null>(null)
  const playingRef = useRef(false) // YT ka asli playing state
  const userPausedRef = useRef(false) // user ne khud pause kiya (bg auto-pause nahi)
  const bgRef = useRef(false) // app background/lock
  const posRef = useRef(0)
  const durRef = useRef(0)
  const keepAliveRef = useRef<{ iv: number | null; n: number }>({ iv: null, n: 0 })
  const historyRef = useRef<QalbTrack[]>([track]) // session history (PREV ke liye)
  // render-time fresh values (mount-once closures unhe refs se padhte hain)
  const trackRef = useRef(track)
  trackRef.current = track
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick

  // ── keepalive — background me YT ke auto-pause ka jawab ───────
  const stopKeepAlive = () => {
    if (keepAliveRef.current.iv != null) window.clearInterval(keepAliveRef.current.iv)
    keepAliveRef.current = { iv: null, n: 0 }
  }
  const startKeepAlive = () => {
    if (keepAliveRef.current.iv != null) return
    keepAliveRef.current = { iv: null, n: 0 }
    keepAliveRef.current.iv = window.setInterval(() => {
      if (!bgRef.current || userPausedRef.current) {
        stopKeepAlive()
        return
      }
      try {
        ytPlayerRef.current?.playVideo() // already playing par no-op
      } catch {
        /* iframe not ready */
      }
      if (++keepAliveRef.current.n > 240) stopKeepAlive() // ~10 min guard
    }, 2500)
  }

  // ── service/notification state push ────────────────────────────
  const pushNative = (isPlaying: boolean) => {
    void nativeUpdatePlayback({
      title: trackRef.current.title,
      artist: trackRef.current.artist,
      thumbUrl: trackRef.current.thumbnailUrl,
      isPlaying,
      position: posRef.current,
      duration: durRef.current,
    })
  }

  // ── next/prev ───────────────────────────────────────────────────
  const relatedRef = useRef(related)
  relatedRef.current = related
  const nextTrack = () => {
    const r = relatedRef.current[0]
    if (r) onPickRef.current(r)
  }
  const prevTrack = () => {
    const h = historyRef.current
    if (h.length >= 2) {
      h.pop()
      const t = h[h.length - 1]
      if (t) onPickRef.current(t)
    }
  }

  // ── YT state handler (ref ke through — fresh closure) ──────────
  const stateHandlerRef = useRef<(st: number) => void>(() => {})
  const handleYtState = (st: number) => {
    // 1 playing, 2 paused, 3 buffering, 0 ended, 5 cued
    if (st === 1) {
      playingRef.current = true
      userPausedRef.current = false
      setReadyVid(curVidRef.current)
      if (bgRef.current) startKeepAlive()
      pushNative(true)
    } else if (st === 2) {
      // foreground pause = user/YT-controls ne kiya; background pause =
      // auto (YT visibility rule) — userPaused nahi, keepalive resume karega
      if (!bgRef.current) userPausedRef.current = true
      playingRef.current = false
      pushNative(false)
    } else if (st === 3) {
      setReadyVid(curVidRef.current) // buffering par splash hatao (YT spinner dikhta hai)
    } else if (st === 0) {
      playingRef.current = false
      nextTrack() // video khatam — agla related (YouTube autoplay feel)
    }
  }
  useEffect(() => {
    stateHandlerRef.current = handleYtState
  })

  // Android back — watch screen band (YouTube app jaisa)
  useViewBackHandler('itube-watch', 'reels', () => {
    onClose()
    return true // back handle ho gaya — chain yahin ruke
  })

  // mount: body scroll lock (watch screen ka apna scroll hai)
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  // mount: itube session active + native bg-pause BYPASS + cleanup
  useEffect(() => {
    usePlayerStore.getState().setItubeActive(true)
    // video watch khula — app background me WebView ka media NATIVELY
    // pause NAHI hoga (reels wala v0.3.3 pause is screen par bypass)
    void nativeSetBgPauseMedia(false)
    return () => {
      usePlayerStore.getState().setItubeActive(false)
      stopKeepAlive()
      try {
        ytPlayerRef.current?.pauseVideo()
      } catch {
        /* player gone */
      }
      void nativeStopPlayback() // watch band = video + notification band
    }
  }, [])

  // ── YT.Player init (mount once) — naat engine jaisa single host ──
  useEffect(() => {
    let cancelled = false
    loadYouTubeIframeApi()
      .then((YT) => {
        if (cancelled || !playerHostRef.current || ytPlayerRef.current) return
        const player = new YT.Player(playerHostRef.current, {
          height: '100%',
          width: '100%',
          playerVars: {
            autoplay: 1,
            playsinline: 1,
            controls: 1,
            rel: 0,
            modestbranding: 1,
            iv_load_policy: 3,
            fs: 1,
          },
          events: {
            onReady: () => {
              // config me videoId nahi diya — CURRENT track load karo
              // (init ke daur track switch ho gaya ho to stale na chale)
              try {
                player.loadVideoById(trackRef.current.videoId)
              } catch {
                /* not ready */
              }
            },
            onStateChange: (e) => stateHandlerRef.current?.(e.data),
            onError: () => {
              // embed-able nahi — agla related
              nextTrack()
            },
          },
        })
        ytPlayerRef.current = player
      })
      .catch(() => {
        // YT API load fail — splash dikhta rahega (naat bhi tab na chalega)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // video switch — player persists, loadVideoById se naya video
  const loadedVidRef = useRef<string | null>(null)
  useEffect(() => {
    if (loadedVidRef.current === track.videoId) return
    loadedVidRef.current = track.videoId
    posRef.current = 0
    durRef.current = 0
    setReadyVid(null) // splash wapas — naya video load ho raha
    const p = ytPlayerRef.current
    if (!p) return // init abhi chal raha — onReady trackRef se load karega
    try {
      p.loadVideoById(track.videoId)
    } catch {
      /* not ready */
    }
  }, [track.videoId])

  // video open/switch — taste profile update + scroll top (external DOM)
  // recordItubeWatch = iTube algorithm ka fuel (kya dekha, kis category me)
  // switch par PURANI video ki watch duration pehle flush hoti hai
  useEffect(() => {
    if (curVidRef.current !== track.videoId) {
      flushWatch()
      curVidRef.current = track.videoId
      openedAtRef.current = Date.now()
    }
    recordItubeWatch(track)
    recordPlay(track)
    scrollerRef.current?.scrollTo({ top: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.videoId])

  // session history — PREV button ke liye (max 30)
  useEffect(() => {
    const h = historyRef.current
    if (h[h.length - 1]?.videoId !== track.videoId) {
      h.push(track)
      if (h.length > 30) h.shift()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.videoId])

  // ── background/foreground detect (native event + web fallback) ──
  useEffect(() => {
    const applyBg = (bg: boolean) => {
      if (bgRef.current === bg) return
      bgRef.current = bg
      setBgTiny(bg)
      if (bg) {
        // 700ms baad pehla playVideo (YT visibility-pause ka jawab)
        // + keepalive loop har 2.5s (jab tak fg na wapas aaye)
        window.setTimeout(() => {
          if (bgRef.current && !userPausedRef.current) {
            try {
              ytPlayerRef.current?.playVideo()
            } catch {
              /* not ready */
            }
          }
        }, 700)
        startKeepAlive()
      } else {
        stopKeepAlive()
        // foreground wapas — user ne pause nahi kiya tha to video chalu
        if (!userPausedRef.current) {
          try {
            ytPlayerRef.current?.playVideo()
          } catch {
            /* not ready */
          }
        }
      }
    }
    const onBgEvt = (e: Event) => {
      const detail = (e as CustomEvent<{ bg?: boolean }>).detail
      applyBg(Boolean(detail?.bg))
    }
    const onFgEvt = () => applyBg(false)
    const onVis = () => applyBg(document.hidden)
    window.addEventListener('qalbAppBg', onBgEvt)
    window.addEventListener('qalbAppFg', onFgEvt)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('qalbAppBg', onBgEvt)
      window.removeEventListener('qalbAppFg', onFgEvt)
      document.removeEventListener('visibilitychange', onVis)
      stopKeepAlive()
    }
  }, [])

  // ── position/duration ticker (3s) — service seekbar sync ──────
  useEffect(() => {
    const iv = window.setInterval(() => {
      const p = ytPlayerRef.current
      if (!p || !playingRef.current) return
      try {
        const t = p.getCurrentTime()
        const d = p.getDuration()
        if (typeof t === 'number' && !Number.isNaN(t)) posRef.current = t
        if (typeof d === 'number' && d > 0) durRef.current = d
        pushNative(true)
      } catch {
        /* iframe not ready */
      }
    }, 3000)
    return () => window.clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── notification / lock-screen buttons → YT commands ───────────
  useEffect(() => {
    let unlisten: (() => void) | null = null
    onNativeMediaAction((action) => {
      const p = ytPlayerRef.current
      if (action === 'play') {
        userPausedRef.current = false
        try {
          p?.playVideo()
        } catch {
          /* not ready */
        }
      } else if (action === 'pause') {
        userPausedRef.current = true
        try {
          p?.pauseVideo()
        } catch {
          /* not ready */
        }
      } else if (action === 'next') {
        nextTrack()
      } else if (action === 'prev') {
        prevTrack()
      } else if (action === 'stop') {
        userPausedRef.current = true
        try {
          p?.pauseVideo()
        } catch {
          /* not ready */
        }
        void nativeStopPlayback()
      } else if (typeof action === 'string' && action.startsWith('seek:')) {
        const target = Number.parseFloat(action.slice(5))
        if (Number.isFinite(target)) {
          try {
            p?.seekTo(target, true)
          } catch {
            /* not ready */
          }
        }
      }
    }).then((fn) => {
      unlisten = fn
    })
    return () => {
      unlisten?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // naat/qawwali start hote hi iTube video chup (dono audio ek sath nahi)
  useEffect(() => {
    return usePlayerStore.subscribe((s, prev) => {
      if (s.isPlaying && !prev.isPlaying) {
        userPausedRef.current = true
        try {
          ytPlayerRef.current?.pauseVideo()
        } catch {
          /* not ready */
        }
      }
    })
  }, [])

  // screen close/unmount — chalu video ki watch duration flush
  useEffect(() => {
    const onHide = () => {
      if (document.hidden) {
        flushWatch()
        // background ka time dobara na gine — timer reset
        openedAtRef.current = Date.now()
      }
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      flushWatch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // "Aage dekhein" — YouTube-jaisa ranked related: same category pehle,
  // user ki taste, quality — jitter per-video stable (re-render par list nahi hilti)
  const relatedRanked = rankRelated(track, related)

  const liked = isLiked(track.videoId, likeTick)

  const share = async () => {
    const url = `https://youtu.be/${track.videoId}`
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: track.title, text: track.title, url })
      } else {
        await navigator.clipboard.writeText(url)
        toast({ title: '🔗 Link copy ho gaya' })
      }
    } catch {
      /* user ne cancel kiya — koi masla nahi */
    }
  }

  const toggleLike = () => {
    const next = !getLikes().has(track.videoId)
    setLiked(track.videoId, next)
    setLikeTick((v) => v + 1) // re-render — liked derive phirse padhega
    if (next) toast({ title: '💚 Pasand mehfooz ho gayi' })
  }

  const pub = trackPub(track)
  const views = viewsLabel(track.playCount)

  return (
    <div
      className="fixed inset-0 z-[70] bg-emerald-950 pt-[env(safe-area-inset-top)]"
      role="dialog"
      aria-label={`${track.title} — iTube watch`}
    >
      <div ref={scrollerRef} className="h-full overflow-y-auto overscroll-contain">
        {/* ── player (edge-to-edge, YT watch jaisa) ── */}
        <div className="relative aspect-video w-full overflow-hidden bg-black">
          {/* player host — background me naat-style 1x1 tiny ho jata hai
              (visible-video ka surface-bind tootega hi nahi, audio chalta rahega) */}
          <div
            className={
              bgTiny
                ? 'pointer-events-none fixed bottom-0 right-0 z-0 h-1 w-1 overflow-hidden opacity-[0.02]'
                : 'absolute inset-0 h-full w-full'
            }
          >
            <div ref={playerHostRef} className="h-full w-full" />
          </div>

          {/* background mode message — video wapas aane tak */}
          {bgTiny && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black">
              <p className="text-[12.5px] font-semibold text-emerald-100/70">
                🔒 Video background me chal rahi hai
              </p>
              <p className="text-[11px] text-emerald-200/45">
                Lock screen par bhi sound aata rahega
              </p>
            </div>
          )}

          {/* buffering splash — YT ka apna spinner aane tak thumbnail */}
          {!bgTiny && (
            <div
              className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${
                readyVid === track.videoId ? 'opacity-0' : 'opacity-100'
              }`}
            >
              <img
                src={track.thumbnailUrl ?? ''}
                alt=""
                className="h-full w-full object-cover opacity-70"
              />
              <Loader2 className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 animate-spin text-white/80" />
            </div>
          )}

          {/* back arrow — video ke upar top-left (YT app jaisa) */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Watch band karein"
            className="absolute left-3 top-2 z-10 rounded-full bg-black/45 p-2 text-white backdrop-blur-sm active:scale-90"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        </div>

        {/* ── title + meta + actions ── */}
        <div className="px-4 pt-3">
          <h1 className="line-clamp-2 text-[15.5px] font-bold leading-snug text-emerald-50">
            {track.title}
          </h1>
          <p className="mt-1.5 text-[12px] font-medium text-emerald-200/60">
            {track.artist}
            {views ? ` • ${views}` : ''}
            {pub ? ` • ${pub}` : ''}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={toggleLike}
              aria-pressed={liked}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-bold transition active:scale-95 ${
                liked
                  ? 'bg-emerald-400 text-emerald-950 shadow-[0_0_14px_-4px_var(--glow)]'
                  : 'border border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-100/80'
              }`}
            >
              <ThumbsUp className={`h-3.5 w-3.5 ${liked ? 'fill-emerald-950' : ''}`} />
              Pasand
            </button>
            <button
              type="button"
              onClick={() => void share()}
              className="flex items-center gap-1.5 rounded-full border border-emerald-400/15 bg-emerald-400/[0.06] px-4 py-2 text-[12px] font-bold text-emerald-100/80 transition active:scale-95"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share
            </button>
          </div>
        </div>

        {/* ── related ── */}
        <div className="mt-4 border-t border-emerald-400/10 px-2 pt-3">
          <p className="px-2 pb-2 text-[13px] font-bold text-emerald-50">Aage dekhein</p>
          {relatedRanked.length ? (
            relatedRanked.map((r) => {
              const rv = viewsLabel(r.playCount)
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onPick(r)}
                  className="flex w-full items-start gap-3 rounded-xl p-2 text-left transition active:bg-emerald-400/[0.06]"
                >
                  <div className="relative w-[140px] shrink-0 overflow-hidden rounded-lg bg-emerald-400/[0.06]">
                    <img
                      src={r.thumbnailUrl ?? ''}
                      alt={r.title}
                      loading="lazy"
                      className="aspect-video w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[12.5px] font-bold leading-snug text-emerald-50">
                      {r.title}
                    </p>
                    <p className="mt-1 truncate text-[11px] text-emerald-200/55">
                      {r.artist}
                      {rv ? ` • ${rv}` : ''}
                    </p>
                  </div>
                </button>
              )
            })
          ) : (
            <p className="px-2 pb-3 text-[11.5px] text-emerald-200/40">
              Bas yahi tak — upar back kar ke aur khojein 🌙
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
