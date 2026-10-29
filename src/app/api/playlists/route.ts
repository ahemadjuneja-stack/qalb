// Qalb — GET /api/playlists
// Featured playlists with tracks (Firestore playlists collection ka local mirror).

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { QalbPlaylist, QalbTrack } from '@/lib/types'

export async function GET() {
  try {
    const playlists = await db.playlist.findMany({
      where: { featured: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        items: {
          orderBy: { position: 'asc' },
          include: { track: true },
        },
      },
    })

    const mapped: QalbPlaylist[] = playlists.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      coverEmoji: p.coverEmoji,
      accentColor: p.accentColor,
      tracks: p.items.map((i) => ({
        id: i.track.id,
        videoId: i.track.videoId,
        title: i.track.title,
        artist: i.track.artist,
        category: i.track.category,
        thumbnailUrl: i.track.thumbnailUrl,
        tags: i.track.tags,
        playCount: i.track.playCount,
      })) as QalbTrack[],
    }))

    return NextResponse.json({ playlists: mapped })
  } catch (e) {
    console.error('[api/playlists] error:', e)
    return NextResponse.json({ playlists: [], error: 'Playlists load nahi hue' }, { status: 500 })
  }
}
