'use client'

// Qalb — Full-screen Player Modal (expandable) — v0.5.28
// Audio-only mode: spinning cover art + glow
// Video mode: video WAHI dikhta hai jahan walkman (spinning cover) hota
//   hai — VideoAnchor ko measure karke YT host usi rect par baithta hai
//   (player-provider), aur usi jagah "Back to Music" button milta hai.
// Controls + actions row ab SCREEN KE BOTTOM par anchor hain (pehle
// beech me tairte the — user report: "button niche ki side aane chahiye").
// "Watch Video" labeled button music line (seekbar) ke UPAR.
// ❤️ Favorite — qawwali/naat favorites list me (lib/favorites.ts)

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
  Heart,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { EcgSeekbar } from '@/components/qalb/ecg-seekbar'
import { usePlayerStore, useCurrentTrack } from '@/lib/player-store'
import { useFavoritesStore, useIsFavorite } from '@/lib/favorites'
import { useToast } from '@/hooks/use-toast'

function fmt(sec: number): string {
  if (!sec || !Number.isFinite(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// ── video anchor: YT host isko walkman-cover ke spot par measure karta hai ──
function VideoAnchor() {
  const ref = useRef<HTMLDivElement>(null)
  const setVideoRect = usePlayerStore((s) => s.setVideoRect)

  useEffect(() => {
    let alive = true
    const measure = () => {
      const el = ref.current
      if (!el || !alive) return
      const r = el.getBoundingClientRect()
      if (r.width > 4 && r.height > 4) {
        setVideoRect({ top: r.top, left: r.left, width: r.width, height: r.height })
      }
    }
    // modal slide-up animation (~0.7s) ke dauran bhi track karo
    measure()
    const timers = [80, 200, 350, 500, 700, 900, 1200].map((ms) =>
      window.setTimeout(measure, ms)
    )
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    return () => {
      alive = false
      for (const t of timers) window.clearTimeout(t)
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
      setVideoRect(null) // host wapas hidden corner me
    }
  }, [setVideoRect])

  return (
    <div
      ref={ref}
      className="relative aspect-video max-h-full w-full overflow-hidden bg-black"
      aria-hidden
    />
  )
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

  const isFav = useIsFavorite(current?.videoId)
  const toggleFavorite = useFavoritesStore((s) => s.toggleFavorite)
  const loadFavorites = useFavoritesStore((s) => s.loadFavorites)
  const favLoaded = useFavoritesStore((s) => s.loaded)

  // favorites store hydrate (modal kabhi bhi khul sakta hai)
  useEffect(() => {
    if (!favLoaded) loadFavorites()
  }, [favLoaded, loadFavorites])

  const isFailed = current ? failed.includes(current.videoId) : false

  const handleFavorite = () => {
    if (!current) return
    const added = toggleFavorite(current)
    toast(
      added
        ? {
            title: 'Favorites me add ho gaya ❤️',
            description: `"${current.title}" ab Profile → Favorites me hai.`,
          }
        : {
            title: 'Favorites se hata diya',
            description: `"${current.title}" list me ab nahi hai.`,
          }
    )
  }

  return (
    <AnimatePresence>
      {open && current && (
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 320, damping: 34 }}
          className="fullplayer-bg fixed inset-0 z-[60] flex flex-col overflow-hidden"
          role="dialog"
          aria-label="Full player"
        >
          {/* ── header ── */}
          <div className="flex shrink-0 items-center justify-between px-5 pt-3">
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
              {!audioOnly && ' • VIDEO'}
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

          {/* ── main area — audio: spinning walkman cover / video: video box ── */}
          {/* dono me flex-1 — neeche wala sab kuch bottom par anchor rehta hai */}
          {audioOnly ? (
            <>
              {/* walkman cover — flex-1 me center: neeche ka sab (button,
                  seekbar, controls, actions) SCREEN KE BOTTOM par anchor */}
              <div className="flex min-h-0 flex-1 items-center justify-center py-2">
                <div className="relative aspect-square w-[min(62vw,280px)]">
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
                      {/* vinyl center — walkman logo */}
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
              </div>

              {/* titles */}
              <div className="shrink-0 px-6 text-center">
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
            </>
          ) : (
            <>
              {/* video — WAHI jahan walkman ka logo hota hai (flex-1 center) */}
              <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-2">
                <div className="max-h-full w-[min(92vw,460px)]">
                  <VideoAnchor />
                </div>
              </div>

              {/* titles */}
              <div className="shrink-0 px-6 pt-1 text-center">
                <h2 className="line-clamp-2 text-xl font-bold leading-snug text-emerald-50">
                  {current.title}
                </h2>
                <p className="mt-1 text-sm text-emerald-200/60">{current.artist}</p>
              </div>
            </>
          )}

          {/* ── music line ke UPAR video button — "Watch Video" / "Back to Music" ── */}
          <div className="flex shrink-0 justify-center pt-4">
            {audioOnly ? (
              <button
                type="button"
                onClick={toggleAudioOnly}
                className="flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-5 py-2 text-[12.5px] font-extrabold text-emerald-200 transition hover:bg-emerald-400/20 active:scale-95"
              >
                <Video className="h-4 w-4" /> Watch Video
              </button>
            ) : (
              <button
                type="button"
                onClick={toggleAudioOnly}
                className="flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-5 py-2 text-[12.5px] font-extrabold text-emerald-200 transition hover:bg-emerald-400/20 active:scale-95"
              >
                <Headphones className="h-4 w-4" /> Back to Music
              </button>
            )}
          </div>

          {/* ── seek — ECG heartbeat line ── */}
          <div className="shrink-0 px-6 pt-4">
            <EcgSeekbar
              position={Math.min(position, duration || 1)}
              duration={duration > 0 ? duration : 0}
              onSeek={(s) => seek(s)}
              isPlaying={isPlaying && !isBuffering}
              interactive
            />
            <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-emerald-200/50">
              <span className={isPlaying ? 'qalb-ph-text' : ''}>{fmt(position)}</span>
              <span>{fmt(duration)}</span>
            </div>
          </div>

          {/* ── controls — screen ke BOTTOM par (flex-col + shrink-0 chain) ── */}
          <div className="mt-3 flex shrink-0 items-center justify-center gap-6 px-8">
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

          {/* ── secondary actions — bottom row: ❤️ Favorite ── */}
          <div className="mt-4 flex shrink-0 items-center justify-center gap-3 px-6">
            <button
              type="button"
              onClick={handleFavorite}
              aria-label={isFav ? 'Favorites se hatayein' : 'Favorites me add karein'}
              className={`flex items-center gap-2 rounded-full border px-4 py-2 text-[12px] font-semibold transition ${
                isFav
                  ? 'border-rose-400/40 bg-rose-400/15 text-rose-300'
                  : 'border-emerald-400/20 text-emerald-200/80 hover:bg-emerald-400/10'
              }`}
            >
              <Heart className={`h-4 w-4 ${isFav ? 'fill-current' : ''}`} />
              {isFav ? 'Favorited' : 'Favorite'}
            </button>
          </div>

          <div className="shrink-0 pb-[calc(1.25rem+env(safe-area-inset-bottom))]" />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
