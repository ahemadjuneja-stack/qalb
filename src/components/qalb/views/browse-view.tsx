'use client'

// Qalb — Browse Views: Moods • Genres • Kalaamkar FOLDERS
// ─────────────────────────────────────────────────────────────────
// User requirement: "Playlist mood genres me bhi 100 dikhni chahiye,
// har folder me alag alag dikhna chahiye, abhi sab me same same hai."
//
// FolderGrid  — 3 tabs ke folders (har folder ka APNA YouTube query)
// FolderDetail — folder ka live YouTube content, INFINITE scroll
//                (20 → 100+ kalaam, YouTube continuation se UNLIMITED)
// PlaylistDetail — curated playlist + isi style ke LIVE kalaam
//
// Har folder live-catalog.ts se fetch hota hai (InnerTube — no API key),
// 6h localStorage cache — dobara kholne par INSTANT.

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, Loader2, Play, Flame } from 'lucide-react'
import { TrackRow } from '@/components/qalb/track-row'
import { usePlayerStore } from '@/lib/player-store'
import { fetchFolderPage, fetchFolderMore, viewsLabel } from '@/lib/live-catalog'
import {
  foldersByGroup,
  type FolderGroup,
  type QalbFolder,
} from '@/lib/folders'
import type { QalbPlaylist, QalbTrack } from '@/lib/types'

// ── shared pieces ────────────────────────────────────────────────

function BackHeader({ title, sub, onBack }: { title: string; sub: string; onBack: () => void }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <button
        type="button"
        onClick={onBack}
        aria-label="Wapas jayein"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-emerald-400/15 bg-emerald-400/5 text-emerald-300 transition active:scale-95"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div className="min-w-0">
        <h1 className="truncate text-[15px] font-bold text-emerald-50">{title}</h1>
        <p className="truncate text-[10.5px] text-emerald-200/50">{sub}</p>
      </div>
    </div>
  )
}

function SkeletonRows({ n = 8 }: { n?: number }) {
  return (
    <div className="card-surface space-y-1 rounded-2xl p-2">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-2">
          <div className="h-14 w-14 animate-pulse rounded-xl bg-emerald-400/10" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-3/4 animate-pulse rounded bg-emerald-400/10" />
            <div className="h-2.5 w-1/3 animate-pulse rounded bg-emerald-400/5" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── 1. FOLDER GRID — Moods | Genres | Kalaamkar tabs ─────────────

const TABS: Array<{ key: FolderGroup; label: string; emoji: string }> = [
  { key: 'genre', label: 'Genres', emoji: '🎼' },
  { key: 'mood', label: 'Moods', emoji: '🎭' },
  { key: 'artist', label: 'Kalaamkar', emoji: '🎙️' },
]

export function FolderGrid({
  onOpen,
}: {
  onOpen: (folder: QalbFolder) => void
}) {
  const [group, setGroup] = useState<FolderGroup>('genre')
  const folders = foldersByGroup(group)

  return (
    <section aria-label="Folders browse">
      <div className="mb-3 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setGroup(t.key)}
            aria-pressed={group === t.key}
            className={`rounded-full px-4 py-2 text-[12px] font-bold transition ${
              group === t.key
                ? 'bg-emerald-400/20 text-emerald-200'
                : 'bg-emerald-400/5 text-emerald-200/50 hover:bg-emerald-400/10'
            }`}
          >
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {folders.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onOpen(f)}
            aria-label={`${f.label} folder kholein`}
            className="relative h-28 overflow-hidden rounded-2xl border border-white/5 p-3 text-left transition active:scale-[0.97]"
            style={{ background: f.gradient }}
          >
            <span className="absolute -bottom-3 -right-2 text-5xl opacity-25" aria-hidden>
              {f.emoji}
            </span>
            <span className="block text-[14px] font-extrabold leading-tight text-white">
              {f.label}
            </span>
            <span className="mt-0.5 line-clamp-2 block text-[9.5px] font-medium text-white/70">
              {f.sub}
            </span>
            <span className="absolute bottom-2.5 left-3 flex items-center gap-1 rounded-full bg-black/30 px-2 py-0.5 text-[9px] font-bold text-white backdrop-blur">
              <Flame className="h-2.5 w-2.5" /> LIVE • 100+
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

// ── 2. FOLDER DETAIL — live infinite kalaam list ─────────────────

export function FolderDetail({
  folder,
  onBack,
}: {
  folder: QalbFolder
  onBack: () => void
}) {
  const [tracks, setTracks] = useState<QalbTrack[]>([])
  const [cont, setCont] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const genRef = useRef(0)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef(0)

  // open par scroll top, close par wapas (native feel)
  useEffect(() => {
    scrollRef.current = window.scrollY
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    return () => {
      window.scrollTo({ top: scrollRef.current, behavior: 'instant' as ScrollBehavior })
    }
  }, [])

  useEffect(() => {
    const gen = ++genRef.current
    setLoading(true)
    setTracks([])
    setCont(null)
    void fetchFolderPage(folder).then((page) => {
      if (genRef.current !== gen) return // stale folder — discard
      setTracks(page.tracks)
      setCont(page.continuation)
      setLoading(false)
    })
  }, [folder])

  const loadMore = useCallback(async () => {
    if (!cont || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await fetchFolderMore(folder, cont)
      setTracks((prev) => {
        const seen = new Set(prev.map((t) => t.videoId))
        return [...prev, ...page.tracks.filter((t) => !seen.has(t.videoId))]
      })
      setCont(page.continuation)
    } finally {
      setLoadingMore(false)
    }
  }, [cont, loadingMore, folder])

  // auto-load — sentinel screen par aaye to agla page (100+ ka feel)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !cont) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore()
      },
      { rootMargin: '400px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [cont, loadMore])

  const playAll = usePlayerStore((s) => s.playQueue)
  const openFull = usePlayerStore((s) => s.openFull)

  return (
    <section aria-label={`${folder.label} folder`}>
      {/* gradient banner */}
      <div
        className="relative mb-4 overflow-hidden rounded-2xl p-5"
        style={{ background: folder.gradient }}
      >
        <span className="absolute -bottom-4 -right-3 text-7xl opacity-20" aria-hidden>
          {folder.emoji}
        </span>
        <div className="relative">
          <BackHeaderInline onBack={onBack} />
          <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">
            {folder.group === 'artist' ? 'Kalaamkar Station' : folder.group === 'mood' ? 'Aaj ka Mood' : 'Genre'}
          </p>
          <h1 className="mt-1 text-[22px] font-extrabold text-white">{folder.label}</h1>
          <p className="mt-0.5 text-[11px] text-white/75">{folder.sub}</p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (tracks.length) {
                  playAll(tracks, 0)
                  openFull()
                }
              }}
              disabled={!tracks.length}
              className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[12px] font-extrabold text-emerald-950 shadow-lg transition active:scale-95 disabled:opacity-40"
            >
              <Play className="h-3.5 w-3.5 fill-current" /> Sab Play
            </button>
            <span className="rounded-full bg-black/30 px-2.5 py-1 text-[9.5px] font-bold text-white backdrop-blur">
              🔴 YouTube LIVE{tracks.length ? ` • ${tracks.length} load ho gaye` : ''}
            </span>
          </div>
        </div>
      </div>

      {loading ? (
        <SkeletonRows n={9} />
      ) : tracks.length === 0 ? (
        <div className="card-surface rounded-2xl p-6 text-center">
          <p className="text-2xl">🤍</p>
          <p className="mt-2 text-sm font-semibold text-emerald-200/90">
            Network slow hai — dobara try karein
          </p>
        </div>
      ) : (
        <div className="card-surface rounded-2xl p-2">
          {tracks.map((t, i) => (
            <TrackRow
              key={`${t.videoId}-${t.id}`}
              track={t}
              index={i}
              queue={tracks}
              showIndex={false}
              showViews
            />
          ))}
        </div>
      )}

      {/* infinite scroll sentinel + manual fallback */}
      {cont && tracks.length > 0 && (
        <>
          <div ref={sentinelRef} aria-hidden className="h-1" />
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="mx-auto mt-3 flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/5 px-4 py-2 text-[12px] font-bold text-emerald-300 transition hover:bg-emerald-400/15 disabled:opacity-50"
          >
            {loadingMore ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ChevronLeft className="h-4 w-4 rotate-[-90deg]" />
            )}
            Aur Kalaam Load Karein (YouTube se)
          </button>
          <p className="mt-2 text-center text-[10px] text-emerald-200/40">
            {tracks.length} kalaam dikhe • YouTube par 100+ maujood
          </p>
        </>
      )}

      {/* bottom pad — mini player se overlap na ho */}
      <div className="h-6" />
    </section>
  )
}

// ── 3. PLAYLIST DETAIL — playlist + live expansion ───────────────

export function PlaylistDetail({
  playlist,
  liveFolder,
  onBack,
}: {
  playlist: QalbPlaylist
  liveFolder: QalbFolder // isi playlist ki category ka folder (live expansion)
  onBack: () => void
}) {
  const own = playlist.tracks
  const [extra, setExtra] = useState<QalbTrack[]>([])
  const [cont, setCont] = useState<string | null>(null)
  const [loading, setLoading] = useState(own.length === 0)
  const [loadingMore, setLoadingMore] = useState(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const genRef = useRef(0)
  const scrollRef = useRef(0)

  useEffect(() => {
    scrollRef.current = window.scrollY
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    return () => {
      window.scrollTo({ top: scrollRef.current, behavior: 'instant' as ScrollBehavior })
    }
  }, [])

  // live expansion — playlist ki apni tracks + isi genre ke YouTube kalaam
  useEffect(() => {
    const gen = ++genRef.current
    setLoading(true)
    void fetchFolderPage(liveFolder).then((page) => {
      if (genRef.current !== gen) return
      const seen = new Set(own.map((t) => t.videoId))
      const fresh = page.tracks.filter((t) => !seen.has(t.videoId))
      setExtra(fresh)
      setCont(page.continuation)
      setLoading(false)
    })
     
  }, [liveFolder])

  const loadMore = useCallback(async () => {
    if (!cont || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await fetchFolderMore(liveFolder, cont)
      setExtra((prev) => {
        const seen = new Set([...own, ...prev].map((t) => t.videoId))
        return [...prev, ...page.tracks.filter((t) => !seen.has(t.videoId))]
      })
      setCont(page.continuation)
    } finally {
      setLoadingMore(false)
    }
  }, [cont, loadingMore, liveFolder, own])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !cont) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore()
      },
      { rootMargin: '400px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [cont, loadMore])

  const all = [...own, ...extra]
  const playAll = usePlayerStore((s) => s.playQueue)
  const openFull = usePlayerStore((s) => s.openFull)

  return (
    <section aria-label={`${playlist.name} playlist`}>
      <div
        className="relative mb-4 overflow-hidden rounded-2xl p-5"
        style={{ background: `linear-gradient(140deg, ${playlist.accentColor}55, #052e1b 75%)` }}
      >
        <span className="absolute -bottom-4 -right-3 text-7xl opacity-20" aria-hidden>
          {playlist.coverEmoji}
        </span>
        <div className="relative">
          <BackHeaderInline onBack={onBack} />
          <h1 className="mt-2 text-[22px] font-extrabold text-white">{playlist.name}</h1>
          <p className="mt-0.5 line-clamp-2 text-[11px] text-white/70">
            {playlist.description ?? 'Paak kalaam collection'}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (all.length) {
                  playAll(all, 0)
                  openFull()
                }
              }}
              disabled={!all.length}
              className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[12px] font-extrabold text-emerald-950 shadow-lg transition active:scale-95 disabled:opacity-40"
            >
              <Play className="h-3.5 w-3.5 fill-current" /> Sab Play
            </button>
            <span className="rounded-full bg-black/30 px-2.5 py-1 text-[9.5px] font-bold text-white backdrop-blur">
              {own.length} playlist + {extra.length} LIVE
            </span>
          </div>
        </div>
      </div>

      {own.length > 0 && (
        <>
          <p className="mb-1.5 px-1 text-[10.5px] font-bold uppercase tracking-wider text-emerald-200/50">
            Playlist ke Kalaam
          </p>
          <div className="card-surface rounded-2xl p-2">
            {own.map((t, i) => (
              <TrackRow key={`${t.videoId}-${t.id}`} track={t} index={i} queue={own} showIndex={false} />
            ))}
          </div>
        </>
      )}

      <p className="mb-1.5 mt-4 px-1 text-[10.5px] font-bold uppercase tracking-wider text-emerald-200/50">
        Isi Andaz ke LIVE Kalaam • YouTube se
      </p>
      {loading ? (
        <SkeletonRows n={7} />
      ) : extra.length === 0 ? (
        <div className="card-surface rounded-2xl p-4 text-center text-[12px] text-emerald-200/60">
          Network slow hai — thodi der me live kalaam aajayenge
        </div>
      ) : (
        <div className="card-surface rounded-2xl p-2">
          {extra.map((t, i) => (
            <TrackRow
              key={`${t.videoId}-${t.id}`}
              track={t}
              index={own.length + i}
              queue={all}
              showIndex={false}
              showViews
            />
          ))}
        </div>
      )}

      {cont && extra.length > 0 && (
        <>
          <div ref={sentinelRef} aria-hidden className="h-1" />
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="mx-auto mt-3 flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/5 px-4 py-2 text-[12px] font-bold text-emerald-300 transition hover:bg-emerald-400/15 disabled:opacity-50"
          >
            {loadingMore ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ChevronLeft className="h-4 w-4 rotate-[-90deg]" />
            )}
            Aur Kalaam Load Karein
          </button>
        </>
      )}
      <div className="h-6" />
    </section>
  )
}

function BackHeaderInline({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      aria-label="Wapas jayein"
      className="flex h-9 w-9 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur transition active:scale-95"
    >
      <ChevronLeft className="h-5 w-5" />
    </button>
  )
}

// views label helper ka re-export — home-view bhi use karta hai
export { viewsLabel }
