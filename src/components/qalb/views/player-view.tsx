'use client'

// Qalb — Player Tab: Now Playing + Queue + Recents (library style)

import { useEffect } from 'react'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Headphones,
  Video,
  Maximize2,
  Clock3,
  ListMusic,
} from 'lucide-react'
import { usePlayerStore, useCurrentTrack } from '@/lib/player-store'
import { TrackRow } from '@/components/qalb/track-row'

export function PlayerView() {
  const current = useCurrentTrack()
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const audioOnly = usePlayerStore((s) => s.audioOnly)
  const queue = usePlayerStore((s) => s.queue)
  const recents = usePlayerStore((s) => s.recents)
  const loadRecents = usePlayerStore((s) => s.loadRecents)
  const toggle = usePlayerStore((s) => s.toggle)
  const next = usePlayerStore((s) => s.next)
  const prev = usePlayerStore((s) => s.prev)
  const openFull = usePlayerStore((s) => s.openFull)
  const toggleAudioOnly = usePlayerStore((s) => s.toggleAudioOnly)
  const clearRecents = usePlayerStore((s) => s.clearRecents)

  useEffect(() => {
    loadRecents()
  }, [loadRecents])

  if (!current) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-8 text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-400/5 text-4xl">
          🎧
        </div>
        <h2 className="mt-2 text-lg font-bold text-emerald-50">Kuch kalam chalayein</h2>
        <p className="max-w-[260px] text-xs leading-relaxed text-emerald-200/50">
          Home tab se koi naat, hamd ya qawwali play karein — player yahan poori queue ke saath
          dikhega.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 px-4 pb-8 pt-5">
      {/* now playing card */}
      <section
        aria-label="Now playing"
        className="card-surface relative overflow-hidden rounded-3xl p-5"
      >
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-emerald-500/10 blur-3xl" />

        <div className="flex items-center gap-4">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-emerald-400/20 bg-emerald-950">
            {current.thumbnailUrl ? (
              <img src={current.thumbnailUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-3xl">🕌</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400/70">
              Now Playing • {current.category}
            </p>
            <h2 className="mt-1 line-clamp-2 text-[15px] font-bold leading-snug text-emerald-50">
              {current.title}
            </h2>
            <p className="truncate text-xs text-emerald-200/55">{current.artist}</p>
          </div>
        </div>

        {/* inline controls */}
        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={toggleAudioOnly}
            aria-label={audioOnly ? 'Video mode' : 'Audio-only mode'}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-emerald-400/20 text-emerald-300 transition hover:bg-emerald-400/10"
          >
            {audioOnly ? <Headphones className="h-4.5 w-4.5" /> : <Video className="h-4.5 w-4.5" />}
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={prev}
              aria-label="Pichla"
              className="flex h-11 w-11 items-center justify-center rounded-full text-emerald-100 transition hover:bg-white/5"
            >
              <SkipBack className="h-5.5 w-5.5 fill-current" />
            </button>
            <button
              type="button"
              onClick={toggle}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="emerald-gradient flex h-14 w-14 items-center justify-center rounded-full text-emerald-950 shadow-[0_0_28px_-6px_rgba(221,186,95,0.55)] transition hover:scale-105 active:scale-95"
            >
              {isPlaying ? (
                <Pause className="h-7 w-7 fill-current" />
              ) : (
                <Play className="h-7 w-7 translate-x-[2px] fill-current" />
              )}
            </button>
            <button
              type="button"
              onClick={() => next()}
              aria-label="Agla"
              className="flex h-11 w-11 items-center justify-center rounded-full text-emerald-100 transition hover:bg-white/5"
            >
              <SkipForward className="h-5.5 w-5.5 fill-current" />
            </button>
          </div>

          <button
            type="button"
            onClick={openFull}
            aria-label="Full player"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-emerald-400/20 text-emerald-300 transition hover:bg-emerald-400/10"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </section>

      {/* queue */}
      {queue.length > 0 && (
        <section aria-label="Queue">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-emerald-300/80">
            <ListMusic className="h-4 w-4" /> Queue ({queue.length})
          </h2>
          <div className="card-surface thin-scrollbar max-h-96 overflow-y-auto rounded-2xl p-2">
            {queue.map((t, i) => (
              <TrackRow key={`${t.id}-${i}`} track={t} index={i} queue={queue} />
            ))}
          </div>
        </section>
      )}

      {/* recents */}
      {recents.length > 0 && (
        <section aria-label="Recently played">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-emerald-300/80">
              <Clock3 className="h-4 w-4" /> Recently Played
            </h2>
            <button
              type="button"
              onClick={clearRecents}
              className="text-[11px] text-emerald-200/40 underline-offset-2 hover:underline"
            >
              clear
            </button>
          </div>
          <div className="card-surface thin-scrollbar max-h-80 overflow-y-auto rounded-2xl p-2">
            {recents.map((t, i) => (
              <TrackRow
                key={`recent-${t.videoId}-${i}`}
                track={t}
                index={i}
                queue={recents}
                showIndex={false}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
