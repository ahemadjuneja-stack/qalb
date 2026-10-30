'use client'

// Qalb — Islamic Reels (v0.2.5)
// ─────────────────────────────────────────────────────────────────
// Full-screen 9:16 vertical Shorts feed — Instagram Reels jaisa swipe.
//
//  • Content HYBRID: Firestore curated pins + YouTube Shorts auto
//    (sirf Islamic queries, sirf guaranteed-vertical shortsLockup items)
//  • Like ❤️: global count Firestore `reelMeta/likes` (increment transform),
//    per-device liked state localStorage — rules publish hone tak local hi chalega
//  • Naat conflict handling: reel play → naat pause; naat play → reel pause
//  • WebView autoplay: Capacitor mediaPlaybackRequiresUserGesture=false,
//    + playVideo retry chain (web preview ke liye bhi)

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Heart, Loader2, RefreshCw, SearchX } from 'lucide-react'
import {
  REEL_CATEGORIES,
  clearReelsCache,
  getLikeCounts,
  getMyLikedReels,
  getReels,
  likeReelRemote,
  setReelLiked,
  type ReelItem,
} from '@/lib/reels'
import { usePlayerStore } from '@/lib/player-store'

// YT iframe ko postMessage se control (enablejsapi=1 zaroori src me)
function ytCommand(iframe: HTMLIFrameElement | null, func: string, args: unknown[] = []) {
  try {
    iframe?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*')
  } catch {
    /* iframe not ready */
  }
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return n > 0 ? String(n) : ''
}

// ── ReelCard ─────────────────────────────────────────────────────

interface ReelCardProps {
  item: ReelItem
  active: boolean // visible && current index (play chalu)
  mounted: boolean // active ±1 (iframe lazy mount — data bachao)
  liked: boolean
  likeCount: number
  onLike: () => void
}

const ReelCard = memo(function ReelCard({
  item,
  active,
  mounted,
  liked,
  likeCount,
  onLike,
}: ReelCardProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  // tap-toggle state (assume chal raha hai jab active — YT se state read karna
  // cross-origin round-trip maangta hai, v1 me assumption-based toggle)
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
      const timers = [300, 900, 2200].map((ms) =>
        setTimeout(() => ytCommand(iframeRef.current, 'playVideo'), ms)
      )
      return () => timers.forEach(clearTimeout)
    }
    pausedRef.current = false
    ytCommand(iframeRef.current, 'pauseVideo')
  }, [active])

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
        className="absolute inset-0 h-full w-full scale-125 object-cover opacity-40 blur-2xl"
      />

      {mounted ? (
        <iframe
          ref={iframeRef}
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube.com/embed/${item.videoId}?playsinline=1&enablejsapi=1&controls=0&rel=0&modestbranding=1&iv_load_policy=3&fs=0`}
          title={item.title}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
      ) : (
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

      {/* bottom gradient + reel info (pointer-events-none — YT controls tapable rahein) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-52 bg-gradient-to-t from-black/90 via-black/45 to-transparent" />
      <div className="pointer-events-none absolute bottom-[3.4rem] left-4 right-[4.6rem]">
        <span className="mb-1.5 inline-block rounded-full bg-emerald-500/25 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-200 backdrop-blur-sm">
          {item.source === 'curated' ? `★ ${item.category}` : item.category}
        </span>
        <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
          {item.title}
        </p>
        <p className="mt-0.5 text-xs text-white/70">{item.views}</p>
      </div>

      {/* like rail */}
      <button
        type="button"
        aria-label={liked ? 'Unlike' : 'Like'}
        onClick={onLike}
        className="absolute bottom-[3.4rem] right-3 z-[2] flex min-h-[2.75rem] min-w-[2.75rem] flex-col items-center justify-center gap-0.5 rounded-full bg-black/25 px-2 py-1.5 backdrop-blur-sm transition active:scale-90"
      >
        <Heart
          className={`h-6 w-6 drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)] transition ${
            liked ? 'fill-rose-500 text-rose-500' : 'text-white'
          }`}
        />
        <span className="text-[11px] font-semibold text-white drop-shadow">{fmtCount(likeCount)}</span>
      </button>
    </div>
  )
})

// ── ReelsView ────────────────────────────────────────────────────

export function ReelsView({ visible }: { visible: boolean }) {
  const [items, setItems] = useState<ReelItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [chip, setChip] = useState('all')
  const [activeIdx, setActiveIdx] = useState(0)
  const [myLikes, setMyLikes] = useState<Set<string>>(new Set())
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [reloadTick, setReloadTick] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  // pehli visible par load (tab open hote hi — background me nahi)
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

  const filtered = useMemo(
    () => (chip === 'all' ? items : items.filter((i) => i.category === chip)),
    [items, chip]
  )

  // chip switch → top par wapas
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
    setActiveIdx(0)
  }, [chip])

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

  const retry = useCallback(() => {
    clearReelsCache()
    setLoaded(false)
    setReloadTick((t) => t + 1)
  }, [])

  return (
    <div
      className="fixed inset-x-0 top-0 z-[45] mx-auto max-w-md bg-black md:max-w-lg"
      style={{
        bottom: 'calc(3.5rem + env(safe-area-inset-bottom))',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      {/* category chips */}
      <div className="absolute inset-x-0 top-0 z-10 flex gap-2 overflow-x-auto px-3 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] no-scrollbar">
        {REEL_CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setChip(c.key)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold backdrop-blur-md transition active:scale-95 ${
              chip === c.key
                ? 'bg-emerald-400 text-emerald-950 shadow-[0_0_16px_rgba(52,211,153,0.5)]'
                : 'bg-black/40 text-white/85'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-white/70">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-300" />
          <p className="text-sm">Reels load ho rahi hain…</p>
        </div>
      )}

      {!loading && loaded && filtered.length === 0 && (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
          <SearchX className="h-9 w-9 text-white/40" />
          <p className="text-sm text-white/70">Is category me abhi reels nahi mili</p>
          <button
            type="button"
            onClick={retry}
            className="mt-1 flex items-center gap-1.5 rounded-full bg-emerald-400 px-4 py-2 text-xs font-bold text-emerald-950 active:scale-95"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Dobara koshish
          </button>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="no-scrollbar h-full snap-y snap-mandatory overflow-y-scroll overscroll-y-contain"
        >
          {filtered.map((item, i) => (
            <ReelCard
              key={item.videoId}
              item={item}
              active={visible && i === activeIdx}
              mounted={Math.abs(i - activeIdx) <= 1}
              liked={myLikes.has(item.videoId)}
              likeCount={Math.max(0, counts[item.videoId] ?? 0) + (myLikes.has(item.videoId) && !(counts[item.videoId] ?? 0) ? 1 : 0)}
              onLike={() => toggleLike(item.videoId)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
