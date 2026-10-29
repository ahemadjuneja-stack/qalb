'use client'

// Qalb — User Playlists (LOCAL — music player style "add to playlist")
// ─────────────────────────────────────────────────────────────────
// Har track row par ⋮ button → "Playlist me add karein" sheet. User apni
// playlists bana sakta hai (localStorage — koi login nahi chahiye).
//
// Store: qalb_user_playlists_v1 = UserPlaylist[]
// Sheet state bhi isi file me (zustand) — TrackRow sirf openPicker() call
// karta hai, sheet QalbShell me mounted hai.

import { create } from 'zustand'
import type { QalbTrack } from '@/lib/types'

export interface UserPlaylist {
  id: string
  name: string
  emoji: string
  tracks: QalbTrack[]
  createdAt: string
}

const KEY = 'qalb_user_playlists_v1'

const PLAYLIST_EMOJIS = ['🎵', '🕌', '🤲', '⭐', '🌙', '📿', '💚', '✨', '🕋', '🌸']

function readAll(): UserPlaylist[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KEY)
    const list = raw ? (JSON.parse(raw) as UserPlaylist[]) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function writeAll(list: UserPlaylist[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* quota — ignore */
  }
}

export function listUserPlaylists(): UserPlaylist[] {
  return readAll()
}

export function createUserPlaylist(name: string, emoji?: string): UserPlaylist {
  const pl: UserPlaylist = {
    id: `upl-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    name: name.trim() || 'Meri Playlist',
    emoji: emoji ?? PLAYLIST_EMOJIS[Math.floor(Math.random() * PLAYLIST_EMOJIS.length)],
    tracks: [],
    createdAt: new Date().toISOString(),
  }
  writeAll([pl, ...readAll()])
  return pl
}

export function deleteUserPlaylist(id: string) {
  writeAll(readAll().filter((p) => p.id !== id))
}

export function renameUserPlaylist(id: string, name: string) {
  writeAll(readAll().map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p)))
}

/** Track add — duplicate guard. returns 'added' | 'exists' | 'created:<id>' */
export function addTrackToUserPlaylist(playlistId: string, track: QalbTrack): 'added' | 'exists' {
  const list = readAll()
  const pl = list.find((p) => p.id === playlistId)
  if (!pl) return 'added'
  if (pl.tracks.some((t) => t.videoId === track.videoId)) return 'exists'
  pl.tracks.push({ ...track })
  writeAll(list)
  return 'added'
}

export function removeTrackFromUserPlaylist(playlistId: string, videoId: string) {
  writeAll(
    readAll().map((p) =>
      p.id === playlistId ? { ...p, tracks: p.tracks.filter((t) => t.videoId !== videoId) } : p
    )
  )
}

// ── zustand picker store (AddToPlaylistSheet) ─────────────────────

interface PickerState {
  open: boolean
  track: QalbTrack | null
  openPicker: (track: QalbTrack) => void
  closePicker: () => void
}

export const usePlaylistPicker = create<PickerState>((set) => ({
  open: false,
  track: null,
  openPicker: (track) => set({ open: true, track }),
  closePicker: () => set({ open: false, track: null }),
}))

export { PLAYLIST_EMOJIS }
