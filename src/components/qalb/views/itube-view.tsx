'use client'

// iTube — YouTube-style Islamic video hub (v0.5.0)
// ─────────────────────────────────────────────────────────────────
// Reels tab ki jagah. Bilkul YouTube jaisa feel:
//   • Wordmark + search bar (rounded, top sticky)
//   • Category chips (horizontal scroll — All/Naat/Qawwali/Bayan/…)
//   • Video list — 16:9 thumbnail + duration badge, title, channel,
//     views • published
//   • Infinite scroll (continuation)
//   • Tap → YouTube-jaisa WATCH SCREEN (itube-watch.tsx) — video
//     player khulta hai, audio player pause ho jata hai (v0.5.1)
//
// SAB content strict Islamic filter se guzarta hai (lib/itube.ts) —
// non-islamic video kabhi list me nahi aata.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Play, Search, TriangleAlert, X } from 'lucide-react'
import { usePlayerStore } from '@/lib/player-store'
import { viewsLabel } from '@/lib/innertube-x'
import {
  ITUBE_CHIPS,
  itubeFetch,
  itubePersonalQuery,
  trackDurSec,
  trackPub,
  fmtDur,
  type ITubeChip,
} from '@/lib/itube'
import { ItubeWatch } from '@/components/qalb/itube-watch'
import type { QalbTrack } from '@/lib/types'

type Mode = { kind: 'chip'; chip: ITubeChip } | { kind: 'search'; query: string }

export function ITubeView({ visible }: { visible: boolean }) {
  const [watch, setWatch] = useState<QalbTrack | null>(null)
  const [personalQuery, setPersonalQuery] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>({ kind: 'chip', chip: ITUBE_CHIPS[0] })
  const [tracks, setTracks] = useState<QalbTrack[]>([])
  const [cont, setCont] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [failed, setFailed] = useState(false)
  const [input, setInput] = useState('')
  const reqId = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // taste query — mount par ek dafa (play events badalne par next visit
  // me update ho jayega — har render par re-compute mehnga)
  useEffect(() => {
    setPersonalQuery(itubePersonalQuery())
  }, [])

  // chips list — "Aap ke liye" sab se pehle (pasand ho to)
  const chips: ITubeChip[] = personalQuery
    ? [{ key: 'foryou', label: 'Aap ke liye', query: personalQuery }, ...ITUBE_CHIPS]
    : ITUBE_CHIPS

  const load = useCallback(async (m: Mode, contToken: string | null) => {
    const q = m.kind === 'chip' ? m.chip.query : m.query
    if (!q) return
    const my = ++reqId.current
    if (contToken) setLoadingMore(true)
    else setLoading(true)
    setFailed(false)
    try {
      const page = await itubeFetch(q, contToken)
      if (my !== reqId.current) return // naya request aa gaya — purana ignore
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

  // chip/search change → fresh load
  useEffect(() => {
    if (!visible) return
    void load(mode, null)
     
  }, [mode.kind, mode.kind === 'chip' ? mode.chip.key : mode.query, visible])

  // infinite scroll — visible tab par hi scroll sunte hain
  useEffect(() => {
    if (!visible) return
    const onScroll = () => {
      if (loading || loadingMore || !cont) return
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 700) {
        void load(mode, cont)
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [visible, cont, loading, loadingMore, mode, load])

  // tap → video watch screen (YouTube jaisa) — audio player pehle pause
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
    setMode({ kind: 'chip', chip: chips[0] })
  }

  const activeKey =
    mode.kind === 'chip' ? mode.chip.key : `search:${mode.query}`

  return (
    <div className="pb-6" aria-label="iTube — Islamic videos">
      {/* ── header: wordmark + search ── */}
      <div className="glass sticky top-0 z-30 -mx-4 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2" aria-label="iTube">
            <span className="flex h-6 w-9 items-center justify-center rounded-md bg-red-600 shadow-md">
              <Play className="h-3.5 w-3.5 fill-white text-white" />
            </span>
            <span className="text-[22px] font-extrabold leading-none tracking-tight text-emerald-50">
              iTube
            </span>
          </div>
        </div>
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

        {/* ── chips (YouTube category bar) ── */}
        <div className="mt-3 flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {chips.map((c) => {
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
              onClick={() => void load(mode, null)}
              className="mt-2.5 rounded-full bg-red-400/15 px-4 py-1.5 text-[12px] font-bold text-red-100 active:scale-95"
            >
              Dobara try karein
            </button>
          </div>
        )}

        {!loading &&
          tracks.map((t) => {
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
                  { }
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

        {!loading && !failed && tracks.length > 0 && !cont && (
          <p className="pb-2 pt-1 text-center text-[11px] font-semibold text-emerald-200/35">
            Bas itna hi — upar search se aur khojein 🌙
          </p>
        )}
      </div>

      {/* ── watch screen (YouTube watch-page jaisa overlay) ── */}
      {watch ? (
        <ItubeWatch
          track={watch}
          related={tracks.filter((t) => t.videoId !== watch.videoId)}
          onPick={(t) => setWatch(t)}
          onClose={() => setWatch(null)}
        />
      ) : null}
    </div>
  )
}
