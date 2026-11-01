'use client'

// Qalb — Favorites (v0.5.28)
// ─────────────────────────────────────────────────────────────────
// Music player ke ❤️ button se naat/hamd/qawwali favorite list me
// save hoti hai. localStorage me rakhte hain (recents jaisa pattern) —
// offline bhi chalta hai, koi server zaroori nahi. Profile tab me
// poori list dikhti hai (profile-view → Favorites section).
//
// Dedupe videoId se — ek hi kalam dobara add nahi hoti.
// Cap 500 — purani sab se pehle udti hai (quota safety).

import { create } from 'zustand'
import type { QalbTrack } from '@/lib/types'

const FAVORITES_KEY = 'qalb_favorites_v1'
const CAP = 500

interface FavoritesState {
  favorites: QalbTrack[]
  loaded: boolean

  loadFavorites: () => void
  toggleFavorite: (track: QalbTrack) => boolean // true = add hua, false = remove hua
  isFavorite: (videoId: string) => boolean
  clearFavorites: () => void
}

function readFavorites(): QalbTrack[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.filter(
      (t): t is QalbTrack =>
        t && typeof t === 'object' && typeof t.videoId === 'string' && typeof t.title === 'string'
    )
  } catch {
    return []
  }
}

function writeFavorites(list: QalbTrack[]): void {
  try {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(list.slice(0, CAP)))
  } catch {
    /* quota — ignore */
  }
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  favorites: [],
  loaded: false,

  loadFavorites: () => {
    const list = readFavorites()
    set({ favorites: list, loaded: true })
  },

  toggleFavorite: (track) => {
    const existing = get().favorites
    const idx = existing.findIndex((t) => t.videoId === track.videoId)
    let next: QalbTrack[]
    let added: boolean
    if (idx >= 0) {
      next = existing.filter((t) => t.videoId !== track.videoId)
      added = false
    } else {
      next = [track, ...existing].slice(0, CAP)
      added = true
    }
    writeFavorites(next)
    set({ favorites: next })
    return added
  },

  isFavorite: (videoId) => get().favorites.some((t) => t.videoId === videoId),

  clearFavorites: () => {
    writeFavorites([])
    set({ favorites: [] })
  },
}))

// Subscribe-friendly helper (button me direct select hota hai)
export function useIsFavorite(videoId: string | null | undefined): boolean {
  return useFavoritesStore((s) =>
    videoId ? s.favorites.some((t) => t.videoId === videoId) : false
  )
}
