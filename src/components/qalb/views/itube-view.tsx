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
import { Loader2, Search, TriangleAlert, X } from 'lucide-react'
import { usePlayerStore } from '@/lib/player-store'
import { viewsLabel } from '@/lib/innertube-x'
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
  | { kind: 'foryou' }
  | { kind: 'chip'; chip: ITubeChip }
  | { kind: 'search'; query: string }

const PAGE = 14

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

export function ITubeView({ visible }: { visible: boolean }) {
  const [watch, setWatch] = useState<QalbTrack | null>(null)
  const [mode, setMode] = useState<Mode>({ kind: 'foryou' })

  // foryou smart feed pool
  const [feed, setFeed] = useState<QalbTrack[]>([])
  const [shown, setShown] = useState(0) // kitne render ho chuke
  const [tasteInfo, setTasteInfo] = useState<number>(0)

  // chip/search list
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

  const listTracks = mode.kind === 'foryou' ? feed.slice(0, shown) : tracks

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

  // ── CHIP/SEARCH: direct InnerTube search ───────────────────────
  const load = useCallback(async (m: Mode, contToken: string | null) => {
    if (m.kind === 'foryou') return
    const q = m.kind === 'chip' ? m.chip.query : m.query
    if (!q) return
    const my = ++reqId.current
    if (contToken) setLoadingMore(true)
    else setLoading(true)
    setFailed(false)
    try {
      const page = await withTimeout(itubeFetch(q, contToken), ITUBE_WATCHDOG_MS)
      if (my !== reqId.current) return
      setTracks((prev) => (contToken ? [...prev, ...page.tracks] : page.tracks))
      setCont(page.continuation)
      if (!contToken && !page.tracks.length) setFailed(true)
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
    const modeKey =
      mode.kind === 'chip' ? `chip:${mode.chip.key}` : mode.kind === 'search' ? `search:${mode.query}` : 'foryou'
    // load ki zaroorat: tab pehli baar / dobara khula, YA mode badla
    if (!visiting && loadedKeyRef.current === modeKey) return
    loadedKeyRef.current = modeKey
    if (mode.kind === 'foryou') {
      // har tab-visit par NAYA feed (user request: har bar naya video)
      if (visiting) saltRef.current += 1
      void loadForYou(saltRef.current)
    } else {
      void load(mode, null)
    }
  }, [mode.kind, mode.kind === 'chip' ? mode.chip.key : mode.kind === 'search' ? mode.query : 'fy', visible, load, loadForYou])

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
  }, [loading, visible, mode, load, loadForYou])

  // infinite scroll — visible tab par hi scroll sunte hain
  useEffect(() => {
    if (!visible) return
    const onScroll = () => {
      if (loading || loadingMore) return
      if (window.innerHeight + window.scrollY < document.body.offsetHeight - 700) return
      if (mode.kind === 'foryou') {
        void loadMoreForYou()
      } else if (cont) {
        void load(mode, cont)
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [visible, cont, loading, loadingMore, mode, load, loadMoreForYou])

  // tap → video watch screen (YouTube jaisa) — audio player pehle pause.
  // WATCH EVENT watch screen ke andar record hota hai (switch par bhi).
  const play = (t: QalbTrack) => {
    usePlayerStore.getState().pause()
    setWatch(t)
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

  const activeKey =
    mode.kind === 'foryou' ? 'foryou' : mode.kind === 'chip' ? mode.chip.key : `search:${mode.query}`

  return (
    <div className="pb-6" aria-label="iTube — Islamic videos">
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
              setMode({ kind: 'foryou' })
            }}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-bold transition active:scale-95 ${
              activeKey === 'foryou'
                ? 'bg-emerald-400 text-emerald-950 shadow-[0_0_16px_-4px_var(--glow)]'
                : 'border border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-100/70'
            }`}
          >
            ✨ Aap ke liye
          </button>
          {ITUBE_CHIPS.filter((c) => c.key !== 'all').map((c) => {
            const isActive = activeKey === c.key
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => {
                  setInput('')
                  setMode({ kind: 'chip', chip: c })
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

        {/* foryou personalize hint */}
        {mode.kind === 'foryou' && tasteInfo > 4 ? (
          <p className="mt-2 px-1 text-[10.5px] font-semibold text-gold/60">
            Aap ki dekhne ki pasand ke hisab se mix taiyar hai — jitna dekhenge, utna behtar hoga
          </p>
        ) : null}
      </div>

      {/* ── list ── */}
      <div className="mt-2 space-y-4 px-0.5">
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
                else void load(mode, null)
              }}
              className="mt-2.5 rounded-full bg-red-400/15 px-4 py-1.5 text-[12px] font-bold text-red-100 active:scale-95"
            >
              Dobara try karein
            </button>
          </div>
        )}

        {!loading &&
          listTracks.map((t) => {
            const dur = trackDurSec(t)
            const pub = trackPub(t)
            const views = viewsLabel(t.playCount)
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => play(t)}
                className="block w-full text-left transition active:scale-[0.985]"
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
                  <p className="mt-1 truncate text-[11.5px] text-emerald-200/55">
                    {t.artist}
                    {views ? ` • ${views}` : ''}
                    {pub ? ` • ${pub}` : ''}
                  </p>
                </div>
              </button>
            )
          })}

        {loadingMore && (
          <div className="flex justify-center py-3">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-300" />
          </div>
        )}

        {!loading && !failed && listTracks.length > 0 && (
          <p className="pb-2 pt-1 text-center text-[11px] font-semibold text-emerald-200/35">
            Neeche scroll karte raho — naye videos aate rahenge 🌙
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
        />
      ) : null}
    </div>
  )
}
