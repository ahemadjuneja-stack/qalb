'use client'

// Qalb — Global player state (Zustand)
// Ek single YouTube IFrame instance Poori app ko drive karta hai —
// Mini-Player + Full-screen Modal + Player tab sab isi context se jure hain.

import { create } from 'zustand'
import type { QalbTrack } from '@/lib/types'
import { recordPlay, countEvents } from '@/lib/recommend'
import { useQalbAuth, syncUserDoc } from '@/lib/auth'

export type RepeatMode = 'off' | 'all' | 'one'

interface PlayerState {
  queue: QalbTrack[]
  currentIndex: number
  isPlaying: boolean
  isBuffering: boolean
  position: number
  duration: number
  audioOnly: boolean // audio-only mode: video hidden, spinning cover art dikhta hai
  fullOpen: boolean // full-screen player modal
  repeat: RepeatMode
  shuffle: boolean
  ytApiReady: boolean
  failedVideoIds: string[]
  recents: QalbTrack[]

  // internal setters
  setYtApiReady: (v: boolean) => void
  setBuffering: (v: boolean) => void
  setPosition: (p: number) => void
  setDuration: (d: number) => void
  markFailed: (videoId: string) => void

  // actions
  playQueue: (tracks: QalbTrack[], startIndex?: number) => void
  playTrack: (track: QalbTrack) => void
  toggle: () => void
  pause: () => void
  next: (auto?: boolean) => void
  prev: () => void
  seek: (seconds: number) => void
  seekBy: (delta: number) => void
  setRepeat: (m: RepeatMode) => void
  toggleShuffle: () => void
  toggleAudioOnly: () => void
  openFull: () => void
  closeFull: () => void
  pushRecent: (track: QalbTrack) => void
  loadRecents: () => void
  clearRecents: () => void
}

const RECENTS_KEY = 'qalb_recents_v1'

// module-level YT player control bridge — PlayerProvider isse set karta hai
export const ytBridge: {
  loadVideo: (videoId: string) => void
  play: () => void
  pause: () => void
  seekTo: (s: number, allowSeekAhead?: boolean) => void
} = {
  loadVideo: () => {},
  play: () => {},
  pause: () => {},
  seekTo: () => {},
}

// ── Algorithm hook — har play par taste update, har 10 plays par cloud sync ──
let lastSyncedCount = 0
function trackPlayForAlgorithm(track: QalbTrack) {
  try {
    const uid = useQalbAuth.getState().user?.uid ?? null
    recordPlay(track, uid)
    const count = countEvents(uid)
    if (count - lastSyncedCount >= 10 && uid) {
      lastSyncedCount = count
      void syncUserDoc() // best-effort — rules pending ho to silent fail
    }
  } catch {
    /* algorithm failure kabhi playback nahi todna */
  }
}

function shuffleQueue<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function readRecents(): QalbTrack[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY)
    return raw ? (JSON.parse(raw) as QalbTrack[]) : []
  } catch {
    return []
  }
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  queue: [],
  currentIndex: -1,
  isPlaying: false,
  isBuffering: false,
  position: 0,
  duration: 0,
  audioOnly: true,
  fullOpen: false,
  repeat: 'off',
  shuffle: false,
  ytApiReady: false,
  failedVideoIds: [],
  recents: [],

  setYtApiReady: (v) => set({ ytApiReady: v }),
  setBuffering: (v) => set({ isBuffering: v }),
  setPosition: (p) => set({ position: p }),
  setDuration: (d) => set({ duration: d }),
  markFailed: (videoId) =>
    set((s) => ({
      failedVideoIds: s.failedVideoIds.includes(videoId)
        ? s.failedVideoIds
        : [...s.failedVideoIds, videoId],
    })),

  playQueue: (tracks, startIndex = 0) => {
    if (!tracks.length) return
    set({
      queue: tracks,
      currentIndex: startIndex,
      isPlaying: true,
      position: 0,
      duration: 0,
      failedVideoIds: [],
    })
    const t = tracks[startIndex]
    if (t) get().pushRecent(t)
  },

  playTrack: (track) => {
    const { queue } = get()
    const idx = queue.findIndex((t) => t.id === track.id || t.videoId === track.videoId)
    if (idx >= 0) {
      set({ currentIndex: idx, isPlaying: true, position: 0 })
    } else {
      set({ queue: [track, ...queue], currentIndex: 0, isPlaying: true, position: 0 })
    }
    get().pushRecent(track)
  },

  toggle: () => {
    const { isPlaying, queue, currentIndex } = get()
    if (currentIndex < 0 && queue.length === 0) return
    set({ isPlaying: !isPlaying })
  },

  pause: () => set({ isPlaying: false }),

  next: (auto = false) => {
    const { queue, currentIndex, repeat, shuffle } = get()
    if (!queue.length) return
    if (auto && repeat === 'one') {
      set({ position: 0 })
      ytBridge.seekTo(0, true)
      ytBridge.play()
      return
    }
    let nextIdx: number
    if (shuffle) {
      nextIdx =
        queue.length === 1
          ? currentIndex
          : Math.floor(Math.random() * queue.length - 1)
      if (nextIdx >= currentIndex) nextIdx += 1
    } else {
      nextIdx = currentIndex + 1
      if (nextIdx >= queue.length) {
        if (repeat === 'all' || !auto) nextIdx = 0
        else {
          // queue khatam — rok do
          set({ isPlaying: false })
          return
        }
      }
    }
    set({ currentIndex: nextIdx, isPlaying: true, position: 0, duration: 0 })
    get().pushRecent(queue[nextIdx])
  },

  prev: () => {
    const { queue, currentIndex, position } = get()
    if (!queue.length) return
    // YouTube style: 3s se zyada chala to restart
    if (position > 3) {
      set({ position: 0 })
      ytBridge.seekTo(0, true)
      return
    }
    const prevIdx = currentIndex - 1 < 0 ? queue.length - 1 : currentIndex - 1
    set({ currentIndex: prevIdx, isPlaying: true, position: 0, duration: 0 })
    get().pushRecent(queue[prevIdx])
  },

  seek: (seconds) => {
    set({ position: seconds })
    ytBridge.seekTo(seconds, true)
  },

  seekBy: (delta) => {
    const { position, duration } = get()
    const target = Math.min(Math.max(position + delta, 0), duration || position + delta)
    get().seek(target)
  },

  setRepeat: (m) => set({ repeat: m }),
  toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),
  toggleAudioOnly: () => set((s) => ({ audioOnly: !s.audioOnly })),
  openFull: () => set({ fullOpen: true }),
  closeFull: () => set({ fullOpen: false }),

  pushRecent: (track) => {
    if (typeof window === 'undefined') return
    const existing = readRecents().filter((t) => t.videoId !== track.videoId)
    const next = [track, ...existing].slice(0, 20)
    try {
      window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
    } catch {
      /* quota — ignore */
    }
    set({ recents: next })
    // per-user algorithm — play event (30s dedupe internally)
    trackPlayForAlgorithm(track)
  },

  loadRecents: () => set({ recents: readRecents() }),
  clearRecents: () => {
    try {
      window.localStorage.removeItem(RECENTS_KEY)
    } catch {
      /* ignore */
    }
    set({ recents: [] })
  },
}))

export function useCurrentTrack(): QalbTrack | null {
  return usePlayerStore((s) =>
    s.currentIndex >= 0 && s.queue.length ? s.queue[s.currentIndex] : null
  )
}
