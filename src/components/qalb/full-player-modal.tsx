'use client'

// Qalb — Full-screen Player Modal (expandable)
// Audio-only mode: spinning cover art + glow
// Video mode: upar YouTube video, neeche controls
// Seek slider, shuffle/repeat, download, audio-only toggle

import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Headphones,
  Video,
  Loader2,
  Download,
  Check,
} from 'lucide-react'
import { useState } from 'react'
import { Slider } from '@/components/ui/slider'
import { usePlayerStore, useCurrentTrack } from '@/lib/player-store'
import { downloadTrack, isDownloaded } from '@/lib/downloads'
import { useToast } from '@/hooks/use-toast'

function fmt(sec: number): string {
  if (!sec || !Number.isFinite(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function FullPlayerModal() {
  const open = usePlayerStore((s) => s.fullOpen)
  const closeFull = usePlayerStore((s) => s.closeFull)
  const current = useCurrentTrack()
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const isBuffering = usePlayerStore((s) => s.isBuffering)
  const audioOnly = usePlayerStore((s) => s.audioOnly)
  const position = usePlayerStore((s) => s.position)
  const duration = usePlayerStore((s) => s.duration)
  const repeat = usePlayerStore((s) => s.repeat)
  const shuffle = usePlayerStore((s) => s.shuffle)
  const failed = usePlayerStore((s) => s.failedVideoIds)

  const toggle = usePlayerStore((s) => s.toggle)
  const next = usePlayerStore((s) => s.next)
  const prev = usePlayerStore((s) => s.prev)
  const seek = usePlayerStore((s) => s.seek)
  const setRepeat = usePlayerStore((s) => s.setRepeat)
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle)
  const toggleAudioOnly = usePlayerStore((s) => s.toggleAudioOnly)
  const { toast } = useToast()

  const [downloaded, setDownloaded] = useState<boolean>(false)
  const [downloading, setDownloading] = useState(false)

  const isFailed = current ? failed.includes(current.videoId) : false

  const handleDownload = async () => {
    if (!current || downloading) return
    setDownloading(true)
    try {
      await downloadTrack(current)
      setDownloaded(true)
      toast({
        title: 'Offline save ho gaya ✅',
        description: `"${current.title}" ab downloads me available hai.`,
      })
    } catch {
      toast({ title: 'Download fail hua', description: 'Dobara koshish karein.' })
    } finally {
      setDownloading(false)
    }
  }

  const alreadyDownloaded = downloaded || (current ? isDownloaded(current.id) : false)

  return (
    <AnimatePresence>
      {open && current && (
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 320, damping: 34 }}
          className="fullplayer-bg fixed inset-0 z-[60] overflow-y-auto"
          role="dialog"
          aria-label="Full player"
        >
          {/* video mode me YT iframe is space par fixed z-[65] me rehta hai */}
          {audioOnly ? (
            <div className="flex flex-col px-5 pb-6 pt-3">
              {/* header */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  aria-label="Player band karein"
                  onClick={closeFull}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-emerald-100/70 transition hover:bg-white/5"
                >
                  <ChevronDown className="h-6 w-6" />
                </button>
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-emerald-300">
                  {current.category}
                </span>
                <button
                  type="button"
                  aria-label={audioOnly ? 'Video mode on karein' : 'Audio-only mode'}
                  onClick={toggleAudioOnly}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-emerald-100/70 transition hover:bg-white/5"
                >
                  {audioOnly ? <Video className="h-5 w-5" /> : <Headphones className="h-5 w-5" />}
                </button>
              </div>

              {/* spinning cover art */}
              <div className="relative mx-auto mt-10 aspect-square w-[min(72vw,300px)]">
                <div className="absolute inset-[-14%] animate-pulse-glow rounded-full bg-emerald-500/25 blur-3xl" />
                <div className="h-full w-full animate-spin-slow">
                  <div className="relative h-full w-full overflow-hidden rounded-full border-4 border-emerald-400/20 shadow-[0_0_60px_-10px_var(--glow)]">
                    {current.thumbnailUrl ? (
                      <img
                        src={current.thumbnailUrl}
                        alt={`${current.title} cover art`}
                        className="absolute left-1/2 top-1/2 h-[133.33%] w-auto max-w-none min-w-full -translate-x-1/2 -translate-y-1/2 object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-emerald-900 text-6xl">
                        🕌
                      </div>
                    )}
                    {/* vinyl center */}
                    <div className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-emerald-300/30 bg-black/85">
                      <span className="text-xl">☪️</span>
                    </div>
                    {/* vinyl grooves */}
                    <div className="absolute inset-3 rounded-full border border-white/5" />
                    <div className="absolute inset-8 rounded-full border border-white/5" />
                    <div className="absolute inset-14 rounded-full border border-white/5" />
                  </div>
                </div>
                {isBuffering && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-300" />
                  </div>
                )}
              </div>

              {/* titles */}
              <div className="mt-8 text-center">
                <h2 className="text-xl font-bold leading-snug text-emerald-50">{current.title}</h2>
                <p className="mt-1 text-sm text-emerald-200/60">{current.artist}</p>
                {isFailed && (
                  <p className="mt-2 inline-flex flex-wrap items-center justify-center gap-2 rounded-full bg-red-500/10 px-3 py-1 text-[11px] text-red-300">
                    Yeh track embed nahi ho saka — agla chal raha hai
                    <a
                      href={`https://www.youtube.com/watch?v=${current.videoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 hover:text-red-200"
                    >
                      YouTube pe kholen ↗
                    </a>
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col">
              {/* video area space (YT host fixed h-[240px]) */}
              <div className="h-[240px] w-full bg-black" />
              <div className="flex items-center justify-between px-5 pt-3">
                <button
                  type="button"
                  aria-label="Player band karein"
                  onClick={closeFull}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-emerald-100/70 transition hover:bg-white/5"
                >
                  <ChevronDown className="h-6 w-6" />
                </button>
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-emerald-300">
                  {current.category} • VIDEO
                </span>
                <button
                  type="button"
                  aria-label="Audio-only mode"
                  onClick={toggleAudioOnly}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-emerald-100/70 transition hover:bg-white/5"
                >
                  <Headphones className="h-5 w-5" />
                </button>
              </div>
              <div className="px-5 pt-2 text-center">
                <h2 className="text-xl font-bold leading-snug text-emerald-50">{current.title}</h2>
                <p className="mt-1 text-sm text-emerald-200/60">{current.artist}</p>
              </div>
            </div>
          )}

          {/* seek — chalte waqt line + thumb qalb ki tarah dhadakte hain */}
          <div className="px-6 pt-6">
            <Slider
              value={[Math.min(position, duration || 1)]}
              max={duration > 0 ? duration : 100}
              step={1}
              onValueChange={(v) => seek(v[0] ?? 0)}
              aria-label="Seek"
              className={`[&_[data-slot=slider-range]]:bg-emerald-400 [&_[data-slot=slider-thumb]]:border-emerald-400 [&_[data-slot=slider-track]]:bg-emerald-400/15 ${
                isPlaying && !isBuffering ? 'qalb-heartbeat-slider' : ''
              }`}
            />
            <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-emerald-200/50">
              <span className={isPlaying ? 'qalb-ph-text' : ''}>{fmt(position)}</span>
              <span>{fmt(duration)}</span>
            </div>
          </div>

          {/* controls */}
          <div className="mt-4 flex items-center justify-center gap-6 px-8">
            <button
              type="button"
              aria-label="Shuffle"
              onClick={toggleShuffle}
              className={`flex h-11 w-11 items-center justify-center rounded-full transition ${
                shuffle ? 'bg-emerald-400/15 text-emerald-300' : 'text-emerald-100/50 hover:text-emerald-200'
              }`}
            >
              <Shuffle className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Pichla kalam"
              onClick={prev}
              className="flex h-12 w-12 items-center justify-center rounded-full text-emerald-100 transition hover:bg-white/5 active:scale-95"
            >
              <SkipBack className="h-7 w-7 fill-current" />
            </button>
            <button
              type="button"
              aria-label={isPlaying ? 'Pause' : 'Play'}
              onClick={toggle}
              className="emerald-gradient flex h-[72px] w-[72px] items-center justify-center rounded-full text-emerald-950 shadow-[0_0_36px_-6px_var(--glow)] transition hover:scale-105 active:scale-95"
            >
              {isBuffering ? (
                <Loader2 className="h-9 w-9 animate-spin" />
              ) : isPlaying ? (
                <Pause className="h-9 w-9 fill-current" />
              ) : (
                <Play className="h-9 w-9 translate-x-[2px] fill-current" />
              )}
            </button>
            <button
              type="button"
              aria-label="Agla kalam"
              onClick={() => next()}
              className="flex h-12 w-12 items-center justify-center rounded-full text-emerald-100 transition hover:bg-white/5 active:scale-95"
            >
              <SkipForward className="h-7 w-7 fill-current" />
            </button>
            <button
              type="button"
              aria-label={`Repeat: ${repeat}`}
              onClick={() =>
                setRepeat(repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off')
              }
              className={`flex h-11 w-11 items-center justify-center rounded-full transition ${
                repeat !== 'off'
                  ? 'bg-emerald-400/15 text-emerald-300'
                  : 'text-emerald-100/50 hover:text-emerald-200'
              }`}
            >
              {repeat === 'one' ? <Repeat1 className="h-5 w-5" /> : <Repeat className="h-5 w-5" />}
            </button>
          </div>

          {/* secondary actions */}
          <div className="mt-6 flex items-center justify-center gap-3 px-6">
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading || alreadyDownloaded}
              className={`flex items-center gap-2 rounded-full border px-4 py-2 text-[12px] font-semibold transition ${
                alreadyDownloaded
                  ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                  : 'border-emerald-400/20 text-emerald-200/80 hover:bg-emerald-400/10'
              }`}
            >
              {alreadyDownloaded ? (
                <>
                  <Check className="h-4 w-4" /> Offline saved
                </>
              ) : (
                <>
                  {downloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Offline download
                </>
              )}
            </button>
          </div>

          <div className="pb-[calc(2rem+env(safe-area-inset-bottom))]" />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
