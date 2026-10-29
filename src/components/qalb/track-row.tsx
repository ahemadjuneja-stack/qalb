'use client'

// Qalb — Track list row + playing indicator (equalizer bars)

import { memo } from 'react'
import { Pause, Play } from 'lucide-react'
import { usePlayerStore } from '@/lib/player-store'
import type { QalbTrack } from '@/lib/types'

export function EqualizerBars() {
  return (
    <span className="flex h-4 items-end gap-[2px]" aria-hidden>
      <span className="w-[3px] origin-bottom animate-eq-1 rounded-sm bg-emerald-400" style={{ height: '100%' }} />
      <span className="w-[3px] origin-bottom animate-eq-2 rounded-sm bg-emerald-300" style={{ height: '100%' }} />
      <span className="w-[3px] origin-bottom animate-eq-3 rounded-sm bg-emerald-400" style={{ height: '100%' }} />
    </span>
  )
}

// memo — lambi lists me doosre rows faltu re-render nahi hote (smooth scroll)
export const TrackRow = memo(function TrackRow({
  track,
  index,
  queue,
  showIndex = true,
}: {
  track: QalbTrack
  index: number
  queue: QalbTrack[]
  showIndex?: boolean
}) {
  const currentIndex = usePlayerStore((s) => s.currentIndex)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const playQueue = usePlayerStore((s) => s.playQueue)
  const toggle = usePlayerStore((s) => s.toggle)
  const failed = usePlayerStore((s) => s.failedVideoIds)

  const isActive =
    usePlayerStore.getState().queue[currentIndex]?.videoId === track.videoId &&
    usePlayerStore.getState().queue.length === queue.length &&
    usePlayerStore.getState().queue[currentIndex]?.id === track.id

  const isCurrent =
    currentIndex >= 0 &&
    usePlayerStore.getState().queue[currentIndex]?.videoId === track.videoId
  const isFailed = failed.includes(track.videoId)

  const handlePlay = () => {
    if (isCurrent) {
      toggle()
    } else {
      playQueue(queue, index)
    }
  }

  return (
    <button
      type="button"
      onClick={handlePlay}
      className="cv-row flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-emerald-400/5 active:scale-[0.99]"
      aria-label={`${track.title} — ${isCurrent && isPlaying ? 'pause' : 'play'}`}
    >
      {showIndex ? (
        isCurrent ? (
          <span className="flex w-6 shrink-0 justify-center">
            {isPlaying ? <EqualizerBars /> : <Play className="h-4 w-4 fill-emerald-400 text-emerald-400" />}
          </span>
        ) : (
          <span className="w-6 shrink-0 text-center text-xs tabular-nums text-emerald-100/30">
            {index + 1}
          </span>
        )
      ) : (
        <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-emerald-950">
          {track.thumbnailUrl ? (
            <img src={track.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
          ) : (
            <span className="flex h-full w-full items-center justify-center">🕌</span>
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition hover:opacity-100">
            <Play className="h-4 w-4 fill-white text-white" />
          </span>
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-[13.5px] font-semibold leading-snug ${
            isCurrent ? 'text-emerald-300' : 'text-emerald-50'
          }`}
        >
          {track.title}
        </span>
        <span className="block truncate text-[11.5px] text-emerald-200/50">
          {track.artist}
          {track.category && track.category !== 'SEARCH' ? ` • ${track.category}` : ''}
          {isFailed ? ' • embed unavailable' : ''}
        </span>
      </span>

      <span
        role="img"
        aria-label={isCurrent && isPlaying ? 'Pause' : 'Play'}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-emerald-200/60"
      >
        {isCurrent && isPlaying ? (
          <Pause className="h-4 w-4 fill-current" />
        ) : (
          <Play className="h-4 w-4 fill-current" />
        )}
      </span>
    </button>
  )
})
