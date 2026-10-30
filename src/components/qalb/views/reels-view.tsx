'use client'

// Qalb — Islamic Reels (v0.2.6) — INSTAGRAM STYLE
// ─────────────────────────────────────────────────────────────────
//  • MIX FEED: bayan + naat + status + info sab ek feed me — koi
//    filter chips NAHI. Interest algorithm: jo zyada dekha wo zyada.
//  • REPEAT BLOCK: dekhi hui reel (2.5s+) dobara nahi aati.
//  • FULL-SCREEN: iframe ko exact 9:16 me cover-stretch — black bars
//    crop, video poora screen bharta hai.
//  • INSTANT SWIPE: next 2 iframe pehle se mounted/buffered +
//    preconnect — swipe karte hi reel chalu, loading nahi.
//  • INFINITE: end se 4 pehle background me fresh batch (rotating
//    queries, duplicate-free).
//  • v0.3.6 WHATSAPP STATUS: action rail me WhatsApp button — dabate hi
//    whatsapp:// deep link se WhatsApp "Send to…" khulta hai (My status
//    wahan option hai). 100% LEGAL: sirf OFFICIAL YouTube link jata hai
//    (video file nahi — file share YouTube rules ke khilaf hota hai).
//    Download button hata diya: YouTube ka bot-check ab har third-party
//    downloader ko block karta hai (saare InnerTube clients + yt-dlp
//    live-verified LOGIN_REQUIRED).
//  • Like ❤️: global Firestore count + per-device state.
//  • Naat conflict: reel play → naat pause; naat play → reel pause.
//  • v0.3.2 APP MINIMIZE → reel sound BAND (naat player background me
//    chalta rahega — sound sirf Player me naat/qawwali par zinda hai).
//    MainActivity onPause/onResume → 'qalbAppBg' window event (WebView me
//    document.hidden reliable nahi) + visibilitychange fallback.
//  • v0.3.2 LOADING SPINNER KABHI NAHI: video ACTUALLY start hone tak
//    reel ki thumbnail iframe ke upar dikhti hai (YT ka buffering spinner
//    chhup jata hai) — YT playerState message se start detect, 3.2s
//    fallback timer.

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Heart, Loader2, RefreshCw, SearchX } from 'lucide-react'
import {
  clearReelsCache,
  getLikeCounts,
  getMyLikedReels,
  getReels,
  likeReelRemote,
  loadMoreReels,
  recordReelWatch,
  setReelLiked,
  type ReelItem,
} from '@/lib/reels'
import { nativeSetBgPauseMedia } from '@/plugins/qalb-native'
import { usePlayerStore } from '@/lib/player-store'

// YT iframe ko postMessage se control (enablejsapi=1 zaroori src me)
function ytCommand(iframe: HTMLIFrameElement | null, func: string, args: unknown[] = []) {
  try {
    iframe?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*')
  } catch {
    /* iframe not ready */
  }
}

// YT embed ko batao hum player events sun rahe hain (handshake) — isi ke
// baad wo window.parent ko infoDelivery (playerState) bhejta hai.
function ytListen(iframe: HTMLIFrameElement | null) {
  try {
    iframe?.contentWindow?.postMessage(
      JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }),
      '*'
    )
  } catch {
    /* iframe not ready */
  }
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return n > 0 ? String(n) : ''
}

// v0.3.4: title se hashtags hatao (#shorts #islamic …) — saaf text dikhe.
// Sab kuch tag hai to purana title hi lautao (khaali na dikhe).
function cleanTitle(t: string): string {
  const noTags = t.replace(/#[^\s#]+/g, ' ').replace(/\s+/g, ' ').trim()
  return noTags || t
}

// WhatsApp logo (simple-icons ka path) — brand icons lucide me nahi hote
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  )
}

// ── FULL-SCREEN COVER FIT (v0.3.1) ─────────────────────────────
// YT player video ko iframe ke andar "contain" karta hai (bars).
// Jugad: iframe ko hi video ke aspect me screen se bada stretch karo +
// center — bars crop. v0.3.1 se style globals.css me hai (.qalb-reel-cover-*):
//   • vh fallback → dvh (har WebView me kam-se-kam full-card cover)
//   • thumbnail ke natural aspect se portrait/land class chunti hain —
//     landscape bayan videos bhi ab poora bhar ke dikhte hain
//   • root ab full-bleed inset-0 hai — side white border kabhi nahi

// ── ReelCard ─────────────────────────────────────────────────────

interface ReelCardProps {
  item: ReelItem
  active: boolean // visible && current index (play chalu)
  mounted: boolean // active ±2 (iframe pre-mount — instant swipe)
  suspended: boolean // app background — sound band (v0.3.2)
  fgTick: number // app foreground aane par +1 — resume re-run (v0.3.3)
  liked: boolean
  likeCount: number
  onLike: () => void
  onShare: () => void // WhatsApp status share (legal link share) — v0.3.6
  onWatched: () => void // 2.5s dwell — algorithm + repeat-block mark
}

const ReelCard = memo(function ReelCard({
  item,
  active,
  mounted,
  suspended,
  fgTick,
  liked,
  likeCount,
  onLike,
  onShare,
  onWatched,
}: ReelCardProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  // thumbnail ke natural aspect se cover class (port = 9:16, land = 16:9)
  const [aspect, setAspect] = useState<'port' | 'land'>('port')
  const onThumbLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const im = e.currentTarget
    if (im.naturalWidth > 0 && im.naturalHeight > 0) {
      setAspect(im.naturalWidth / im.naturalHeight > 1.05 ? 'land' : 'port')
    }
  }, [])
  // tap-toggle state (assume chal raha hai jab active — YT se state read karna
  // cross-origin round-trip maangta hai, assumption-based toggle kaafi hai)
  const pausedRef = useRef(false)
  const touchStartRef = useRef<{ x: number; y: number; ts: number } | null>(null)
  const lastTouchRef = useRef(0)

  const togglePlay = useCallback(() => {
    pausedRef.current = !pausedRef.current
    ytCommand(iframeRef.current, pausedRef.current ? 'pauseVideo' : 'playVideo')
  }, [])

  // active toggle → play/pause (retry chain — iframe player late-ready case)
  useEffect(() => {
    if (active) {
      pausedRef.current = false
      const timers = [250, 700, 1600].map((ms) =>
        setTimeout(() => ytCommand(iframeRef.current, 'playVideo'), ms)
      )
      return () => timers.forEach(clearTimeout)
    }
    pausedRef.current = false
    ytCommand(iframeRef.current, 'pauseVideo')
  }, [active])

  // v0.3.2: app minimize → reel PAUSE (sound band); wapas aao → resume.
  // pausedRef chheda nahi — agar user ne khud tap-pause kiya tha to
  // resume par wahi haalat lautti hai. fgTick: foreground wapas aane par
  // forced re-run (bg me suspended set nahi hua ho to bhi resume chale).
  useEffect(() => {
    if (!active) return
    if (suspended) {
      ytCommand(iframeRef.current, 'pauseVideo')
      return
    }
    if (pausedRef.current) return
    const t = window.setTimeout(() => ytCommand(iframeRef.current, 'playVideo'), 120)
    return () => window.clearTimeout(t)
  }, [active, suspended, fgTick])

  // v0.3.2: video START hua ya nahi — YT iframe khud window.parent ko
  // infoDelivery (playerState) bhejta hai (enablejsapi=1). e.source se
  // pata chalta hai kaunsa player bol raha hai. 1 = playing.
  const [videoStarted, setVideoStarted] = useState(false)
  const [coverFallback, setCoverFallback] = useState(false)
  useEffect(() => {
    if (!mounted) return
    const onMsg = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return
      try {
        const d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
        if (d?.event === 'infoDelivery' && d?.info?.playerState === 1) setVideoStarted(true)
      } catch {
        /* non-JSON message — ignore */
      }
    }
    window.addEventListener('message', onMsg)
    const t1 = window.setTimeout(() => ytListen(iframeRef.current), 600)
    const t2 = window.setTimeout(() => ytListen(iframeRef.current), 2000)
    return () => {
      window.removeEventListener('message', onMsg)
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [mounted])

  // safety: YT messages na aaye to 3.2s baad cover hata do — video ka
  // spinner dikh sakta hai, lekin reel kabhi thumb ke niche stuck nahi
  useEffect(() => {
    if (!active) return
    const t = window.setTimeout(() => setCoverFallback(true), 3200)
    return () => window.clearTimeout(t)
  }, [active])

  // cover = thumbnail overlay: active nahi (feed me thumb) YA video abhi
  // start nahi hua (YT ka black+spinner chhupa rehta hai)
  const showCover = !active || (!videoStarted && !coverFallback)

  // 2.5s dwell → watched (interest algorithm + seen/repeat-block)
  useEffect(() => {
    if (!active) return
    const t = window.setTimeout(onWatched, 2500)
    return () => window.clearTimeout(t)
  }, [active, onWatched])

  // naat start hua jab reel active? → reel pause (do awaaz nahi)
  useEffect(() => {
    if (!active) return
    return usePlayerStore.subscribe((s, prev) => {
      if (s.isPlaying && !prev.isPlaying) {
        pausedRef.current = true
        ytCommand(iframeRef.current, 'pauseVideo')
      }
    })
  }, [active])

  // ── touch-capture overlay ──
  // YouTube iframe ke upar transparent layer: swipe → snap container
  // natively scroll hota hai (touch descendant se bubble hota hai), tap →
  // play/pause toggle. Iske bina swipe iframe ke andar chala jata hai aur
  // agla reel kabhi nahi aata (classic reels-with-iframe bug).
  const overlayTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0]
    touchStartRef.current = { x: t.clientX, y: t.clientY, ts: Date.now() }
  }, [])
  const overlayTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const s = touchStartRef.current
      touchStartRef.current = null
      if (!s) return
      const t = e.changedTouches[0]
      const moved = Math.abs(t.clientY - s.y) + Math.abs(t.clientX - s.x)
      if (moved < 14 && Date.now() - s.ts < 600) togglePlay()
    },
    [togglePlay]
  )
  const overlayClick = useCallback(() => {
    // touch ke baad click double-fire na ho (touchend already toggle kar chuka)
    if (Date.now() - lastTouchRef.current < 600) return
    togglePlay()
  }, [togglePlay])
  const overlayTouchEndWithTs = useCallback(
    (e: React.TouchEvent) => {
      lastTouchRef.current = Date.now()
      overlayTouchEnd(e)
    },
    [overlayTouchEnd]
  )

  return (
    <div className="relative h-full w-full shrink-0 snap-start snap-always overflow-hidden bg-black">
      {/* blurred backdrop (iframe load hone tak bhi card khaali na lage) */}
      <img
        src={item.thumb}
        alt=""
        aria-hidden
        loading="lazy"
        onLoad={onThumbLoad}
        className="absolute inset-0 h-full w-full scale-125 object-cover opacity-40 blur-2xl"
      />

      {mounted ? (
        <iframe
          ref={iframeRef}
          data-vid={item.videoId}
          className={`qalb-reel-cover absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2 ${
            aspect === 'land' ? 'qalb-reel-cover-land' : 'qalb-reel-cover-port'
          }`}
          src={`https://www.youtube.com/embed/${item.videoId}?playsinline=1&enablejsapi=1&controls=0&rel=0&modestbranding=1&iv_load_policy=3&fs=0`}
          title={item.title}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      ) : null}

      {/* v0.3.2: cover — video start hone tak thumbnail dikhti rahi hai
          (YT ka buffering spinner / black screen kabhi nahi jhalakta).
          touch-overlay (z-[1], DOM me baad me) tap/swipe leta hai. */}
      {mounted && showCover && (
        <img
          src={item.thumb}
          alt={item.title}
          loading="lazy"
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[1] h-full w-full object-cover"
        />
      )}
      {!mounted && (
        <img src={item.thumb} alt={item.title} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
      )}

      {/* touch-capture overlay — swipe container tak bubble hota hai, tap = play/pause */}
      <div
        className="absolute inset-0 z-[1]"
        onTouchStart={overlayTouchStart}
        onTouchEnd={overlayTouchEndWithTs}
        onClick={overlayClick}
        aria-hidden
      />

      {/* top gradient + minimal header (Instagram style — koi chips nahi) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[2] bg-gradient-to-b from-black/70 via-black/25 to-transparent px-4 pb-10 pt-[calc(env(safe-area-inset-top)+10px)]">
        <span className="text-[17px] font-extrabold tracking-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
          Reels
        </span>
        <span className="ml-2 align-middle text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-300">
          Islamic
        </span>
      </div>

      {/* bottom gradient + reel info */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-52 bg-gradient-to-t from-black/90 via-black/45 to-transparent" />
      <div className="pointer-events-none absolute bottom-[3.4rem] left-4 right-[4.6rem]">
        <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
          {cleanTitle(item.title)}
        </p>
        <p className="mt-0.5 text-xs text-white/70">{item.views}</p>
      </div>

      {/* action rail — Instagram style: ❤️ + WhatsApp status */}
      <div className="absolute bottom-[3.4rem] right-3 z-[2] flex flex-col items-center gap-4">
        <button
          type="button"
          aria-label={liked ? 'Unlike' : 'Like'}
          onClick={onLike}
          className="flex min-h-[2.75rem] min-w-[2.75rem] flex-col items-center justify-center gap-0.5 rounded-full bg-black/25 px-2 py-1.5 backdrop-blur-sm transition active:scale-90"
        >
          <Heart
            className={`h-6 w-6 drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)] transition ${
              liked ? 'fill-rose-500 text-rose-500' : 'text-white'
            }`}
          />
          <span className="text-[11px] font-semibold text-white drop-shadow">{fmtCount(likeCount)}</span>
        </button>

        {/* v0.3.6: WhatsApp status — LEGAL link share. Tap → whatsapp://
            deep link seedha WhatsApp "Send to…" kholtа hai (My status top
            option). Video-file share NAHI — sirf official YouTube link. */}
        <button
          type="button"
          aria-label="WhatsApp status par share karo"
          onClick={onShare}
          className="flex min-h-[2.75rem] min-w-[2.75rem] flex-col items-center justify-center gap-0.5 rounded-full bg-black/25 px-2 py-1.5 backdrop-blur-sm transition active:scale-90"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#25D366] shadow-[0_1px_3px_rgba(0,0,0,0.7)]">
            <WhatsAppIcon className="h-[15px] w-[15px] text-white" />
          </span>
          <span className="text-[10px] font-semibold text-white drop-shadow">Status</span>
        </button>
      </div>
    </div>
  )
})

// ── ReelsView ────────────────────────────────────────────────────

export function ReelsView({ visible }: { visible: boolean }) {
  const [items, setItems] = useState<ReelItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const [myLikes, setMyLikes] = useState<Set<string>>(new Set())
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [reloadTick, setReloadTick] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  // v0.3.2: app background (minimize) — reel sound band
  const [suspended, setSuspended] = useState(false)
  // v0.3.3: foreground wapas → resume re-run trigger
  const [fgTick, setFgTick] = useState(0)
  const [showLoader, setShowLoader] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const loadingMoreRef = useRef(false)
  const toastTimer = useRef<number>(0)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2400)
  }, [])

  // pehli visible par load (tab open hote hi — cache-first = instant)
  useEffect(() => {
    if (!visible || loaded) return
    let alive = true
    setLoading(true)
    void (async () => {
      setMyLikes(getMyLikedReels())
      const [feed, remoteCounts] = await Promise.all([
        getReels().catch(() => null),
        getLikeCounts().catch(() => ({} as Record<string, number>)),
      ])
      if (!alive) return
      if (feed) setItems(feed.items)
      setCounts(remoteCounts)
      setLoaded(true)
      setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [visible, loaded, reloadTick])

  // v0.3.2/0.3.3: app minimize/background → suspended=true. Native path:
  // MainActivity onPause 'qalbAppBg' bhejta hai. Web/PWA fallback:
  // visibilitychange. Foreground par suspended=false + fgTick++ (reel
  // resume, chahe background event pahuncha ho ya na).
  useEffect(() => {
    const onBg = (e: Event) => setSuspended((e as CustomEvent).detail?.bg !== false)
    const onFg = () => {
      setSuspended(false)
      setFgTick((t) => t + 1)
    }
    const onVis = () => {
      if (document.hidden) setSuspended(true)
      else onFg()
    }
    window.addEventListener('qalbAppBg', onBg)
    window.addEventListener('qalbAppFg', onFg)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('qalbAppBg', onBg)
      window.removeEventListener('qalbAppFg', onFg)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  // v0.3.3 GUARANTEED bg-pause: reels dikh rahe + naat CHUP → native flag
  // ON. App minimize par MainActivity WebView ka media NATIVELY pause
  // karta hai (background me JS execute nahi hota — v0.3.2 ka JS-only
  // fix isliye fail hua tha). Naat shuru ho to flag OFF — wo background
  // me chalti rahegi. Naat play/pause par bhi turant re-arm hota hai.
  useEffect(() => {
    const sync = () => {
      const naatPlaying = usePlayerStore.getState().isPlaying
      void nativeSetBgPauseMedia(visible && !naatPlaying)
    }
    sync()
    return usePlayerStore.subscribe((s, prev) => {
      if (s.isPlaying !== prev.isPlaying) sync()
    })
  }, [visible])

  // feed loader 400ms der se — cache-first instant load par spinner
  // flash nahi hota (sirf sach me slow network par dikhta hai)
  useEffect(() => {
    if (!loading) {
      setShowLoader(false)
      return
    }
    const t = window.setTimeout(() => setShowLoader(true), 400)
    return () => window.clearTimeout(t)
  }, [loading])

  // YT/googlevideo preconnect — swipe ke waqt iframe connection warm rahe
  useEffect(() => {
    const hosts = ['https://www.youtube.com', 'https://i.ytimg.com', 'https://googlevideo.com']
    const links = hosts.map((h) => {
      const l = document.createElement('link')
      l.rel = 'preconnect'
      l.href = h
      document.head.appendChild(l)
      return l
    })
    return () => links.forEach((l) => l.remove())
  }, [])

  // scroll → active reel index (snap scroll se exact hota hai)
  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el || el.clientHeight === 0) return
    const idx = Math.round(el.scrollTop / el.clientHeight)
    setActiveIdx((prev) => (prev === idx ? prev : idx))
  }, [])

  // reel visible → naat pause (reel khud apni awaaz ke sath chalta hai)
  useEffect(() => {
    if (!visible) return
    const st = usePlayerStore.getState()
    if (st.isPlaying) st.pause()
  }, [visible, activeIdx])

  // v0.3.1: reels khule to page ka background bhi kaala — kisi bhi
  // gap/overscroll/gesture-area me white kabhi na jhalke
  useEffect(() => {
    if (!visible) return
    const prev = document.body.style.backgroundColor
    document.body.style.backgroundColor = '#000'
    return () => {
      document.body.style.backgroundColor = prev
    }
  }, [visible])

  // dwell-watch → algorithm stats (reels.ts recordReelWatch)
  const onWatched = useCallback((item: ReelItem) => {
    recordReelWatch(item.videoId, item.category)
  }, [])

  // INFINITE feed — end se 4 pehle silently next batch (rotating queries)
  useEffect(() => {
    if (!visible || !loaded || !hasMore || !items.length) return
    if (activeIdx < items.length - 4) return
    if (loadingMoreRef.current) return
    loadingMoreRef.current = true
    void (async () => {
      try {
        const more = await loadMoreReels(items)
        if (!more.length) {
          setHasMore(false)
          return
        }
        setItems((prev) => {
          const have = new Set(prev.map((p) => p.videoId))
          const add = more.filter((m) => !have.has(m.videoId))
          return add.length ? [...prev, ...add] : prev
        })
      } catch {
        setHasMore(false)
      } finally {
        loadingMoreRef.current = false
      }
    })()
  }, [visible, loaded, activeIdx, items, hasMore])

  const toggleLike = useCallback(
    (videoId: string) => {
      const liked = myLikes.has(videoId)
      const next = new Set(myLikes)
      if (liked) next.delete(videoId)
      else next.add(videoId)
      setMyLikes(next)
      setReelLiked(videoId, !liked)
      setCounts((c) => ({ ...c, [videoId]: Math.max(0, (c[videoId] ?? 0) + (liked ? -1 : 1)) }))
      void likeReelRemote(videoId, liked ? -1 : 1).catch(() => {
        /* rules/auth baad me — local state sahi hai */
      })
    },
    [myLikes]
  )

  // ── v0.3.6: WhatsApp STATUS share (download ka legal badal) ─────
  // YouTube ab har third-party downloader ko bot-check se block karta
  // hai (live-verified: saare InnerTube clients + yt-dlp = LOGIN_REQUIRED).
  // Isliye download button gaya; uski jagah WhatsApp share — 100% legal:
  // sirf OFFICIAL YouTube link jata hai (file nahi), wahi jo YouTube ka
  // apna share button karta hai. Status par link se thumbnail preview
  // khud ban jata hai.
  const shareReel = useCallback(
    async (item: ReelItem) => {
      const url = `https://youtu.be/${item.videoId}`
      const text = `${cleanTitle(item.title)} — Qalb par suniye:\n${url}`
      // 1) Seedha WhatsApp: whatsapp:// deep link. Capacitor launchIntent
      //    external scheme par ACTION_VIEW startActivity karta hai (app
      //    na ho to ActivityNotFoundException chupchaap catch hota hai)
      //    aur hamesha true lauta ke page navigation rok deta hai —
      //    isliye background-check safe hai.
      let wentBg = false
      const onBg = () => {
        wentBg = true
      }
      document.addEventListener('visibilitychange', onBg)
      try {
        window.location.href = `whatsapp://send?text=${encodeURIComponent(text)}`
      } catch {
        /* ignore — niche fallback chalega */
      }
      await new Promise((r) => setTimeout(r, 1400))
      document.removeEventListener('visibilitychange', onBg)
      if (wentBg || document.hidden) return // WhatsApp khul gaya
      // 2) WhatsApp nahi mila → system share sheet (WhatsApp usme bhi hota hai)
      try {
        if (typeof navigator.share === 'function') {
          await navigator.share({ title: 'Qalb — Islamic Naat & Reels', text, url })
          return
        }
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return
      }
      // 3) Last resort: link clipboard me — WhatsApp me paste kar do
      try {
        await navigator.clipboard.writeText(url)
        showToast('Link copy ho gaya — WhatsApp status me paste karo')
      } catch {
        showToast('WhatsApp app nahi mili')
      }
    },
    [showToast]
  )

  const retry = useCallback(() => {
    clearReelsCache()
    setHasMore(true)
    setLoaded(false)
    setReloadTick((t) => t + 1)
  }, [])

  return (
    <div
      className="fixed inset-0 z-[45] bg-black"
      style={{
        bottom: 'calc(3.5rem + env(safe-area-inset-bottom))',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      {showLoader && (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-white/70">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-300" />
          <p className="text-sm">Reels load ho rahi hain…</p>
        </div>
      )}

      {!loading && loaded && items.length === 0 && (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
          <SearchX className="h-9 w-9 text-white/40" />
          <p className="text-sm text-white/70">Reels abhi load nahi hui — net check karo</p>
          <button
            type="button"
            onClick={retry}
            className="mt-1 flex items-center gap-1.5 rounded-full bg-emerald-400 px-4 py-2 text-xs font-bold text-emerald-950 active:scale-95"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Dobara koshish
          </button>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="no-scrollbar h-full snap-y snap-mandatory overflow-y-scroll overscroll-y-contain"
        >
          {items.map((item, i) => (
            <ReelCard
              key={item.videoId}
              item={item}
              active={visible && i === activeIdx}
              mounted={Math.abs(i - activeIdx) <= 2}
              suspended={suspended}
              fgTick={fgTick}
              liked={myLikes.has(item.videoId)}
              likeCount={
                Math.max(0, counts[item.videoId] ?? 0) +
                (myLikes.has(item.videoId) && !(counts[item.videoId] ?? 0) ? 1 : 0)
              }
              onLike={() => toggleLike(item.videoId)}
              onShare={() => void shareReel(item)}
              onWatched={() => onWatched(item)}
            />
          ))}
        </div>
      )}

      {/* toast — share / info messages */}
      {toast && (
        <div className="pointer-events-none absolute inset-x-6 bottom-6 z-[3] flex justify-center">
          <span className="rounded-full bg-black/85 px-4 py-2 text-center text-xs font-medium text-white shadow-lg backdrop-blur-sm">
            {toast}
          </span>
        </div>
      )}
    </div>
  )
}
