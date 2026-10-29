'use client'

// Qalb — Global floating Mini-Player
// Har tab ke upar visible rehta hai (Spotify-style). Tap → full player modal.

import { motion, AnimatePresence } from 'framer-motion'
import { Pause, Play, SkipForward, ChevronUp, Loader2 } from 'lucide-react'
import { usePlayerStore, useCurrentTrack } from '@/lib/player-store'

export function MiniPlayer() {
  const current = useCurrentTrack()
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const isBuffering = usePlayerStore((s) => s.isBuffering)
  const position = usePlayerStore((s) => s.position)
  const duration = usePlayerStore((s) => s.duration)
  const toggle = usePlayerStore((s) => s.toggle)
  const next = usePlayerStore((s) => s.next)
  const openFull = usePlayerStore((s) => s.openFull)

  const progress = duration > 0 ? Math.min((position / duration) * 100, 100) : 0

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          initial={{ y: 90, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 90, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className="fixed inset-x-2 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 md:mx-auto md:max-w-md"
        >
          <div
            role="button"
            tabIndex={0}
            aria-label="Full player kholein"
            onClick={openFull}
            onKeyDown={(e) => e.key === 'Enter' && openFull()}
            className="glass relative flex items-center gap-3 overflow-hidden rounded-2xl border border-emerald-400/15 p-2 pr-3 shadow-[0_12px_40px_-12px_var(--shadow-float)]"
          >
            {/* progress hairline */}
            <div className="absolute inset-x-0 top-0 h-[2px] bg-emerald-400/10">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-300 transition-[width] duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* cover */}
            <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-emerald-950">
              {current.thumbnailUrl ? (
                <img
                  src={current.thumbnailUrl}
                  alt=""
                  className="absolute left-1/2 top-1/2 h-[133.33%] w-auto max-w-none min-w-full -translate-x-1/2 -translate-y-1/2 object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-lg">🕌</div>
              )}
              {isBuffering && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-300" />
                </div>
              )}
            </div>

            {/* title */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold leading-tight text-emerald-50">
                {current.title}
              </p>
              <p className="truncate text-[11px] leading-tight text-emerald-200/60">
                {current.artist}
              </p>
            </div>

            {/* controls */}
            <button
              type="button"
              aria-label={isPlaying ? 'Pause' : 'Play'}
              onClick={(e) => {
                e.stopPropagation()
                toggle()
              }}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-emerald-950 transition hover:bg-emerald-400 active:scale-95"
            >
              {isPlaying ? (
                <Pause className="h-5 w-5 fill-current" />
              ) : (
                <Play className="h-5 w-5 fill-current" />
              )}
            </button>
            <button
              type="button"
              aria-label="Agla kalam"
              onClick={(e) => {
                e.stopPropagation()
                next()
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full text-emerald-200/80 transition hover:bg-emerald-400/10 hover:text-emerald-100 active:scale-95"
            >
              <SkipForward className="h-4.5 w-4.5 fill-current" />
            </button>
            <ChevronUp className="h-4 w-4 shrink-0 text-emerald-200/50" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
