'use client'

// iTube — YouTube-style Islamic video hub (v0.5.3 SMART FEED)
// ─────────────────────────────────────────────────────────────────
// Shell ka global QalbHeader upar — yahan search bar + chips + feed.
//
// "AAP KE LIYE" — YouTube-jaisa smart algorithm (lib/itube-brain.ts):
//   • User jo dekhta hai usi ke hisab se suggestions (taste engine)
//   • Naat dekhne wale ko naat zyada + baaki islamic mix bhi — watch
//     time badhe; informative dekhne wale ko informative
//   • HAR BAR tab kholne par NAYA feed (salt rotate + repeat-kill ring
//     — jo dikh chuka wo dobara nahi aata)
//   • Infinite scroll — pool khatam to naya round (naye queries)
//
// Baaki chips/search — InnerTube enriched search + strict Islamic filter.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, Check, ExternalLink, Loader2, Search, TriangleAlert, Users, X } from 'lucide-react'
import { usePlayerStore } from '@/lib/player-store'
import { viewsLabel } from '@/lib/innertube-x'
import { useToast } from '@/hooks/use-toast'
import { useViewBackHandler } from '@/lib/back-stack'
import { isNativeApp, nativeOpenExternal } from '@/plugins/qalb-native'
import {
  asChannelInfo,
  channelRefOf,
  fetchChannelVideos,
  getFeaturedChannels,
  hydrateSubs,
  isSubscribed,
  listSubs,
  refreshSubMeta,
  searchChannels,
  toggleSub,
  type ChannelInfo,
} from '@/lib/itube-channels'
import {
  ITUBE_CHIPS,
  itubeFetch,
  trackDurSec,
  trackPub,
  fmtDur,
  type ITubeChip,
} from '@/lib/itube'
import {
  buildItubeFeed,
  markShown,
  splitSeen,
} from '@/lib/itube-brain'
import { ItubeWatch } from '@/components/qalb/itube-watch'
import type { QalbTrack } from '@/lib/types'

type Mode =
  | { kind: 'foryou'; n?: number }
  | { kind: 'channels' }
  | { kind: 'chip'; chip: ITubeChip; n?: number }
  | { kind: 'search'; query: string; n?: number }
  | { kind: 'channel'; ch: ChannelInfo }

const PAGE = 14

// horizontal scroll bars chhupe (chips/subscriptions rows)
const NO_SCROLL = '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'

/** Channel avatar — image ho to image, warna naam ka pehla akshar */
function ChannelAvatar({ name, avatar, cls }: { name: string; avatar: string | null; cls: string }) {
  return avatar ? (
    <img
      src={avatar}
      alt={name}
      loading="lazy"
      className={`${cls} shrink-0 rounded-full bg-emerald-400/10 object-cover`}
    />
  ) : (
    <span
      className={`${cls} flex shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-[14px] font-black text-emerald-100/70`}
      aria-hidden="true"
    >
      {(name || 'C').trim().charAt(0).toUpperCase()}
    </span>
  )
}

/** Subscribe button — app-level follow (asli YT subscribe ke liye YouTube button) */
function SubscribeBtn({
  ch,
  subbed,
  onToggle,
  big,
}: {
  ch: ChannelInfo
  subbed: boolean
  onToggle: (c: ChannelInfo) => void
  big?: boolean
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onToggle(ch)
      }}
      aria-pressed={subbed}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-full font-bold transition active:scale-95 ${
        big ? 'py-2.5 text-[12.5px]' : 'py-1.5 text-[11px]'
      } ${
        subbed
          ? 'border border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-100/75'
          : 'bg-emerald-400 text-emerald-950 shadow-[0_0_16px_-4px_var(--glow)]'
      }`}
    >
      {subbed ? <Check className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
      {subbed ? 'Subscribed' : 'Subscribe'}
    </button>
  )
}

// network watchdog — request atki to skeleton FOREVER na atke (v0.5.9)
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('itube-timeout')), ms)
    p.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}

const ITUBE_WATCHDOG_MS = 15000

// v0.5.42 — PULL-TO-REFRESH tuning (native app jaisi feel)
const PTR_TRIGGER = 68 // itna kheencha (damped) to refresh fire
const PTR_MAX = 132    // indicator rubber-band limit
const PTR_DAMP = 0.42  // finger-pixel → indicator-pixel damping

export function ITubeView({ visible }: { visible: boolean }) {
  const { toast } = useToast()
  const [watch, setWatch] = useState<QalbTrack | null>(null)
  const [mode, setMode] = useState<Mode>({ kind: 'foryou' })

  // foryou smart feed pool
  const [feed, setFeed] = useState<QalbTrack[]>([])
  const [shown, setShown] = useState(0) // kitne render ho chuke
  const [tasteInfo, setTasteInfo] = useState<number>(0)
  // v0.5.38 — feed kahan se aaya: 'live' (Data API) ya 'pool' (offline)
  const [feedSrc, setFeedSrc] = useState<'live' | 'pool'>('live')

  // chip/search/channel list
  const [tracks, setTracks] = useState<QalbTrack[]>([])
  const [cont, setCont] = useState<string | null>(null)

  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [failed, setFailed] = useState(false)
  const [input, setInput] = useState('')
  const reqId = useRef(0)
  const saltRef = useRef(0)
  const wasVisible = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── v0.5.42 pull-to-refresh state ──
  const [pullPx, setPullPx] = useState(0)     // abhi kitna kheencha (damped)
  const [refreshing, setRefreshing] = useState(false)
  const pullPxRef = useRef(0)                 // touch-end par sync read ke liye

  // ── channels (v0.5.21) ──
  const [, setSubsTick] = useState(0) // subscribe toggle par re-render
  const [channelMeta, setChannelMeta] = useState<{ title: string; avatar: string; subs: string } | null>(null)
  const [feat, setFeat] = useState<ChannelInfo[]>([])
  const [featLoaded, setFeatLoaded] = useState(false)
  const [chanResults, setChanResults] = useState<ChannelInfo[]>([]) // channels-tab search
  const [chanBusy, setChanBusy] = useState(false)
  const [searchChans, setSearchChans] = useState<ChannelInfo[]>([]) // search mode channel row

  const listTracks = mode.kind === 'foryou' ? feed.slice(0, shown) : tracks
  const subs = listSubs()

  // ── FORYOU: fresh feed (har call naya mix) ─────────────────────
  const loadForYou = useCallback(async (newSalt: number) => {
    const my = ++reqId.current
    setLoading(true)
    setFailed(false)
    try {
      const res = await withTimeout(buildItubeFeed(newSalt), ITUBE_WATCHDOG_MS)
      if (my !== reqId.current) return
      // repeat-kill — jo dikh chuke wo hatao (pool thna ho to purane wapas)
      const { fresh, reused } = splitSeen(res.tracks)
      let pool = fresh
      if (pool.length < PAGE) pool = [...pool, ...reused.slice(0, PAGE - pool.length)]
      if (!pool.length) pool = res.tracks // sab seen ho to bhi kuch dikhao
      setFeed(pool)
      setTasteInfo(res.tasteEvents)
      setFeedSrc(res.source)
      setShown(Math.min(PAGE, pool.length))
      markShown(pool.slice(0, Math.min(PAGE, pool.length)).map((t) => t.videoId))
    } catch {
      if (my === reqId.current) {
        setFeed([])
        setShown(0)
        setFailed(true)
      }
    } finally {
      if (my === reqId.current) setLoading(false)
    }
  }, [])

  // ── FORYOU: load more — pool khatam to naya round (append, dedupe) ──
  const loadMoreForYou = useCallback(async () => {
    if (shown < feed.length) {
      const next = Math.min(shown + PAGE, feed.length)
      markShown(feed.slice(shown, next).map((t) => t.videoId))
      setShown(next)
      return
    }
    // pool khatam — naya round: naye query variants, purane skip
    const nextSalt = saltRef.current + 1
    const my = ++reqId.current
    setLoadingMore(true)
    try {
      const res = await withTimeout(buildItubeFeed(nextSalt), ITUBE_WATCHDOG_MS)
      if (my !== reqId.current) return
      saltRef.current = nextSalt
      const have = new Set(feed.map((t) => t.videoId))
      const add = res.tracks.filter((t) => !have.has(t.videoId))
      if (add.length) {
        setFeed((prev) => [...prev, ...add])
        markShown(add.slice(0, PAGE).map((t) => t.videoId))
        setShown(feed.length + Math.min(add.length, PAGE))
      } else {
        // sab repeat — feed replace (guaranteed fresh feel)
        setFeed(res.tracks)
        setShown(PAGE)
        markShown(res.tracks.slice(0, PAGE).map((t) => t.videoId))
      }
    } catch {
      /* network — chup reho, list waisi ki waisi */
    } finally {
      if (my === reqId.current) setLoadingMore(false)
    }
  }, [feed, shown])

  // ── CHIP/SEARCH: direct InnerTube search ───────────────────────────
  // v0.5.15: fresh load par salt++ (har click naya variant/order) +
  // markShown — chips bhi repeat-kill ring me record hote hain
  const load = useCallback(async (m: Mode, contToken: string | null) => {
    if (m.kind !== 'chip' && m.kind !== 'search') return
    const q = m.kind === 'chip' ? m.chip.query : m.query
    if (!q) return
    const my = ++reqId.current
    if (contToken) setLoadingMore(true)
    else setLoading(true)
    setFailed(false)
    try {
      const opts = contToken
        ? undefined
        : {
            chipKey: m.kind === 'chip' ? m.chip.key : undefined,
            salt: ++saltRef.current,
          }
      const page = await withTimeout(itubeFetch(q, contToken, opts), ITUBE_WATCHDOG_MS)
      if (my !== reqId.current) return
      setTracks((prev) => (contToken ? [...prev, ...page.tracks] : page.tracks))
      setCont(page.continuation)
      if (!contToken) {
        if (!page.tracks.length) setFailed(true)
        else markShown(page.tracks.slice(0, PAGE).map((t) => t.videoId))
      }
    } catch {
      if (my === reqId.current) {
        if (!contToken) {
          setTracks([])
          setFailed(true)
        }
        setCont(null)
      }
    } finally {
      if (my === reqId.current) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [])

  // ── CHANNEL PAGE: browseId se videos + meta (v0.5.21) ─────────────
  const loadChannel = useCallback(async (ch: ChannelInfo, contToken: string | null) => {
    if (!isNativeApp()) {
      // web dev — InnerTube direct nahi; koi khali-state nahi, bas info
      setFailed(false)
      setLoading(false)
      return
    }
    const my = ++reqId.current
    if (contToken) setLoadingMore(true)
    else {
      setLoading(true)
      setFailed(false)
      setChannelMeta(null)
    }
    try {
      const page = await withTimeout(
        fetchChannelVideos(ch.id, contToken, ch.name),
        ITUBE_WATCHDOG_MS
      )
      if (my !== reqId.current) return
      if (!page) {
        if (!contToken) {
          setTracks([])
          setFailed(true)
        }
        setCont(null)
        return
      }
      setTracks((prev) => (contToken ? [...prev, ...page.tracks] : page.tracks))
      setCont(page.continuation)
      if (page.meta.title || page.meta.avatar || page.meta.subs) setChannelMeta(page.meta)
      if (!contToken) {
        if (!page.tracks.length) setFailed(true)
        else markShown(page.tracks.slice(0, PAGE).map((t) => t.videoId))
        // subscription row me avatar/subs fresh rakho
        refreshSubMeta({
          ...ch,
          avatar: page.meta.avatar || ch.avatar,
          subsText: page.meta.subs || ch.subsText,
        })
        setSubsTick((v) => v + 1)
      }
    } catch {
      if (my === reqId.current) {
        if (!contToken) {
          setTracks([])
          setFailed(true)
        }
        setCont(null)
      }
    } finally {
      if (my === reqId.current) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [])

  // ── v0.5.42: pull-to-refresh action — upar kheench ke FRESH content ──
  // foryou: salt++ → naye queries + naya order; chip/search: salt++
  // variant; channel: wahi channel dobara. channels tab par refresh
  // nahi (wahan kuch load nahi hota).
  const doRefresh = useCallback(async () => {
    if (mode.kind === 'channels') return
    window.scrollTo({ top: 0 })
    setRefreshing(true)
    try {
      if (mode.kind === 'foryou') {
        saltRef.current += 1
        await loadForYou(saltRef.current)
      } else if (mode.kind === 'channel') {
        await loadChannel(mode.ch, null)
      } else {
        await load(mode, null)
      }
    } catch {
      /* load fns failure khud handle karti hain (failed state) */
    } finally {
      setRefreshing(false)
    }
  }, [mode, loadForYou, loadChannel, load])

  // ── EK unified load-effect (v0.5.9 FIX — auto-load race khatam):
  // pehle DO alag effects the (mode-change + tab-revisit) — dono mount
  // par ek saath fire hote the → 2 parallel requests → agar naya wala
  // fail ho jaye to purana (successful) bhi DISCARD ho jata tha →
  // skeleton hamesha stuck. Ab SIRF ek effect, SIRF ek request per
  // transition: pehli visit / dobara visit / mode change — sab yahin.
  const loadedKeyRef = useRef<string | null>(null)
  useEffect(() => {
    const visiting = visible && !wasVisible.current
    wasVisible.current = visible
    if (!visible) return
    // v0.5.15: nonce (n) modeKey me — SAME chip/foryou repeat click par
    // bhi fresh reload hota hai (naya variant + naya order)
    const modeKey =
      mode.kind === 'chip'
        ? `chip:${mode.chip.key}:${mode.n ?? 0}`
        : mode.kind === 'search'
          ? `search:${mode.query}`
          : mode.kind === 'channel'
            ? `channel:${mode.ch.id}`
            : mode.kind === 'channels'
              ? 'channels'
              : `foryou:${mode.n ?? 0}`
    // load ki zaroorat: tab pehli baar / dobara khula, YA mode badla
    if (!visiting && loadedKeyRef.current === modeKey) return
    loadedKeyRef.current = modeKey
    if (mode.kind === 'foryou') {
      // har tab-visit par NAYA feed (user request: har bar naya video)
      if (visiting) saltRef.current += 1
      void loadForYou(saltRef.current)
    } else if (mode.kind === 'channel') {
      void loadChannel(mode.ch, null)
    } else if (mode.kind === 'channels') {
      setLoading(false)
      setLoadingMore(false)
      setFailed(false)
      // featured channels resolve (cached) — sirf ek baar
      if (!featLoaded) {
        void getFeaturedChannels()
          .then((l) => {
            setFeat(l)
            setFeatLoaded(true)
          })
          .catch(() => setFeatLoaded(true))
      }
    } else {
      void load(mode, null)
    }
  }, [mode, visible, load, loadForYou, loadChannel, featLoaded])

  // ── UI WATCHDOG (v0.5.13 — skeleton-forever KILLER, layer-3 safety):
  // request-level timeouts (15s) ke bawajood agar kisi bhi wajah se
  // loading 18s se zyada atki (hang / reqId race / WebView stall) —
  // force-fail + EK auto-retry. Skeleton kabhi forever stuck nahi.
  const retryRef = useRef(0)
  useEffect(() => {
    retryRef.current = 0
  }, [visible, mode])
  useEffect(() => {
    if (!loading || !visible) return
    const timer = setTimeout(() => {
      reqId.current += 1 // sab in-flight requests discard
      if (retryRef.current < 1) {
        retryRef.current += 1
        if (mode.kind === 'foryou') void loadForYou(saltRef.current)
        else if (mode.kind === 'channel') void loadChannel(mode.ch, null)
        else void load(mode, null)
      } else {
        setFeed([])
        setShown(0)
        setTracks([])
        setLoading(false)
        setFailed(true)
      }
    }, 18000)
    return () => clearTimeout(timer)
  }, [loading, visible, mode, load, loadForYou, loadChannel])

  // infinite scroll — visible tab par hi scroll sunte hain
  useEffect(() => {
    if (!visible) return
    const onScroll = () => {
      if (loading || loadingMore) return
      if (window.innerHeight + window.scrollY < document.body.offsetHeight - 700) return
      if (mode.kind === 'foryou') {
        void loadMoreForYou()
      } else if (mode.kind === 'channel') {
        if (cont) void loadChannel(mode.ch, cont)
      } else if (cont) {
        void load(mode, cont)
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [visible, cont, loading, loadingMore, mode, load, loadMoreForYou, loadChannel])

  // ── v0.5.42 PULL-TO-REFRESH — sirf top par (scrollY≈0) neeche drag ──
  // touch se damped pull track karo, trigger cross to doRefresh().
  // chips horizontal swipe / input cursor-drag hijack nahi hote.
  useEffect(() => {
    if (!visible || watch || refreshing) return
    if (mode.kind === 'channels') return
    let startX = 0
    let startY = 0
    let armed = false  // touch top par shuru hua
    let pulling = false // vertical pull confirm ho gaya

    const onStart = (e: TouchEvent) => {
      armed = false
      if (e.touches.length !== 1) return
      if (window.scrollY > 2) return
      const tgt = e.target as HTMLElement | null
      if (tgt && tgt.closest('input, textarea, [contenteditable="true"]')) return
      startY = e.touches[0].clientY
      startX = e.touches[0].clientX
      armed = true
    }

    const onMove = (e: TouchEvent) => {
      if (!armed) return
      const t = e.touches[0]
      const dy = t.clientY - startY
      const dx = t.clientX - startX
      if (!pulling) {
        // horizontal drag (chips row) — PTR cancel
        if (Math.abs(dx) > Math.abs(dy) + 6) {
          armed = false
          return
        }
        // beech me scroll shuru ho gaya — PTR cancel
        if (window.scrollY > 2) {
          armed = false
          return
        }
        if (dy < 14) return // pull confirm nahi hua abhi
        pulling = true
      }
      const damped = Math.min(PTR_MAX, Math.max(0, dy * PTR_DAMP))
      pullPxRef.current = damped
      setPullPx(damped)
      if (e.cancelable) e.preventDefault()
    }

    const onEnd = () => {
      if (!armed) return
      armed = false
      const d = pullPxRef.current
      pullPxRef.current = 0
      setPullPx(0)
      if (pulling && d >= PTR_TRIGGER) void doRefresh()
      pulling = false
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [visible, watch, refreshing, mode, doRefresh])

  // tap → video watch screen (YouTube jaisa) — audio player pehle pause.
  // WATCH EVENT watch screen ke andar record hota hai (switch par bhi).
  const play = (t: QalbTrack) => {
    usePlayerStore.getState().pause()
    setWatch(t)
  }

  // ── channel helpers (v0.5.21) ──
  const openChannel = (ch: ChannelInfo) => {
    setInput('')
    setMode({ kind: 'channel', ch })
    window.scrollTo({ top: 0 })
  }

  const openFromRef = (ref: { id: string; name: string }) => {
    openChannel(asChannelInfo(ref))
  }

  const subToggle = (ch: ChannelInfo) => {
    const now = toggleSub(ch)
    setSubsTick((v) => v + 1)
    toast({
      title: now ? `🔔 ${ch.name} subscribe ho gaya` : `${ch.name} unsubscribe ho gaya`,
    })
  }

  const submitSearch = (e?: React.FormEvent) => {
    e?.preventDefault()
    const q = input.trim()
    if (!q) return
    setMode({ kind: 'search', query: q })
    inputRef.current?.blur()
  }

  const clearSearch = () => {
    setInput('')
    setMode({ kind: 'foryou' })
  }

  // ── v0.5.21: channels tab me type → channel search (debounced) ──
  useEffect(() => {
    if (mode.kind !== 'channels') return
    const q = input.trim()
    if (q.length < 2) {
      setChanResults([])
      setChanBusy(false)
      return
    }
    setChanBusy(true)
    const timer = setTimeout(() => {
      void searchChannels(q, 10)
        .then(setChanResults)
        .catch(() => setChanResults([]))
        .finally(() => setChanBusy(false))
    }, 450)
    return () => clearTimeout(timer)
  }, [input, mode.kind])

  // ── search mode par matched channels row (debounced) ──────────
  useEffect(() => {
    if (mode.kind !== 'search' || !isNativeApp()) {
      setSearchChans([])
      return
    }
    let stale = false
    const timer = setTimeout(() => {
      void searchChannels(mode.query, 6)
        .then((l) => {
          if (!stale) setSearchChans(l)
        })
        .catch(() => {
          if (!stale) setSearchChans([])
        })
    }, 400)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [mode])

  // subscriptions native-restore (update-proof) — mount par ek baar
  useEffect(() => {
    void hydrateSubs()
      .then(() => setSubsTick((v) => v + 1))
      .catch(() => {})
  }, [])

  // ── v0.5.23 BACK CHAIN (user request): channel/channels/search me se
  // back dabane par iTube home (foryou) par wapas — seedha iPlayer tab
  // par NAHI. iTube home par back dabane par shell ka tab-chain iPlayer
  // par le jata hai (pehle jaisa).
  // NOTE: watch overlay ka apna handler ('itube-watch') pehle chalta hai
  // (mount order) — watch khula ho to pehle video band hogi, phir yahan.
  useViewBackHandler('itube-mode', 'reels', () => {
    if (watch) return false // watch overlay pehle band ho
    if (mode.kind === 'foryou' || mode.kind === 'chip') return false
    // channel page / channels tab / search — sab iTube home par
    setMode({ kind: 'foryou' })
    setInput('')
    window.scrollTo({ top: 0 })
    return true
  })

  // ── v0.5.23 native YT-GUARD event: YT embed ke andar koi link dabaya
  // (end-screen / watch-on-youtube) jise native side ne block kar diya —
  // videoId mila to video YAHIN hamare watch screen me chala dete hain.
  // YouTube app/site kahin nahi khulti — sab videos app ke andar.
  useEffect(() => {
    const onYtLink = (e: Event) => {
      const vid = (e as CustomEvent<{ videoId?: string }>).detail?.videoId
      if (!vid || !visible) return
      const known = [...feed, ...tracks].find((t) => t.videoId === vid)
      usePlayerStore.getState().pause()
      setWatch(
        known ?? {
          id: `itlink-${vid}`,
          videoId: vid,
          title: 'YouTube video',
          artist: 'YouTube',
          category: 'NAAT',
          thumbnailUrl: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
        }
      )
    }
    window.addEventListener('qalbYtLink', onYtLink)
    return () => window.removeEventListener('qalbYtLink', onYtLink)
  }, [visible, feed, tracks])

  const activeKey =
    mode.kind === 'foryou'
      ? 'foryou'
      : mode.kind === 'channels'
        ? 'channels'
        : mode.kind === 'chip'
          ? mode.chip.key
          : mode.kind === 'channel'
            ? `channel:${mode.ch.id}`
            : `search:${mode.query}`

  return (
    <>
      {/* ── v0.5.42 PULL-TO-REFRESH indicator (Chrome-style pill) ── */}
      {pullPx > 0 || refreshing ? (
        <div
          aria-live="polite"
          aria-label={refreshing ? 'Refresh ho raha hai' : 'Neeche kheench ke refresh'}
          className="pointer-events-none fixed left-1/2 z-[80] -translate-x-1/2"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
        >
          <div
            className="flex items-center justify-center rounded-full border shadow-[0_10px_30px_-10px_rgba(0,0,0,0.85)]"
            style={{
              width: 40,
              height: 40,
              background: 'rgba(6, 24, 16, 0.96)',
              borderColor:
                pullPx >= PTR_TRIGGER || refreshing
                  ? 'rgba(52, 211, 153, 0.55)'
                  : 'rgba(52, 211, 153, 0.22)',
              opacity: refreshing ? 1 : Math.min(1, pullPx / 40),
              transform: `translateY(${refreshing ? 0 : Math.max(0, pullPx - 16)}px)`,
              transition: 'opacity 140ms ease-out, transform 140ms ease-out, border-color 140ms',
            }}
          >
            <Loader2
              className={`h-5 w-5 text-emerald-300 ${refreshing ? 'animate-spin' : ''}`}
              style={
                refreshing
                  ? undefined
                  : { transform: `rotate(${Math.min(pullPx, PTR_TRIGGER) * 2.4}deg)` }
              }
            />
          </div>
        </div>
      ) : null}

      <div
        className="pb-6"
        aria-label="iTube — Islamic videos"
        style={
          pullPx > 0
            ? { transform: `translateY(${Math.round(pullPx * 0.5)}px)`, transition: 'transform 120ms linear' }
            : { transition: 'transform 200ms ease-out' }
        }
      >
      {/* ── search + chips (shell header ke neeche) ── */}
      <div className="px-0.5 pb-3 pt-1">
        <form onSubmit={submitSearch} className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-300/50" />
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="iTube par khojein — naat, bayan, movie…"
            aria-label="iTube search"
            className="w-full rounded-full border border-emerald-400/15 bg-emerald-400/[0.06] py-2.5 pl-10 pr-10 text-[13px] font-medium text-emerald-50 placeholder:text-emerald-200/35 focus:border-emerald-400/40 focus:outline-none"
          />
          {input ? (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Search saaf karein"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-emerald-400/10 p-1 text-emerald-200/70"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </form>

        {/* ── chips (YouTube category bar) — "Aap ke liye" sabse pehle ── */}
        <div className="mt-3 flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => {
              setInput('')
              // repeat click par bhi FRESH feed (naya variant + order)
              setMode({ kind: 'foryou', n: Date.now() })
            }}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-bold transition active:scale-95 ${
              activeKey === 'foryou'
                ? 'bg-emerald-400 text-emerald-950 shadow-[0_0_16px_-4px_var(--glow)]'
                : 'border border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-100/70'
            }`}
          >
            ✨ Aap ke liye
          </button>
          <button
            type="button"
            onClick={() => {
              setInput('')
              setMode({ kind: 'channels' })
            }}
            className={`flex shrink-0 items-center gap-1 rounded-full px-3.5 py-1.5 text-[12px] font-bold transition active:scale-95 ${
              activeKey === 'channels'
                ? 'bg-emerald-400 text-emerald-950 shadow-[0_0_16px_-4px_var(--glow)]'
                : 'border border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-100/70'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            Channels
          </button>
          {ITUBE_CHIPS.filter((c) => c.key !== 'all').map((c) => {
            const isActive = activeKey === c.key
            return (
              <button
                key={c.key}
                type="button"
              onClick={() => {
                  setInput('')
                  // repeat click par bhi FRESH mix (naye variants + order)
                  setMode({ kind: 'chip', chip: c, n: Date.now() })
                }}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-bold transition active:scale-95 ${
                  isActive
                    ? 'bg-emerald-400 text-emerald-950 shadow-[0_0_16px_-4px_var(--glow)]'
                    : 'border border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-100/70'
                }`}
              >
                {c.label}
              </button>
            )
          })}
        </div>

        {/* v0.5.38 — LIVE/OFFLINE badge: feed Data API se aaya ya offline pool */}
        {mode.kind === 'foryou' && !loading ? (
          feedSrc === 'live' ? (
            <p className="mt-2 px-1 text-[10.5px] font-semibold text-emerald-300/60">
              ● LIVE — YouTube se taaza mix{tasteInfo > 4 ? ' · aap ki pasand ke hisab se' : ''}
            </p>
          ) : (
            <p className="mt-2 px-1 text-[10.5px] font-semibold text-amber-300/80">
              ● OFFLINE POOL — net/quota wapis aate hi naya mix aayega
            </p>
          )
        ) : null}
      </div>

      {/* ── list ── */}
      <div className="mt-2 space-y-4 px-0.5">
        {/* subscriptions avatar-row — foryou feed par (v0.5.21) */}
        {mode.kind === 'foryou' && subs.length ? (
          <section aria-label="Aapke subscribed channels">
            <p className="px-1 pb-2 text-[13px] font-bold text-emerald-50">Aapke Subscriptions</p>
            <div className={`flex gap-3 overflow-x-auto pb-1 ${NO_SCROLL}`}>
              {subs.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => openChannel(asChannelInfo(s))}
                  className="flex w-16 shrink-0 flex-col items-center gap-1.5 transition active:scale-95"
                >
                  <ChannelAvatar name={s.name} avatar={s.avatar} cls="h-14 w-14" />
                  <span className="w-full truncate text-center text-[10px] font-semibold text-emerald-200/70">
                    {s.name}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {/* search par matched channels (v0.5.21) */}
        {mode.kind === 'search' && searchChans.length ? (
          <section aria-label="Matched channels">
            <p className="px-1 pb-2 text-[13px] font-bold text-emerald-50">Channels</p>
            <div className={`flex gap-2.5 overflow-x-auto pb-1 ${NO_SCROLL}`}>
              {searchChans.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openChannel(c)}
                  className="w-28 shrink-0 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.05] p-2.5 text-center transition active:scale-95"
                >
                  <ChannelAvatar name={c.name} avatar={c.avatar} cls="mx-auto h-12 w-12" />
                  <p className="mt-1.5 w-full truncate text-[11px] font-bold text-emerald-50">{c.name}</p>
                  <p className="truncate text-[9.5px] text-emerald-200/45">{c.subsText || 'Channel dekhein'}</p>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {/* ── CHANNELS TAB — browse + subscribe (v0.5.21) ── */}
        {mode.kind === 'channels' ? (
          <div className="space-y-5 pt-1">
            {subs.length ? (
              <section>
                <p className="px-1 pb-2 text-[13px] font-bold text-emerald-50">Aapke Subscriptions</p>
                <div className={`flex gap-3 overflow-x-auto pb-1 ${NO_SCROLL}`}>
                  {subs.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => openChannel(asChannelInfo(s))}
                      className="flex w-16 shrink-0 flex-col items-center gap-1.5 transition active:scale-95"
                    >
                      <ChannelAvatar name={s.name} avatar={s.avatar} cls="h-14 w-14" />
                      <span className="w-full truncate text-center text-[10px] font-semibold text-emerald-200/70">
                        {s.name}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {input.trim().length >= 2 ? (
              <section>
                <p className="px-1 pb-2 text-[13px] font-bold text-emerald-50">
                  "{input.trim()}" ke channels
                </p>
                {chanBusy ? (
                  <div className="flex justify-center py-3">
                    <Loader2 className="h-5 w-5 animate-spin text-emerald-300" />
                  </div>
                ) : chanResults.length ? (
                  <div className="grid grid-cols-2 gap-2.5">
                    {chanResults.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.05] p-3"
                      >
                        <button
                          type="button"
                          onClick={() => openChannel(c)}
                          className="flex w-full items-center gap-2.5 text-left"
                        >
                          <ChannelAvatar name={c.name} avatar={c.avatar} cls="h-11 w-11" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12.5px] font-bold text-emerald-50">{c.name}</p>
                            <p className="truncate text-[10px] text-emerald-200/50">
                              {c.subsText || 'Channel'}
                            </p>
                          </div>
                        </button>
                        <div className="mt-2.5">
                          <SubscribeBtn ch={c} subbed={isSubscribed(c.id)} onToggle={subToggle} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="px-1 text-[11.5px] text-emerald-200/45">
                    Is naam ka koi channel nahi mila — spelling check kar ke dobara likhein.
                  </p>
                )}
              </section>
            ) : (
              <section>
                <p className="px-1 pb-2 text-[13px] font-bold text-emerald-50">
                  Mashhoor Islamic channels
                </p>
                {feat.length ? (
                  <div className="grid grid-cols-2 gap-2.5">
                    {feat.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.05] p-3"
                      >
                        <button
                          type="button"
                          onClick={() => openChannel(c)}
                          className="flex w-full items-center gap-2.5 text-left"
                        >
                          <ChannelAvatar name={c.name} avatar={c.avatar} cls="h-11 w-11" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12.5px] font-bold text-emerald-50">{c.name}</p>
                            <p className="truncate text-[10px] text-emerald-200/50">
                              {c.subsText || 'Channel'}
                            </p>
                          </div>
                        </button>
                        <div className="mt-2.5">
                          <SubscribeBtn ch={c} subbed={isSubscribed(c.id)} onToggle={subToggle} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : featLoaded ? (
                  <p className="px-1 text-[11.5px] leading-relaxed text-emerald-200/45">
                    Upar search box me kisi bhi channel ka naam likhein — uska pura page khul jayega.
                  </p>
                ) : (
                  <div className="flex justify-center py-3">
                    <Loader2 className="h-5 w-5 animate-spin text-emerald-300" />
                  </div>
                )}
              </section>
            )}
            <p className="px-1 text-[11px] leading-relaxed text-emerald-200/35">
              Subscribe app ke andar follow hai — subscribed channels home feed par bhi dikhte
              hain. Asli YouTube subscribe ke liye channel page par "YouTube" button dabaein.
            </p>
          </div>
        ) : null}

        {/* ── CHANNEL PAGE header (v0.5.21) ── */}
        {mode.kind === 'channel' ? (
          <div className="mx-0.5 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.05] p-3.5">
            <div className="flex items-center gap-3">
              <ChannelAvatar
                name={channelMeta?.title || mode.ch.name}
                avatar={channelMeta?.avatar || mode.ch.avatar}
                cls="h-14 w-14"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-bold text-emerald-50">
                  {channelMeta?.title || mode.ch.name}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-emerald-200/50">
                  {[channelMeta?.subs || mode.ch.subsText, mode.ch.videoCount]
                    .filter(Boolean)
                    .join(' • ') || 'Channel'}
                </p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <SubscribeBtn
                ch={mode.ch}
                subbed={isSubscribed(mode.ch.id)}
                onToggle={subToggle}
                big
              />
              <button
                type="button"
                onClick={() =>
                  void nativeOpenExternal(`https://www.youtube.com/channel/${mode.ch.id}`)
                }
                className="flex items-center justify-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-2.5 text-[12px] font-bold text-emerald-100/80 transition active:scale-95"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                YouTube
              </button>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-emerald-200/35">
              Subscribe app me follow karta hai — asli YouTube subscribe ke liye YouTube button
              dabaein.
            </p>
          </div>
        ) : null}

        {loading && (
          <div className="space-y-4" aria-label="Load ho raha hai">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-video w-full rounded-xl bg-emerald-400/10" />
                <div className="mt-2 h-3.5 w-4/5 rounded bg-emerald-400/10" />
                <div className="mt-1.5 h-3 w-2/5 rounded bg-emerald-400/[0.07]" />
              </div>
            ))}
          </div>
        )}

        {!loading && failed && (
          <div className="rounded-2xl border border-red-400/20 bg-red-400/[0.06] p-4 text-center">
            <TriangleAlert className="mx-auto h-5 w-5 text-red-300" />
            <p className="mt-1.5 text-[12.5px] font-bold text-red-200">Videos load nahi ho paye</p>
            <p className="mt-0.5 text-[11.5px] text-red-100/60">Network check kar ke dobara try karein.</p>
            <button
              type="button"
              onClick={() => {
                if (mode.kind === 'foryou') void loadForYou(saltRef.current)
                else if (mode.kind === 'channel') void loadChannel(mode.ch, null)
                else void load(mode, null)
              }}
              className="mt-2.5 rounded-full bg-red-400/15 px-4 py-1.5 text-[12px] font-bold text-red-100 active:scale-95"
            >
              Dobara try karein
            </button>
          </div>
        )}

        {!loading &&
          mode.kind !== 'channels' &&
          listTracks.map((t) => {
            const dur = trackDurSec(t)
            const pub = trackPub(t)
            const views = viewsLabel(t.playCount)
            const cref = channelRefOf(t)
            return (
              <div
                key={t.id}
                role="button"
                tabIndex={0}
                onClick={() => play(t)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') play(t)
                }}
                className="block w-full cursor-pointer text-left transition active:scale-[0.985]"
              >
                <div className="relative overflow-hidden rounded-xl bg-emerald-400/[0.06] shadow-sm">
                  <img
                    src={t.thumbnailUrl ?? ''}
                    alt={t.title}
                    loading="lazy"
                    className="aspect-video w-full object-cover"
                  />
                  {dur ? (
                    <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 text-[10.5px] font-bold text-white">
                      {fmtDur(dur)}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 px-0.5">
                  <p className="line-clamp-2 text-[13.5px] font-bold leading-snug text-emerald-50">
                    {t.title}
                  </p>
                  <div className="mt-1 flex items-center gap-1 text-[11.5px] text-emerald-200/55">
                    {cref ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          openFromRef(cref)
                        }}
                        className="max-w-[45%] truncate font-semibold text-emerald-200/75 active:text-emerald-200"
                      >
                        {t.artist}
                      </button>
                    ) : (
                      <span className="truncate">{t.artist}</span>
                    )}
                    {views ? <span className="shrink-0">• {views}</span> : null}
                    {pub ? <span className="truncate">• {pub}</span> : null}
                  </div>
                </div>
              </div>
            )
          })}

        {loadingMore && (
          <div className="flex justify-center py-3">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-300" />
          </div>
        )}

        {!loading && !failed && listTracks.length > 0 && mode.kind !== 'channels' && (
          <p className="pb-2 pt-1 text-center text-[11px] font-semibold text-emerald-200/35">
            Upar kheench ke refresh karo, neeche scroll karte raho — naye videos aate rahenge 🌙
          </p>
        )}
      </div>

      {/* ── watch screen (YouTube watch-page jaisa overlay) ── */}
      {watch ? (
        <ItubeWatch
          track={watch}
          related={(mode.kind === 'foryou' ? feed : tracks).filter((t) => t.videoId !== watch.videoId)}
          onPick={(t) => setWatch(t)}
          onClose={() => setWatch(null)}
          onOpenChannel={(ref) => {
            setWatch(null)
            openFromRef(ref)
          }}
        />
      ) : null}
      </div>
    </>
  )
}
