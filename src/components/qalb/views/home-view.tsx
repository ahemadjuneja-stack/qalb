'use client'

// Qalb — Home Tab: AI Smart Search (Gemini Guardian) + Trending + Playlists

import { useEffect, useState } from 'react'
import { Search, ShieldCheck, ShieldAlert, Loader2, Sparkles, Play } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { TrackRow } from '@/components/qalb/track-row'
import { usePlayerStore } from '@/lib/player-store'
import { SEARCH_SUGGESTIONS } from '@/lib/qalb'
import type { QalbPlaylist, QalbTrack, SearchValidationResult } from '@/lib/types'

type Phase = 'idle' | 'validating' | 'blocked' | 'searching' | 'results'

const CATEGORY_CHIPS = [
  { label: 'Naat', query: 'naat sharif' },
  { label: 'Hamd', query: 'hamd e bari taala' },
  { label: 'Qawwali', query: 'sufi qawwali' },
  { label: 'Nasheed', query: 'islamic nasheed' },
]

export function HomeView() {
  const [query, setQuery] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [guardian, setGuardian] = useState<SearchValidationResult | null>(null)
  const [results, setResults] = useState<QalbTrack[]>([])
  const [resultSource, setResultSource] = useState<string>('')
  const [playlists, setPlaylists] = useState<QalbPlaylist[]>([])

  const playQueue = usePlayerStore((s) => s.playQueue)
  const openFull = usePlayerStore((s) => s.openFull)
  const { toast } = useToast()

  useEffect(() => {
    fetch('/api/playlists')
      .then((r) => r.json())
      .then((d) => setPlaylists(d.playlists ?? []))
      .catch(() => setPlaylists([]))
  }, [])

  async function runSearch(rawQuery: string) {
    const q = rawQuery.trim()
    if (!q || phase === 'validating' || phase === 'searching') return
    setQuery(q)
    setGuardian(null)
    setPhase('validating')
    try {
      const vRes = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      })
      const validation = (await vRes.json()) as SearchValidationResult
      setGuardian(validation)

      if (!validation.valid) {
        setPhase('blocked')
        return
      }

      setPhase('searching')
      const sRes = await fetch(
        `/api/youtube-search?q=${encodeURIComponent(validation.refinedQuery || q)}`
      )
      const data = await sRes.json()
      setResults(data.tracks ?? [])
      setResultSource(data.source ?? '')
      setPhase('results')
    } catch {
      setPhase('blocked')
      setGuardian({
        valid: false,
        reason: 'Network masla — dobara koshish karein.',
        refinedQuery: null,
        category: null,
        provider: 'rules',
      })
    }
  }

  const trending = playlists.find((p) => p.slug === 'trending-kalam')?.tracks ?? []

  return (
    <div className="space-y-7 px-4 pb-8 pt-5">
      {/* header */}
      <header className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-emerald-400/80">
            ٱلسَّلَامُ عَلَيْكُمْ
          </p>
          <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight text-emerald-50">
            Qalb <span className="text-emerald-400">قلب</span>
          </h1>
          <p className="text-xs text-emerald-200/50">Naat • Hamd • Sufi Qawwali • Nasheed</p>
        </div>
        <div className="gold-gradient flex h-11 w-11 items-center justify-center rounded-2xl text-xl shadow-[0_0_24px_-6px_rgba(212,169,55,0.5)]">
          🕌
        </div>
      </header>

      {/* AI search */}
      <section aria-label="AI Search">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void runSearch(query)
          }}
          className="relative"
        >
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-emerald-300/50" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Naat, hamd ya qawwali search karein…"
            aria-label="Search query"
            className="w-full rounded-2xl border border-emerald-400/15 bg-[#0c1613] py-3.5 pl-11 pr-28 text-sm text-emerald-50 placeholder:text-emerald-200/35 focus:border-emerald-400/40 focus:outline-none focus:ring-2 focus:ring-emerald-400/20"
          />
          <button
            type="submit"
            disabled={!query.trim() || phase === 'validating' || phase === 'searching'}
            className="emerald-gradient absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12px] font-bold text-emerald-950 transition hover:opacity-90 disabled:opacity-40"
          >
            {phase === 'validating' || phase === 'searching' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {phase === 'validating' ? 'AI check…' : 'Search'}
          </button>
        </form>

        {/* suggestion chips */}
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
          {SEARCH_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void runSearch(s)}
              className="shrink-0 rounded-full border border-emerald-400/15 bg-emerald-400/5 px-3 py-1.5 text-[11px] font-medium text-emerald-200/70 transition hover:border-emerald-400/30 hover:text-emerald-100"
            >
              {s}
            </button>
          ))}
        </div>

        {/* guardian verdict */}
        {guardian && phase !== 'idle' && (
          <div
            className={`mt-3 flex items-start gap-2.5 rounded-xl border p-3 text-[12px] leading-relaxed ${
              guardian.valid
                ? 'border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-100'
                : 'border-red-400/25 bg-red-400/[0.06] text-red-100'
            }`}
            role="status"
          >
            {guardian.valid ? (
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            ) : (
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            )}
            <span>
              <b className="font-semibold">
                {guardian.valid ? 'AI Guardian approved' : 'Blocked'}:
              </b>{' '}
              {guardian.reason}
              {guardian.valid && guardian.refinedQuery && (
                <span className="mt-1 block text-emerald-300/80">
                  Refined query: <i>“{guardian.refinedQuery}”</i>
                  <span className="ml-1.5 rounded-full bg-emerald-400/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-400/90">
                    {guardian.provider}
                  </span>
                </span>
              )}
            </span>
          </div>
        )}

        {/* category quick chips */}
        {phase === 'idle' && (
          <div className="mt-4 flex flex-wrap gap-2">
            {CATEGORY_CHIPS.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => void runSearch(c.query)}
                className="rounded-full bg-emerald-400/10 px-3.5 py-1.5 text-[12px] font-semibold text-emerald-300 transition hover:bg-emerald-400/20"
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* blocked state */}
      {phase === 'blocked' && (
        <section className="card-surface rounded-2xl p-4 text-center">
          <p className="text-2xl">🚫</p>
          <p className="mt-2 text-sm font-semibold text-red-200">Sirf paak kalaam allowed hai</p>
          <p className="mt-1 text-xs leading-relaxed text-emerald-200/60">
            {guardian?.reason} — Bollywood, pop ya film songs search nahi ho sakte.
          </p>
        </section>
      )}

      {/* search results */}
      {phase === 'results' && (
        <section aria-label="Search results">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-300/80">
              Results ({results.length})
            </h2>
            {resultSource === 'library' && (
              <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-300/70">
                verified library
              </span>
            )}
          </div>
          <div className="card-surface rounded-2xl p-2">
            {results.map((t, i) => (
              <TrackRow key={`${t.videoId}-${t.id}`} track={t} index={i} queue={results} showIndex={false} />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPhase('idle')}
            className="mx-auto mt-3 block text-[11px] text-emerald-200/50 underline-offset-2 hover:underline"
          >
            clear results
          </button>
        </section>
      )}

      {/* trending */}
      {trending.length > 0 && phase !== 'results' && (
        <section aria-label="Trending">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-emerald-300/80">
              🔥 Trending Kalam
            </h2>
            <button
              type="button"
              onClick={() => {
                playQueue(trending, 0)
                toast({ title: 'Trending kalam chal raha hai 🎵' })
              }}
              className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300"
            >
              <Play className="h-3 w-3 fill-current" /> Sab play
            </button>
          </div>
          <div className="card-surface rounded-2xl p-2">
            {trending.map((t, i) => (
              <TrackRow key={t.id} track={t} index={i} queue={trending} />
            ))}
          </div>
        </section>
      )}

      {/* playlists */}
      {playlists.length > 0 && phase !== 'results' && (
        <section aria-label="Playlists">
          <h2 className="mb-2.5 text-sm font-bold uppercase tracking-wider text-emerald-300/80">
            🎧 Playlists
          </h2>
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
            {playlists.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  playQueue(p.tracks, 0)
                  openFull()
                }}
                className="card-surface w-40 shrink-0 overflow-hidden rounded-2xl p-3 text-left transition hover:border-emerald-400/30 active:scale-[0.98]"
              >
                <div
                  className="flex h-24 items-center justify-center rounded-xl text-4xl"
                  style={{ background: `${p.accentColor}22`, border: `1px solid ${p.accentColor}44` }}
                >
                  {p.coverEmoji}
                </div>
                <p className="mt-2.5 truncate text-[13px] font-bold text-emerald-50">{p.name}</p>
                <p className="truncate text-[10.5px] text-emerald-200/50">{p.tracks.length} kalam</p>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
