'use client'

// Qalb — Home Tab (JioSaavn-style FULL FEED)
// ─────────────────────────────────────────────────────────────────
// JioSaavn ke top-to-bottom dense layout par bana hua:
//   1. Header — logo + avatar (login) + theme
//   2. Search (top) + smart chips
//   3. 🔥 Aaj ka Trending — daily rotation rank cards
//   4. "Aur Suniye" chips — JioSaavn inline suggestions
//   5. ⭐ {TopArtist} — Aap ki Pasand (SIRF play history bane par)
//   6. 🎙️ Kalaamkar Stations — listeners count + personal badge
//   7. 📿 Made For You — Daily Mix / Naya Suno / Aaj ka Genre (mosaic cards)
//   8. 🎭 Moods & Genres — category gradient cards
//   9. 🆕 Aaj ke Naye Kalaam — har roz naya fresh slice
//  10. 💚 Aap ki Playlists + 🎧 Curated Playlists
// Har section algorithm se bhara — koi khaali jagah nahi (bhara bhara feel).
// Personalization: lib/recommend.ts (play history → taste → feed).

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Search,
  Loader2,
  Play,
  ChevronDown,
  Moon,
  SunMedium,
  ListPlus,
  Trash2,
  UserRound,
  Sparkles,
  Radio,
  Flame,
  LogIn,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { TrackRow } from '@/components/qalb/track-row'
import { QalbLogo } from '@/components/qalb/qalb-logo'
import { QalbThumb } from '@/components/qalb/thumb-square'
import { usePlayerStore } from '@/lib/player-store'
import { fetchPlaylistsSmart } from '@/lib/remote-data'
import { validateSmart, youtubeSearchSmart } from '@/lib/search-client'
import { SEARCH_SUGGESTIONS } from '@/lib/qalb'
import { getTheme, applyTheme, type QalbTheme } from '@/lib/theme'
import { todayLabel } from '@/lib/daily-trending'
import {
  buildFeed,
  collectRemoteTracks,
  getTasteProfile,
  useTasteStore,
  type MixCard,
  type MoodCard,
  type StationCard,
} from '@/lib/recommend'
import { getLiveFeed, viewsLabel, type LiveFeedData } from '@/lib/live-catalog'
import { getFolder, type QalbFolder } from '@/lib/folders'
import {
  FolderGrid,
  FolderDetail,
  PlaylistDetail,
} from '@/components/qalb/views/browse-view'
import { useQalbAuth } from '@/lib/auth'
import {
  listUserPlaylists,
  deleteUserPlaylist,
  usePlaylistPicker,
  type UserPlaylist,
} from '@/lib/user-playlists'
import type { QalbPlaylist, QalbTrack, SearchValidationResult } from '@/lib/types'
import { useViewBackHandler } from '@/lib/back-stack'

type Phase = 'idle' | 'validating' | 'blocked' | 'searching' | 'results'

// Search watchdog — agar network promise atak jaye (CapacitorHttp ka known
// issue: kabhi-kabhi native promise settle nahi hota) to UI hamesha recover
// ho. Iske bina search box hamesha ke liye "lock" ho jata tha.
const SEARCH_WATCHDOG_MS = 15000

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('search-timeout')), ms)
    p.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) }
    )
  })
}

const CATEGORY_CHIPS = [
  { label: 'Naat', query: 'naat sharif' },
  { label: 'Hamd', query: 'hamd e bari taala' },
  { label: 'Qawwali', query: 'sufi qawwali' },
  { label: 'Nasheed', query: 'islamic nasheed' },
]

// ── browse drill-in stack (folders grid → folder → playlist detail) ──
type BrowseItem =
  | { kind: 'grid' }
  | { kind: 'folder'; folder: QalbFolder }
  | { kind: 'playlist'; playlist: QalbPlaylist; folder: QalbFolder }

/** playlist ki majority category — live expansion isi folder se hogi */
function playlistCategory(p: QalbPlaylist): string {
  const counts = new Map<string, number>()
  for (const t of p.tracks) {
    const c = String(t.category ?? 'NAAT').toUpperCase()
    counts.set(c, (counts.get(c) ?? 0) + 1)
  }
  let best = 'NAAT'
  let bestN = 0
  for (const [c, n] of counts) {
    if (n > bestN) {
      best = c
      bestN = n
    }
  }
  return best
}

function liveFolderForPlaylist(p: QalbPlaylist): QalbFolder | null {
  const cat = playlistCategory(p)
  const id =
    cat === 'QAWWALI' ? 'g-qawwali'
    : cat === 'NASHEED' ? 'g-nasheed'
    : cat === 'HAMD' ? 'g-hamd'
    : 'g-naat'
  const base = getFolder(id)
  // apna cache id — har playlist ki apni live expansion history
  return base ? { ...base, id: `pl-${p.id}` } : null
}

export function HomeView() {
  const [query, setQuery] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [guardian, setGuardian] = useState<SearchValidationResult | null>(null)
  const [results, setResults] = useState<QalbTrack[]>([])
  const [resultSource, setResultSource] = useState<string>('')
  const [activeContinuation, setActiveContinuation] = useState<string | null>(null)
  const [refined, setRefined] = useState('')
  const [loadingMore, setLoadingMore] = useState(false)
  // strict mode: ambiguous query par results sirf Islamic-marker wale
  const [strictMode, setStrictMode] = useState(false)
  const [playlists, setPlaylists] = useState<QalbPlaylist[]>([])
  const [userPlaylists, setUserPlaylists] = useState<UserPlaylist[]>([])
  const [theme, setTheme] = useState<QalbTheme>('light')

  // har nayi search purani ko supersede karti hai (generation counter)
  const searchIdRef = useRef(0)

  // auth + algorithm
  const user = useQalbAuth((s) => s.user)
  const openLogin = useQalbAuth((s) => s.openLogin)
  const uid = user?.uid ?? null
  const tasteV = useTasteStore((s) => s.v) // play hone par feed refresh

  // ── LIVE feed state — YouTube se trending/fresh/mixes ──
  const [live, setLive] = useState<LiveFeedData | null>(null)
  const [browse, setBrowse] = useState<BrowseItem[]>([])

  const openBrowseGrid = () => setBrowse([{ kind: 'grid' }])
  const openFolder = (folder: QalbFolder) => setBrowse((s) => [...s, { kind: 'folder', folder }])
  const openPlaylistDetail = (playlist: QalbPlaylist) => {
    const folder = liveFolderForPlaylist(playlist)
    if (!folder || playlist.tracks.length === 0) return
    setBrowse((s) => [...s, { kind: 'playlist', playlist, folder }])
  }
  const popBrowse = () => setBrowse((s) => s.slice(0, -1))

  // Back gesture (v0.3.1): search results / Kalaamkar station / guardian
  // screen khuli ho to wapas home feed par — "har screen par back chale"
  useViewBackHandler('home-browse', 'home', () => {
    if (browse.length === 0) return false
    popBrowse()
    return true
  })
  useViewBackHandler('home-search', 'home', () => {
    if (phase === 'idle') return false
    searchIdRef.current++ // chalu search generation cancel
    setPhase('idle')
    setResults([])
    setGuardian(null)
    return true
  })

  const playQueue = usePlayerStore((s) => s.playQueue)
  const openFull = usePlayerStore((s) => s.openFull)
  const openPicker = usePlaylistPicker((s) => s.openPicker)
  const pickerOpen = usePlaylistPicker((s) => s.open)
  const { toast } = useToast()

  // playlists refresh bhi jab sheet band ho (naya track add hua ho)
  useEffect(() => {
    if (!pickerOpen) {
      const t = setTimeout(() => setUserPlaylists(listUserPlaylists()), 250)
      return () => clearTimeout(t)
    }
  }, [pickerOpen])

  useEffect(() => {
    // hosted API pehle, APK me Firestore REST fallback (remote-data.ts)
    fetchPlaylistsSmart()
      .then((p) => setPlaylists(p))
      .catch(() => setPlaylists([]))
    setTheme(getTheme())
    const t = setTimeout(() => setUserPlaylists(listUserPlaylists()), 0)
    // LIVE YouTube feed — trending top 10 + fresh uploads + mix sets
    // (2h cache — pehli call ke baad instant; fail par static pool chalta hai)
    const topArtist = getTasteProfile(uid).topArtist
    let alive = true
    void getLiveFeed(topArtist ? String(topArtist) : null).then((d) => {
      if (alive) setLive(d)
    })
    return () => {
      alive = false
      clearTimeout(t)
    }
     
  }, [])

  const switchTheme = () => {
    const next: QalbTheme = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    setTheme(next)
  }

  async function runSearch(rawQuery: string) {
    const q = rawQuery.trim()
    if (!q) return
    // NOTE: pehle yahan phase-guard tha — agar koi request atak jati to
    // search HAMESHA ke liye lock ho jata tha. Ab nayi search purani ko
    // cancel/supersede karti hai (stale generation ka result discard).
    const searchId = ++searchIdRef.current
    const stale = () => searchIdRef.current !== searchId
    setQuery(q)
    setGuardian(null)
    setPhase('validating')
    try {
      // APK-safe chain: hosted API → device-side rules (search-client.ts)
      const validation = await withTimeout(validateSmart(q), SEARCH_WATCHDOG_MS)
      if (stale()) return
      setGuardian(validation)

      if (!validation.valid) {
        setPhase('blocked')
        return
      }

      setPhase('searching')
      // APK-safe chain: YouTube unlimited → YT API → Firestore → bundled
      const usedQuery = validation.refinedQuery || q
      setRefined(usedQuery)
      // strict mode: ambiguous query (naam waghera) → results par sirf
      // Islamic-marker wale pass hote hain (result-filter.ts)
      const strict = validation.strict === true
      setStrictMode(strict)
      const data = await withTimeout(youtubeSearchSmart(usedQuery, null, strict), SEARCH_WATCHDOG_MS)
      if (stale()) return
      setResults(data.tracks)
      setResultSource(data.source)
      setActiveContinuation(data.continuation)
      setPhase('results')

      if (data.tracks.length === 0) {
        toast({
          title: 'Koi paak kalaam result nahi mila',
          description:
            'Islamic keywords ke saath search karein — jaise "Tajdar-e-Haram naat" ya "Nusrat qawwali".',
        })
      }
    } catch {
      if (stale()) return
      setPhase('idle')
      toast({
        title: 'Search me masla hua',
        description: 'Network slow hai — dobara try karein.',
      })
    }
  }

  // "Aur Naat load karein" — YouTube continuation se agla page (UNLIMITED)
  async function loadMore() {
    if (!activeContinuation || loadingMore) return
    setLoadingMore(true)
    try {
      const data = await withTimeout(
        youtubeSearchSmart(refined, activeContinuation, strictMode),
        SEARCH_WATCHDOG_MS
      )
      setResults((prev) => {
        const seen = new Set(prev.map((t) => t.videoId))
        const fresh = data.tracks.filter((t) => !seen.has(t.videoId))
        return [...prev, ...fresh]
      })
      setActiveContinuation(data.continuation)
    } catch {
      /* network fail — chup reh, purane results safe hain */
    } finally {
      setLoadingMore(false)
    }
  }

  // ── ALGORITHM FEED — play history + daily seeds + LIVE YouTube (recommend.ts) ──
  const remotePoolTracks = useMemo(() => collectRemoteTracks(playlists), [playlists])
  const feed = useMemo(
    () => buildFeed(remotePoolTracks, uid, live),
    // tasteV: har play ke baad personalized sections dobara compute
    // live: YouTube trending/fresh aane par feed live sections me upgrade hota hai
    [remotePoolTracks, uid, tasteV, live]
  )

  const playNow = (tracks: QalbTrack[], i: number, label?: string) => {
    playQueue(tracks, i)
    openFull()
    if (label) toast({ title: `${label} chal raha hai 🎵` })
  }

  return (
    <div className="space-y-7 px-4 pb-8 pt-5">
      {/* header — logo + avatar (JioSaavn style) */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <QalbLogo className="h-12 w-auto" />
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-400/80">
            Assalam-o-Alaikum{user ? `, ${user.name}` : ''}
          </p>
          <p className="text-[11px] text-emerald-200/50">Naat • Hamd • Sufi Qawwali • Nasheed</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={switchTheme}
            aria-label={theme === 'dark' ? 'Light theme on karein' : 'Dark theme on karein'}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/15 bg-emerald-400/5 text-emerald-300 transition hover:bg-emerald-400/15 active:scale-95"
          >
            {theme === 'dark' ? <SunMedium className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          {/* avatar / login — JioSaavn top-right profile */}
          <button
            type="button"
            onClick={openLogin}
            aria-label={user ? 'Aap ka account' : 'Login karein'}
            className="gold-gradient flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl text-[15px] font-extrabold text-emerald-950 shadow-[0_0_24px_-6px_var(--glow)] transition active:scale-95"
          >
            {user ? (
              user.photoUrl ? (
                <img src={user.photoUrl} alt={user.name} className="h-full w-full object-cover" />
              ) : (
                user.name.charAt(0).toUpperCase()
              )
            ) : (
              <UserRound className="h-5 w-5" />
            )}
          </button>
        </div>
      </header>
      <div className="qalb-divider mt-3" aria-hidden="true" />

      {/* search — music player style sab se upar */}
      <section aria-label="Search">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void runSearch(query)
          }}
          className="relative"
        >
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-emerald-300/50" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Naat, hamd ya qawwali search karein…"
            aria-label="Search query"
            className="w-full rounded-2xl border border-emerald-400/15 bg-card py-3.5 pl-11 pr-28 text-sm text-emerald-50 placeholder:text-emerald-200/35 focus:border-emerald-400/40 focus:outline-none focus:ring-2 focus:ring-emerald-400/20"
          />
          <button
            type="submit"
            disabled={!query.trim() || phase === 'validating' || phase === 'searching'}
            className="emerald-gradient absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12px] font-bold text-emerald-950 transition hover:opacity-90 disabled:opacity-40"
          >
            {phase === 'validating' || phase === 'searching' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Search className="h-3.5 w-3.5" />
            )}
            {phase === 'validating' ? 'Checking…' : 'Search'}
          </button>
        </form>

        {/* suggestion chips */}
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
          {SEARCH_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void runSearch(s)}
              className="shrink-0 rounded-full border border-emerald-400/15 bg-emerald-400/5 px-3 py-1.5 text-[11px] font-medium text-emerald-200/70 transition hover:border-emerald-400/30 hover:text-emerald-100"
            >
              {s}
            </button>
          ))}
        </div>

        {/* NOTE: guardian verdict box hataya gaya — "Paak kalaam search" text
            har search ke baad dikhta tha. Valid searches me ab koi extra text
            nahi; blocked searches ka warning neeche wale blocked state me hai. */}

        {/* category quick chips */}
        {phase === 'idle' && (
          <div className="mt-4 flex flex-wrap gap-2">
            {CATEGORY_CHIPS.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => void runSearch(c.query)}
                className="rounded-full bg-emerald-400/10 px-3.5 py-1.5 text-[12px] font-semibold text-emerald-300 transition hover:bg-emerald-400/20"
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* blocked state */}
      {phase === 'blocked' && (
        <section className="card-surface rounded-2xl p-4 text-center">
          <p className="text-2xl">🚫</p>
          <p className="mt-2 text-sm font-semibold text-red-200">Sirf paak kalaam allowed hai</p>
          <p className="mt-1 text-xs leading-relaxed text-emerald-200/60">
            {guardian?.reason} — Bollywood, pop ya film songs search nahi ho sakte.
          </p>
        </section>
      )}

      {/* search results */}
      {phase === 'results' && (
        <section aria-label="Search results">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-300/80">
              Results ({results.length})
            </h2>
            <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-300/70">
              {resultSource === 'youtube'
                ? 'YouTube — live search'
                : resultSource === 'library'
                  ? 'verified library'
                  : resultSource === 'cache'
                    ? 'recent search'
                    : 'starter library'}
            </span>
          </div>
          <div className="card-surface rounded-2xl p-2">
            {results.length === 0 && (
              <div className="px-4 py-8 text-center">
                <p className="text-2xl">🤍</p>
                <p className="mt-2 text-sm font-semibold text-emerald-200/90">
                  Koi paak kalaam result nahi mila
                </p>
                <p className="mx-auto mt-1 max-w-[16rem] text-xs leading-relaxed text-emerald-200/50">
                  Qalb sirf Islamic content dikhata hai. "naat", "qawwali" ya
                  "sufi" ke saath search karein.
                </p>
              </div>
            )}
            {results.map((t, i) => (
              <TrackRow key={`${t.videoId}-${t.id}`} track={t} index={i} queue={results} showIndex={false} />
            ))}
          </div>
          {activeContinuation && results.length > 0 && (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="mx-auto mt-3 flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/5 px-4 py-2 text-[12px] font-bold text-emerald-300 transition hover:bg-emerald-400/15 disabled:opacity-50"
            >
              {loadingMore ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              Aur Naat load karein
            </button>
          )}
          <button
            type="button"
            onClick={() => setPhase('idle')}
            className="mx-auto mt-3 block text-[11px] text-emerald-200/50 underline-offset-2 hover:underline"
          >
            clear results
          </button>
        </section>
      )}

      {/* ══════════ FULL FEED (idle) — JioSaavn top-to-bottom ══════════ */}
      {phase !== 'results' && browse.length > 0 && (
        <section aria-label="Browse folders">
          {browse[browse.length - 1].kind === 'grid' && (
            <>
              <BackBar
                title="Moods • Genres • Kalaamkar"
                sub="Har folder me 100+ paak kalaam — YouTube LIVE"
                onBack={popBrowse}
              />
              <FolderGrid onOpen={openFolder} />
            </>
          )}
          {browse[browse.length - 1].kind === 'folder' && (
            <FolderDetail
              folder={(browse[browse.length - 1] as { kind: 'folder'; folder: QalbFolder }).folder}
              onBack={popBrowse}
            />
          )}
          {browse[browse.length - 1].kind === 'playlist' && (
            <PlaylistDetail
              playlist={
                (browse[browse.length - 1] as { kind: 'playlist'; playlist: QalbPlaylist; folder: QalbFolder })
                  .playlist
              }
              liveFolder={
                (browse[browse.length - 1] as { kind: 'playlist'; playlist: QalbPlaylist; folder: QalbFolder })
                  .folder
              }
              onBack={popBrowse}
            />
          )}
        </section>
      )}

      {phase !== 'results' && browse.length === 0 && (
        <>
          {/* 🔥 1. AAJ KA TRENDING — LIVE YouTube (is hafte ke top views) */}
          {feed.trending.length > 0 && (
            <section aria-label="Aaj ka Trending">
              <SectionHead
                icon={<Flame className="h-4 w-4 text-orange-400" />}
                title={feed.trendingLive ? 'YouTube Trending — Top 10' : 'Aaj ka Trending'}
                sub={
                  feed.trendingLive
                    ? '🔴 LIVE • YouTube ke is hafte ke sab se suniye gaye kalaam'
                    : `${todayLabel()} — roz naye kalaam`
                }
                onPlay={() => playNow(feed.trending, 0, 'Aaj ka trending')}
              />
              <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
                {feed.trending.map((t, i) => (
                  <RankCard
                    key={t.videoId}
                    track={t}
                    rank={i + 1}
                    queue={feed.trending}
                    onPlay={playNow}
                    showViews={feed.trendingLive}
                  />
                ))}
              </div>
            </section>
          )}

          {/* "Aur Suniye" — JioSaavn inline suggestion strip */}
          <SuggestStrip chips={feed.suggestChips} onSearch={runSearch} />

          {/* ⭐ 2. AAP KI PASAND — top artist (history bane par hi dikhta hai) */}
          {feed.personalArtist && (
            <section aria-label="Aap ki pasand">
              <SectionHead
                icon={<Sparkles className="h-4 w-4 text-gold" />}
                title={`${feed.personalArtist.name} — Aap ki Pasand`}
                sub="Aap sab se zyada jo sunte hain"
                onPlay={() => playNow(feed.personalArtist!.tracks, 0)}
              />
              <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
                {feed.personalArtist.tracks.map((t, i) => (
                  <RankCard key={t.videoId} track={t} rank={i + 1} queue={feed.personalArtist!.tracks} onPlay={playNow} gold />
                ))}
              </div>
            </section>
          )}

          {/* 🎙️ 3. KALAAMKAR STATIONS — listeners + personal badge */}
          <section aria-label="Kalaamkar stations">
            <div className="mb-2.5 flex items-center justify-between">
              <div>
                <h2 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-emerald-300/80">
                  <Radio className="h-4 w-4 text-emerald-400" /> Kalaamkar Stations
                </h2>
                <p className="text-[10px] text-emerald-200/40">Tap karo — poora collection suno</p>
              </div>
            </div>
            <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-2">
              {feed.stations.map((st) => (
                <StationButton
                  key={st.name}
                  station={st}
                  onSearch={runSearch}
                  onOpenFolder={openFolder}
                />
              ))}
            </div>
          </section>

          {/* 📿 4. MADE FOR YOU — Daily Mix / Naya Suno / Aaj ka Genre */}
          {feed.mixes.length > 0 && (
            <section aria-label="Made for you">
              <div className="mb-2.5">
                <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-300/80">
                  📿 Aap ke Liye Banaya Gaya
                </h2>
                <p className="text-[10px] text-emerald-200/40">
                  {feed.tasteEmpty
                    ? 'Sunte jayein — mix aap ke saath smart hota jayega'
                    : 'Aap ki sunne ki aadat se banta hai, roz naya'}
                </p>
              </div>
              <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
                {feed.mixes.map((m) => (
                  <MixMosaicCard key={m.id} mix={m} onPlay={playNow} />
                ))}
              </div>
            </section>
          )}

          {/* 🎭 5. MOODS & GENRES — folders (tap par 100+ kalaam khulta hai) */}
          <section aria-label="Moods and genres">
            <div className="mb-2.5 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-300/80">
                  🎭 Moods &amp; Genres
                </h2>
                <p className="text-[10px] text-emerald-200/40">
                  Aaj kis mood me hain? — har folder me 100+ kalaam
                </p>
              </div>
              <button
                type="button"
                onClick={openBrowseGrid}
                className="shrink-0 rounded-full border border-emerald-400/25 bg-emerald-400/5 px-3 py-1.5 text-[11px] font-bold text-emerald-300 transition hover:bg-emerald-400/15"
              >
                Sab dekhein ›
              </button>
            </div>
            <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
              {feed.moods.map((m) => (
                <MoodButton
                  key={m.key}
                  mood={m}
                  onOpenFolder={openFolder}
                  onSearch={runSearch}
                />
              ))}
            </div>
          </section>

          {/* 🆕 6. AAJ KE NAYE KALAAM — LIVE fresh uploads (YouTube date-sort) */}
          {feed.fresh.length > 0 && (
            <section aria-label="Aaj ke naye kalaam">
              <SectionHead
                icon={<Sparkles className="h-4 w-4 text-emerald-400" />}
                title="Aaj ke Naye Kalaam"
                sub={
                  live?.fresh?.length
                    ? '🔴 LIVE • YouTube par bilkul naye uploads — roz badalta hai'
                    : 'Jo aap ne abhi tak nahi chuna — roz badalta hai'
                }
                onPlay={() => playNow(feed.fresh, 0, 'Naye kalaam')}
              />
              <div className="card-surface rounded-2xl p-2">
                {feed.fresh.map((t, i) => (
                  <TrackRow key={t.videoId} track={t} index={i} queue={feed.fresh} showIndex={false} />
                ))}
              </div>
            </section>
          )}

          {/* 💚 7. AAP KI PLAYLISTS */}
          {userPlaylists.length > 0 && (
            <section aria-label="Aap ki playlists">
              <h2 className="mb-2.5 text-sm font-bold uppercase tracking-wider text-emerald-300/80">
                💚 Aap ki Playlists
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {userPlaylists.map((p) => (
                  <div
                    key={p.id}
                    className="card-surface overflow-hidden rounded-2xl transition hover:border-emerald-400/30 active:scale-[0.98]"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (p.tracks.length === 0) {
                          toast({ title: 'Playlist khali hai', description: 'Kisi bhi track ke ⋮ se kalaam add karein.' })
                          return
                        }
                        playQueue(p.tracks, 0)
                        openFull()
                      }}
                      className="block w-full text-left"
                      aria-label={`${p.name} play karein`}
                    >
                      <div className="relative">
                        <QalbThumb
                          src={p.tracks[0]?.thumbnailUrl ?? null}
                          className="aspect-square w-full"
                          rounded="rounded-none"
                          fallbackEmoji={p.emoji}
                        />
                        <span className="absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-xl bg-black/55 text-lg backdrop-blur">
                          {p.emoji}
                        </span>
                        {p.tracks.length > 0 && (
                          <span className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-emerald-400/90 text-emerald-950 shadow-lg">
                            <Play className="h-4 w-4 fill-current" />
                          </span>
                        )}
                      </div>
                      <div className="p-2.5">
                        <p className="truncate text-[13px] font-bold text-emerald-50">{p.name}</p>
                        <p className="truncate text-[10.5px] text-emerald-200/50">{p.tracks.length} kalam</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        deleteUserPlaylist(p.id)
                        setUserPlaylists(listUserPlaylists())
                        toast({ title: `"${p.name}" delete ho gayi` })
                      }}
                      className="mb-2 ml-3 flex items-center gap-1 text-[10px] font-semibold text-red-300/70 transition hover:text-red-300"
                      aria-label={`${p.name} delete karein`}
                    >
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 🎧 8. CURATED PLAYLISTS — page poora bharte hain */}
          {playlists.length > 0 && (
            <section aria-label="Playlists">
              <div className="mb-2.5 flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-300/80">
                  🎧 Curated Playlists
                </h2>
                <span className="text-[10px] text-emerald-200/40">{playlists.length} collections</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {playlists.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => openPlaylistDetail(p)}
                    className="card-surface overflow-hidden rounded-2xl text-left transition hover:border-emerald-400/30 active:scale-[0.98]"
                    aria-label={`${p.name} playlist kholein`}
                  >
                    <div className="relative">
                      <QalbThumb
                        src={p.tracks[0]?.thumbnailUrl ?? null}
                        className="aspect-square w-full"
                        rounded="rounded-none"
                        fallbackEmoji={p.coverEmoji}
                      />
                      <span className="absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-xl bg-black/55 text-lg backdrop-blur">
                        {p.coverEmoji}
                      </span>
                      <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-emerald-100 backdrop-blur">
                        <Play className="h-2.5 w-2.5 fill-current" /> {p.tracks.length}
                      </span>
                    </div>
                    <div className="p-2.5">
                      <p className="truncate text-[13px] font-bold text-emerald-50">{p.name}</p>
                      <p className="truncate text-[10.5px] text-emerald-200/50">
                        {p.tracks.length} kalam
                        {p.description ? ` • ${p.description}` : ''}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* login nudge — feed ke end me (JioSaavn "Pro" card jaisa) */}
          {!user && (
            <button
              type="button"
              onClick={openLogin}
              className="card-surface flex w-full items-center gap-3 rounded-2xl p-4 text-left transition hover:border-gold/40"
            >
              <span className="gold-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-emerald-950 shadow-[0_0_20px_-6px_var(--glow)]">
                <LogIn className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-bold text-emerald-50">
                  Login karein — feed aap ka ho jayega
                </span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-emerald-200/50">
                  Google ya mobile number se — aap ki pasand ke kalaam roz milenge
                </span>
              </span>
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ── shared UI pieces ────────────────────────────────────────────

/** browse drill-in screens ka back header */
function BackBar({ title, sub, onBack }: { title: string; sub: string; onBack: () => void }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <button
        type="button"
        onClick={onBack}
        aria-label="Wapas jayein"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-emerald-400/15 bg-emerald-400/5 text-emerald-300 transition active:scale-95"
      >
        <ChevronDown className="h-5 w-5 rotate-90" />
      </button>
      <div className="min-w-0">
        <h1 className="truncate text-[15px] font-bold text-emerald-50">{title}</h1>
        <p className="truncate text-[10.5px] text-emerald-200/50">{sub}</p>
      </div>
    </div>
  )
}

function SectionHead({
  icon,
  title,
  sub,
  onPlay,
}: {
  icon: React.ReactNode
  title: string
  sub: string
  onPlay?: () => void
}) {
  return (
    <div className="mb-2.5 flex items-start justify-between gap-2">
      <div className="min-w-0">
        <h2 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-emerald-300/80">
          {icon} {title}
        </h2>
        <p className="truncate text-[10px] text-emerald-200/40">{sub}</p>
      </div>
      {onPlay && (
        <button
          type="button"
          onClick={onPlay}
          className="flex shrink-0 items-center gap-1 pt-1 text-[11px] font-semibold text-emerald-400 transition hover:text-emerald-300"
        >
          <Play className="h-3 w-3 fill-current" /> Sab play
        </button>
      )}
    </div>
  )
}

function RankCard({
  track,
  rank,
  queue,
  onPlay,
  gold = false,
  showViews = false,
}: {
  track: QalbTrack
  rank: number
  queue: QalbTrack[]
  onPlay: (tracks: QalbTrack[], i: number) => void
  gold?: boolean
  showViews?: boolean
}) {
  const openPicker = usePlaylistPicker((s) => s.openPicker)
  const idx = queue.findIndex((t) => t.videoId === track.videoId)
  return (
    <div
      className="card-surface w-44 shrink-0 overflow-hidden rounded-2xl transition hover:border-emerald-400/30 active:scale-[0.98]"
    >
      <button
        type="button"
        onClick={() => onPlay(queue, Math.max(0, idx))}
        className="relative block w-full"
        aria-label={`${track.title} play karein`}
      >
        <QalbThumb
          src={track.thumbnailUrl}
          className="aspect-square w-full"
          rounded="rounded-none"
        />
        <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <span
          className={`absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-extrabold backdrop-blur ${
            gold ? 'gold-gradient text-emerald-950' : 'bg-black/55 text-gold'
          }`}
        >
          {rank}
        </span>
        <span className="absolute bottom-2 right-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-400/90 text-emerald-950 shadow-lg">
          <Play className="h-5 w-5 fill-current" />
        </span>
      </button>
      <div className="flex items-start gap-1 p-2.5 pt-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-bold leading-tight text-emerald-50">
            {track.title}
          </p>
          <p className="mt-0.5 truncate text-[10.5px] text-emerald-200/50">
            {track.artist}
            {showViews && track.playCount ? (
              <span className="text-gold/80"> • {viewsLabel(track.playCount)}</span>
            ) : null}
          </p>
        </div>
        <AddBtn title={track.title} onAdd={() => openPicker(track)} />
      </div>
    </div>
  )
}

function AddBtn({ title, onAdd }: { title: string; onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-emerald-200/50 transition hover:bg-emerald-400/10 hover:text-emerald-300"
      aria-label={`${title} playlist me add karein`}
    >
      <ListPlus className="h-4 w-4" />
    </button>
  )
}

function StationButton({
  station,
  onSearch,
  onOpenFolder,
}: {
  station: StationCard
  onSearch: (q: string) => void
  onOpenFolder: (folder: QalbFolder) => void
}) {
  const folder = station.folderId ? getFolder(station.folderId) : null
  return (
    <button
      type="button"
      onClick={() => (folder ? onOpenFolder(folder) : onSearch(station.query))}
      className="group flex w-[76px] shrink-0 flex-col items-center gap-1.5"
      aria-label={`${station.name} station kholein`}
    >
      <span className="relative">
        <span
          className="flex h-[76px] w-[76px] items-center justify-center overflow-hidden rounded-full border-2 transition group-hover:border-emerald-300/60 group-active:scale-95"
          style={{ borderColor: station.personal ? 'var(--grad-gold-2)' : `${station.accent}55` }}
        >
          {station.image ? (
            <img
              src={station.image}
              alt={station.name}
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span
              className="flex h-full w-full items-center justify-center text-xl font-extrabold text-emerald-950"
              style={{ background: `linear-gradient(135deg, ${station.accent}, ${station.accent}88)` }}
            >
              {station.name.split(/\s+/).filter((w) => w.length > 1).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')}
            </span>
          )}
        </span>
        {station.personal && (
          <span className="gold-gradient absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[9px] text-emerald-950 shadow" title="Aap ki pasand">
            ★
          </span>
        )}
      </span>
      <span className="w-full text-center">
        <span className="block truncate text-[10.5px] font-semibold text-emerald-100/85">
          {station.name}
        </span>
        <span className="block truncate text-[9px] text-emerald-200/40">
          {station.listenersLabel}
        </span>
      </span>
    </button>
  )
}

/** Made For You — 2x2 mosaic card (JioSaavn "Made for your moods" style) */
function MixMosaicCard({
  mix,
  onPlay,
}: {
  mix: MixCard
  onPlay: (tracks: QalbTrack[], i: number, label?: string) => void
}) {
  const openPicker = usePlaylistPicker((s) => s.openPicker)
  const cells = [0, 1, 2, 3].map((i) => mix.thumbs[i] ?? null)
  return (
    <div className="card-surface w-60 shrink-0 overflow-hidden rounded-2xl transition hover:border-emerald-400/30 active:scale-[0.98]">
      <button
        type="button"
        onClick={() => onPlay(mix.tracks, 0, mix.title)}
        className="relative block w-full"
        aria-label={`${mix.title} play karein`}
      >
        <div className="grid aspect-square w-full grid-cols-2 grid-rows-2 gap-px bg-emerald-950/40">
          {cells.map((src, i) => (
            <div key={i} className="relative overflow-hidden bg-emerald-950" style={{ background: mix.gradient }}>
              {src ? (
                <img
                  src={src}
                  alt=""
                  className="absolute left-1/2 top-1/2 h-[133.33%] w-auto max-w-none min-w-full -translate-x-1/2 -translate-y-1/2 object-cover"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center text-2xl opacity-80">
                  {mix.emoji}
                </span>
              )}
            </div>
          ))}
        </div>
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pb-2.5 pt-8 text-left">
          <span className="block truncate text-[14px] font-extrabold text-white">{mix.title}</span>
          <span className="mt-0.5 block truncate text-[10.5px] text-emerald-100/75">{mix.subtitle}</span>
        </span>
        <span className="absolute bottom-3 right-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-400/90 text-emerald-950 shadow-lg">
          <Play className="h-5 w-5 fill-current" />
        </span>
      </button>
      <div className="flex items-center justify-between p-2.5 pt-2">
        <p className="truncate text-[10.5px] text-emerald-200/50">{mix.tracks.length} kalaam — roz badalta hai</p>
        <button
          type="button"
          onClick={() => openPicker(mix.tracks[0])}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-emerald-200/50 transition hover:bg-emerald-400/10 hover:text-emerald-300"
          aria-label={`${mix.title} ki pehli kalaam playlist me add karein`}
        >
          <ListPlus className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function MoodButton({
  mood,
  onSearch,
  onOpenFolder,
}: {
  mood: MoodCard
  onSearch: (q: string) => void
  onOpenFolder: (folder: QalbFolder) => void
}) {
  const folder = mood.folderId ? getFolder(mood.folderId) : null
  return (
    <button
      type="button"
      onClick={() => (folder ? onOpenFolder(folder) : onSearch(mood.query))}
      className="relative h-24 w-40 shrink-0 overflow-hidden rounded-2xl border border-white/5 p-3 text-left transition active:scale-[0.97]"
      style={{ background: mood.gradient }}
      aria-label={`${mood.label} folder kholein`}
    >
      <span className="absolute -bottom-3 -right-2 text-5xl opacity-25" aria-hidden="true">
        {mood.emoji}
      </span>
      <span className="block text-[15px] font-extrabold text-white">{mood.label}</span>
      <span className="mt-0.5 block truncate text-[10px] font-medium text-white/70">
        {folder ? mood.sub ?? 'LIVE • 100+ kalaam' : mood.count > 0 ? `${mood.count} kalaam` : 'Live search'}
      </span>
      <span className="absolute bottom-2.5 left-3 flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[9px] font-bold text-white backdrop-blur">
        <Play className="h-2.5 w-2.5 fill-current" /> {folder ? 'Kholein' : 'Suno'}
      </span>
    </button>
  )
}

/** JioSaavn-style inline suggestions — sections ke beech "Aur Suniye" */
function SuggestStrip({
  chips,
  onSearch,
}: {
  chips: string[]
  onSearch: (q: string) => void
}) {
  if (chips.length === 0) return null
  return (
    <section aria-label="Aur suniye">
      <div className="mb-2 flex items-center gap-1.5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-200/50">
          Aur Suniye
        </p>
        <span className="h-px flex-1 bg-emerald-400/10" />
      </div>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {chips.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onSearch(c)}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-400/15 bg-emerald-400/[0.07] px-3.5 py-2 text-[11.5px] font-semibold text-emerald-100/85 transition hover:border-emerald-400/30 hover:bg-emerald-400/15"
          >
            <Radio className="h-3.5 w-3.5 text-emerald-400/70" />
            {c}
          </button>
        ))}
      </div>
    </section>
  )
}
