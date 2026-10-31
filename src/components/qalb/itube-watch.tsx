'use client'

// iTube WATCH — YouTube watch-page (v0.5.1)
// ─────────────────────────────────────────────────────────────────
// YouTube app ke watch screen jaisa:
//   • Top: edge-to-edge 16:9 YouTube player (YT ke apne controls —
//     seek, play/pause, quality, captions, fullscreen)
//   • Title, channel • views • published
//   • Action chips: Pasand (like) + Share
//   • "Aage dekhein" related videos — tap → video switch (screen
//     band kiye bina, YT app jaisa autoplay-next feel)
//
// Player YT ka embed hai — sabse reliable (reels me proven), bot-check
// ka koi risk nahi, fullscreen/quality sab built-in.
// Back button (Android) aur back-arrow dono screen band karte hain.

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, Loader2, Share2, ThumbsUp } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useViewBackHandler } from '@/lib/back-stack'
import { viewsLabel } from '@/lib/innertube-x'
import { recordPlay } from '@/lib/recommend'
import { trackPub } from '@/lib/itube'
import type { QalbTrack } from '@/lib/types'

// like registry (per-device)
const LIKE_KEY = 'qalb_itube_likes_v1'

function getLikes(): Set<string> {
  try {
    const raw = localStorage.getItem(LIKE_KEY)
    const arr = raw ? (JSON.parse(raw) as string[]) : []
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

function setLiked(videoId: string, liked: boolean) {
  try {
    const set = getLikes()
    if (liked) set.add(videoId)
    else set.delete(videoId)
    localStorage.setItem(LIKE_KEY, JSON.stringify([...set]))
  } catch {
    /* private mode */
  }
}

export function ItubeWatch({
  track,
  related,
  onPick,
  onClose,
}: {
  track: QalbTrack
  related: QalbTrack[]
  onPick: (t: QalbTrack) => void
  onClose: () => void
}) {
  const { toast } = useToast()
  // frameReady: kaunsi video ka iframe load ho chuka (video switch par
  // purani value naya videoId cover na kare — isliye videoId store hota hai)
  const [readyVid, setReadyVid] = useState<string | null>(null)
  const [likeTick, setLikeTick] = useState(0)
  const scrollerRef = useRef<HTMLDivElement>(null)

  // Android back — watch screen band (YouTube app jaisa)
  useViewBackHandler('itube-watch', 'reels', () => {
    onClose()
    return true // back handle ho gaya — chain yahin ruke
  })

  // mount: body scroll lock (watch screen ka apna scroll hai)
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  // video open/switch — taste profile update + scroll top (external DOM)
  useEffect(() => {
    recordPlay(track)
    scrollerRef.current?.scrollTo({ top: 0 })
  }, [track.videoId])

  const liked = useMemo(() => getLikes().has(track.videoId), [track.videoId, likeTick])

  const share = async () => {
    const url = `https://youtu.be/${track.videoId}`
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: track.title, text: track.title, url })
      } else {
        await navigator.clipboard.writeText(url)
        toast({ title: '🔗 Link copy ho gaya' })
      }
    } catch {
      /* user ne cancel kiya — koi masla nahi */
    }
  }

  const toggleLike = () => {
    const next = !getLikes().has(track.videoId)
    setLiked(track.videoId, next)
    setLikeTick((v) => v + 1) // re-render — liked derive phirse padhega
    if (next) toast({ title: '💚 Pasand mehfooz ho gayi' })
  }

  const pub = trackPub(track)
  const views = viewsLabel(track.playCount)

  return (
    <div
      className="fixed inset-0 z-[70] bg-emerald-950 pt-[env(safe-area-inset-top)]"
      role="dialog"
      aria-label={`${track.title} — iTube watch`}
    >
      <div ref={scrollerRef} className="h-full overflow-y-auto overscroll-contain">
        {/* ── player (edge-to-edge, YT watch jaisa) ── */}
        <div className="relative aspect-video w-full bg-black">
          <iframe
            key={track.videoId}
            src={`https://www.youtube.com/embed/${track.videoId}?autoplay=1&playsinline=1&controls=1&rel=0&modestbranding=1&iv_load_policy=3&fs=1`}
            title={track.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            onLoad={() => setReadyVid(track.videoId)}
            className="absolute inset-0 h-full w-full"
          />
          {/* buffering splash — YT ka apna spinner aane tak thumbnail */}
          <div
            className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${
              readyVid === track.videoId ? 'opacity-0' : 'opacity-100'
            }`}
          >
            <img
              src={track.thumbnailUrl ?? ''}
              alt=""
              className="h-full w-full object-cover opacity-70"
            />
            <Loader2 className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 animate-spin text-white/80" />
          </div>
          {/* back arrow — video ke upar top-left (YT app jaisa) */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Watch band karein"
            className="absolute left-3 top-2 z-10 rounded-full bg-black/45 p-2 text-white backdrop-blur-sm active:scale-90"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        </div>

        {/* ── title + meta + actions ── */}
        <div className="px-4 pt-3">
          <h1 className="line-clamp-2 text-[15.5px] font-bold leading-snug text-emerald-50">
            {track.title}
          </h1>
          <p className="mt-1.5 text-[12px] font-medium text-emerald-200/60">
            {track.artist}
            {views ? ` • ${views}` : ''}
            {pub ? ` • ${pub}` : ''}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={toggleLike}
              aria-pressed={liked}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-bold transition active:scale-95 ${
                liked
                  ? 'bg-emerald-400 text-emerald-950 shadow-[0_0_14px_-4px_var(--glow)]'
                  : 'border border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-100/80'
              }`}
            >
              <ThumbsUp className={`h-3.5 w-3.5 ${liked ? 'fill-emerald-950' : ''}`} />
              Pasand
            </button>
            <button
              type="button"
              onClick={() => void share()}
              className="flex items-center gap-1.5 rounded-full border border-emerald-400/15 bg-emerald-400/[0.06] px-4 py-2 text-[12px] font-bold text-emerald-100/80 transition active:scale-95"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share
            </button>
          </div>
        </div>

        {/* ── related ── */}
        <div className="mt-4 border-t border-emerald-400/10 px-2 pt-3">
          <p className="px-2 pb-2 text-[13px] font-bold text-emerald-50">Aage dekhein</p>
          {related.length ? (
            related.map((r) => {
              const rv = viewsLabel(r.playCount)
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onPick(r)}
                  className="flex w-full items-start gap-3 rounded-xl p-2 text-left transition active:bg-emerald-400/[0.06]"
                >
                  <div className="relative w-[140px] shrink-0 overflow-hidden rounded-lg bg-emerald-400/[0.06]">
                    <img
                      src={r.thumbnailUrl ?? ''}
                      alt={r.title}
                      loading="lazy"
                      className="aspect-video w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[12.5px] font-bold leading-snug text-emerald-50">
                      {r.title}
                    </p>
                    <p className="mt-1 truncate text-[11px] text-emerald-200/55">
                      {r.artist}
                      {rv ? ` • ${rv}` : ''}
                    </p>
                  </div>
                </button>
              )
            })
          ) : (
            <p className="px-2 pb-3 text-[11.5px] text-emerald-200/40">
              Bas yahi tak — upar back kar ke aur khojein 🌙
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
