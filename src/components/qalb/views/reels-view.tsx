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
//  • DOWNLOAD ⬇: InnerTube progressive mp4 → native MediaStore
//    (Gallery → Movies → Qalb), progress % ke sath.
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
import { Check, Download, Heart, Loader2, RefreshCw, SearchX } from 'lucide-react'
import {
  clearReelsCache,
  getDownloadedReels,
  getLikeCounts,
  getMyLikedReels,
  getReels,
  getReelStreamUrl,
  likeReelRemote,
  loadMoreReels,
  markReelDownloaded,
  recordReelWatch,
  setReelLiked,
  type ReelItem,
} from '@/lib/reels'
import { isNativeApp, nativeCancelReelDownload, nativeDownloadReel } from '@/plugins/qalb-native'
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

// ── FULL-SCREEN COVER FIT (v0.3.1) ─────────────────────────────
// YT player video ko iframe ke andar "contain" karta hai (bars).
// Jugad: iframe ko hi video ke aspect me screen se bada stretch karo +
// center — bars crop. v0.3.1 se style globals.css me hai (.qalb-reel-cover-*):
//   • vh fallback → dvh (har WebView me kam-se-kam full-card cover)
//   • thumbnail ke natural aspect se portrait/land class chunti hain —
//     landscape bayan videos bhi ab poora bhar ke dikhte hain
//   • root ab full-bleed inset-0 hai — side white border kabhi nahi

// ── download state (per reel) ────────────────────────────────────

type DlState = { status: 'working'; pct: number } | 'done' | 'error'

// ── ReelCard ─────────────────────────────────────────────────────

interface ReelCardProps {
  item: ReelItem
  active: boolean // visible && current index (play chalu)
  mounted: boolean // active ±2 (iframe pre-mount — instant swipe)
  suspended: boolean // app background — sound band (v0.3.2)
  liked: boolean
  likeCount: number
  dl: DlState | 'idle'
  onLike: () => void
  onDownload: () => void
  onWatched: () => void // 2.5s dwell — algorithm + repeat-block mark
}

const ReelCard = memo(function ReelCard({
  item,
  active,
  mounted,
  suspended,
  liked,
  likeCount,
  dl,
  onLike,
  onDownload,
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
  // resume par wahi haalat lautti hai.
  useEffect(() => {
    if (!active) return
    if (suspended) {
      ytCommand(iframeRef.current, 'pauseVideo')
      return
    }
    if (pausedRef.current) return
    const t = window.setTimeout(() => ytCommand(iframeRef.current, 'playVideo'), 120)
    return () => window.clearTimeout(t)
  }, [active, suspended])

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

  const dlBusy = typeof dl === 'object' && dl.status === 'working'

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
          {item.title}
        </p>
        <p className="mt-0.5 text-xs text-white/70">{item.views}</p>
      </div>

      {/* action rail — Instagram style: ❤️ + ⬇ */}
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

        <button
          type="button"
          aria-label={dl === 'done' ? 'Downloaded' : 'Offline download'}
          onClick={onDownload}
          className="flex min-h-[2.75rem] min-w-[2.75rem] flex-col items-center justify-center gap-0.5 rounded-full bg-black/25 px-2 py-1.5 backdrop-blur-sm transition active:scale-90"
        >
          {dl === 'done' ? (
            <Check className="h-6 w-6 text-emerald-300 drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)]" />
          ) : dlBusy ? (
            <Loader2 className="h-6 w-6 animate-spin text-emerald-300 drop-shadow" />
          ) : (
            <Download
              className={`h-6 w-6 drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)] ${
                dl === 'error' ? 'text-rose-400' : 'text-white'
              }`}
            />
          )}
          <span className="text-[10px] font-semibold text-white drop-shadow">
            {dl === 'done' ? 'Saved' : dlBusy ? `${(dl as { pct: number }).pct}%` : 'Save'}
          </span>
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
  const [dlMap, setDlMap] = useState<Record<string, DlState>>({})
  const [downloadedSet, setDownloadedSet] = useState<Set<string>>(new Set())
  const [hasMore, setHasMore] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  // v0.3.2: app background (minimize) — reel sound band
  const [suspended, setSuspended] = useState(false)
  const [showLoader, setShowLoader] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const loadingMoreRef = useRef(false)
  const busyDlRef = useRef<string | null>(null)
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
      setDownloadedSet(getDownloadedReels())
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

  // v0.3.2: app minimize/background → suspended=true. Native path:
  // MainActivity onPause/onResume 'qalbAppBg' bhejta hai (guaranteed —
  // WebView me document.hidden fire nahi hota). Web/PWA fallback:
  // visibilitychange.
  useEffect(() => {
    const onBg = (e: Event) => setSuspended((e as CustomEvent).detail?.bg !== false)
    const onVis = () => setSuspended(document.hidden)
    window.addEventListener('qalbAppBg', onBg)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('qalbAppBg', onBg)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

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

  // ── offline download ──
  const startDownload = useCallback(
    async (item: ReelItem) => {
      if (!isNativeApp()) {
        showToast('Offline download app (APK) me available hai')
        return
      }
      if (downloadedSet.has(item.videoId) || dlMap[item.videoId] === 'done') {
        showToast('Ye reel saved hai — Gallery → Movies → Qalb')
        return
      }
      const cur = dlMap[item.videoId]
      if (typeof cur === 'object' && cur.status === 'working') {
        // chalu download par dobara tap = cancel
        await nativeCancelReelDownload(item.videoId)
        showToast('Download cancel ho gaya')
        return
      }
      if (busyDlRef.current) {
        showToast('Ek download chal raha hai — pehle wo complete ho')
        return
      }
      busyDlRef.current = item.videoId
      setDlMap((m) => ({ ...m, [item.videoId]: { status: 'working', pct: 0 } }))
      try {
        showToast('Stream mile to download shuru…')
        const url = await getReelStreamUrl(item.videoId)
        if (!url) throw new Error('stream nahi mili')
        await nativeDownloadReel(url, `Qalb-${item.videoId}.mp4`, item.videoId, (pct) => {
          setDlMap((m) => {
            const state = m[item.videoId]
            if (typeof state === 'object' && state.status === 'working') {
              return { ...m, [item.videoId]: { status: 'working', pct } }
            }
            return m
          })
        })
        markReelDownloaded(item.videoId)
        setDownloadedSet(getDownloadedReels())
        setDlMap((m) => ({ ...m, [item.videoId]: 'done' }))
        showToast('Ho gaya — Gallery → Movies → Qalb')
      } catch {
        setDlMap((m) => ({ ...m, [item.videoId]: 'error' }))
        showToast('Download fail — thodi der baad try karo')
        window.setTimeout(() => {
          setDlMap((m) => {
            if (m[item.videoId] === 'error') {
              const next = { ...m }
              delete next[item.videoId]
              return next
            }
            return m
          })
        }, 1600)
      } finally {
        busyDlRef.current = null
      }
    },
    [dlMap, downloadedSet, showToast]
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
          {items.map((item, i) => {
            const downloaded = downloadedSet.has(item.videoId)
            const rawDl = dlMap[item.videoId]
            const dl: DlState | 'idle' = rawDl ?? (downloaded ? 'done' : 'idle')
            return (
              <ReelCard
                key={item.videoId}
                item={item}
                active={visible && i === activeIdx}
                mounted={Math.abs(i - activeIdx) <= 2}
                suspended={suspended}
                liked={myLikes.has(item.videoId)}
                likeCount={
                  Math.max(0, counts[item.videoId] ?? 0) +
                  (myLikes.has(item.videoId) && !(counts[item.videoId] ?? 0) ? 1 : 0)
                }
                dl={dl}
                onLike={() => toggleLike(item.videoId)}
                onDownload={() => void startDownload(item)}
                onWatched={() => onWatched(item)}
              />
            )
          })}
        </div>
      )}

      {/* toast — download / info messages */}
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
