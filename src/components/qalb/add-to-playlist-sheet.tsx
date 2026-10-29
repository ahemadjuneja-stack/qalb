'use client'

// Qalb — "Playlist me add karein" bottom sheet
// TrackRow ke ⋮ par khulta hai. User playlists list + nayi playlist
// banana + already-added par "Remove" option.

import { useEffect, useState } from 'react'
import { Check, ListPlus, Plus, Trash2, X } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  addTrackToUserPlaylist,
  createUserPlaylist,
  deleteUserPlaylist,
  listUserPlaylists,
  removeTrackFromUserPlaylist,
  usePlaylistPicker,
  type UserPlaylist,
} from '@/lib/user-playlists'

export function AddToPlaylistSheet() {
  const { open, track, closePicker } = usePlaylistPicker()
  const [playlists, setPlaylists] = useState<UserPlaylist[]>([])
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [justAdded, setJustAdded] = useState<string | null>(null)
  const { toast } = useToast()

  // sheet khulne par playlists refresh (localStorage → async pattern)
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => setPlaylists(listUserPlaylists()), 0)
    setCreating(false)
    setNewName('')
    setJustAdded(null)
    return () => clearTimeout(t)
  }, [open])

  if (!open || !track) return null

  const inPlaylist = (pl: UserPlaylist) => pl.tracks.some((t) => t.videoId === track.videoId)

  const handleAdd = (pl: UserPlaylist) => {
    if (inPlaylist(pl)) {
      // already added → remove offer
      removeTrackFromUserPlaylist(pl.id, track.videoId)
      setPlaylists(listUserPlaylists())
      toast({ title: `"${truncate(track.title)}" — ${pl.name} se hata diya` })
      return
    }
    addTrackToUserPlaylist(pl.id, track)
    setPlaylists(listUserPlaylists())
    setJustAdded(pl.id)
    setTimeout(() => setJustAdded(null), 1500)
    toast({ title: `${pl.emoji} ${pl.name} me add ho gaya` })
  }

  const handleCreate = () => {
    const name = newName.trim()
    if (!name) return
    const pl = createUserPlaylist(name)
    addTrackToUserPlaylist(pl.id, track)
    setPlaylists(listUserPlaylists())
    setCreating(false)
    setNewName('')
    toast({ title: `${pl.emoji} Nayi playlist "${pl.name}" bani — track add ho gaya` })
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Playlist me add karein"
      onClick={closePicker}
    >
      <div
        className="w-full max-w-md rounded-t-3xl border-t border-emerald-400/20 bg-[#0B1F17] px-4 pb-8 pt-3 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* handle */}
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-emerald-200/20" />

        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-emerald-50">Playlist me add karein</p>
            <p className="truncate text-[11px] text-emerald-200/50">
              {truncate(track.title)} — {track.artist}
            </p>
          </div>
          <button
            type="button"
            onClick={closePicker}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-200 transition hover:bg-emerald-400/20"
            aria-label="Band karein"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* nayi playlist quick create */}
        {creating ? (
          <div className="mb-3 flex items-center gap-2 rounded-2xl border border-emerald-400/25 bg-emerald-400/5 p-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') setCreating(false)
              }}
              placeholder="Playlist ka naam…"
              maxLength={40}
              className="min-w-0 flex-1 bg-transparent px-2 text-[13px] text-emerald-50 placeholder:text-emerald-200/35 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="emerald-gradient rounded-xl px-3 py-1.5 text-[12px] font-bold text-emerald-950 disabled:opacity-40"
            >
              Banao
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mb-3 flex w-full items-center gap-2.5 rounded-2xl border border-dashed border-emerald-400/30 bg-emerald-400/5 px-3 py-2.5 text-[13px] font-semibold text-emerald-300 transition hover:bg-emerald-400/10"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/15">
              <Plus className="h-4.5 w-4.5" />
            </span>
            Nayi playlist banao
          </button>
        )}

        {/* playlists list */}
        <div className="thin-scrollbar max-h-64 space-y-1 overflow-y-auto">
          {playlists.length === 0 && !creating && (
            <p className="py-6 text-center text-[12px] text-emerald-200/40">
              Abhi koi playlist nahi — upar se nayi banayein
            </p>
          )}
          {playlists.map((pl) => {
            const added = inPlaylist(pl)
            return (
              <div
                key={pl.id}
                className="flex items-center gap-2.5 rounded-2xl px-2 py-2 transition hover:bg-emerald-400/5"
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl"
                  style={{ background: `${'#10B981'}18`, border: '1px solid #10B98130' }}
                >
                  {pl.emoji}
                </span>
                <button
                  type="button"
                  onClick={() => handleAdd(pl)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-[13px] font-semibold text-emerald-50">
                    {pl.name}
                  </span>
                  <span className="block text-[10.5px] text-emerald-200/45">
                    {pl.tracks.length} kalam {added ? '• isme added hai' : ''}
                  </span>
                </button>
                {added ? (
                  <button
                    type="button"
                    onClick={() => handleAdd(pl)}
                    className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-red-400/10 px-2.5 text-[11px] font-bold text-red-300 transition hover:bg-red-400/20"
                    aria-label={`${pl.name} se remove karein`}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Hatao
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleAdd(pl)}
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${
                      justAdded === pl.id
                        ? 'bg-emerald-400 text-emerald-950'
                        : 'bg-emerald-400/15 text-emerald-300 hover:bg-emerald-400/25'
                    }`}
                    aria-label={`${pl.name} me add karein`}
                  >
                    {justAdded === pl.id ? <Check className="h-4 w-4" /> : <ListPlus className="h-4 w-4" />}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function truncate(s: string, n = 42): string {
  return s.length > n ? `${s.slice(0, n)}…` : s
}
