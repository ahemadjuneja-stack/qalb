// Quick unit test — personalized curated playlists logic verification
// Run: npx tsx scripts/test-personalized-playlists.ts
import { personalizePlaylists, hashStr } from '../src/lib/personalized-playlists'
import { CURATED_PLAYLISTS } from '../src/lib/curated-playlists'
import type { QalbPlaylist } from '../src/lib/types'

let pass = 0
let fail = 0
function expect(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) pass++
  else {
    fail++
    console.log(`  ✗ ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

// ── 1. hashStr determinism ──
expect('hashStr stable', hashStr('user-A') === hashStr('user-A'), true)
expect('hashStr differs', hashStr('user-A') !== hashStr('user-B'), true)

// ── 2. Empty taste (no plays) → base as-is ──
const base: QalbPlaylist[] = CURATED_PLAYLISTS
const out0 = personalizePlaylists(base, null, null)
expect('taste-empty → same count', out0.length, base.length)
expect(
  'taste-empty → same order',
  out0.map((p) => p.id).join(','),
  base.map((p) => p.id).join(',')
)

// ── 3. Simulated taste: user-A loves Nusrat/QAWWALI, user-B loves Maher/NASHEED ──
// (taste profile localStorage mock — getTasteProfile reads window.localStorage)
function mockStorage(uid: string | null, events: Array<{ v: string; a: string; c: string; t: number }>) {
  // shared store — har call purana data NAHI mitata (do users co-exist)
  const g = globalThis as { window?: { localStorage?: unknown } }
  if (!g.window || !(g.window as { __store?: Map<string, string> }).__store) {
    const store = new Map<string, string>()
    g.window = Object.assign(g.window ?? {}, {
      __store: store,
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    })
  }
  const store = (g.window as { __store: Map<string, string> }).__store
  const key = uid ? `qalb_play_events_v1__${uid}` : 'qalb_play_events_v1'
  store.set(key, JSON.stringify(events))
}

const now = Date.now()
// user-A: 12 plays — Nusrat Fateh Ali Khan qawwaliyan
mockStorage('user-A', Array.from({ length: 12 }, (_, i) => ({
  v: `va${i}`, a: 'Nusrat Fateh Ali Khan', c: 'QAWWALI', t: now - i * 3600_000,
})))
// user-B: 12 plays — Maher Zain nasheed
mockStorage('user-B', Array.from({ length: 12 }, (_, i) => ({
  v: `vb${i}`, a: 'Maher Zain', c: 'NASHEED', t: now - i * 3600_000,
})))

const outA1 = personalizePlaylists(base, 'user-A', null)
const outA2 = personalizePlaylists(base, 'user-A', null)
const outB = personalizePlaylists(base, 'user-B', null)

// personal mixes exist and come first
expect('user-A: personal mixes banay', outA1[0]?.personal === true, true)
expect('user-A: personal count', outA1.filter((p) => p.personal).length >= 2, true)
expect('user-A: top mix naam', /Nusrat/.test(outA1[0]?.name ?? ''), true)
expect('user-B: top mix naam', /Maher|Nasheed/.test(outB[0]?.name ?? ''), true)
expect('user-A ≠ user-B top playlist', outA1[0]?.id !== outB[0]?.id, true)

// determinism: same user same din → same result
expect(
  'user-A deterministic',
  outA1.map((p) => p.id + ':' + p.tracks.map((t) => t.videoId).join('|')).join(';;'),
  outA2.map((p) => p.id + ':' + p.tracks.map((t) => t.videoId).join('|')).join(';;')
)

// re-rank: user-A ko qawwali playlist upar milni chahiye (personal mixes
// sab se upar hote hain, isliye sirf non-personal playlists ki ranking dekhein)
const nonPersonalA = outA1.filter((p) => !p.personal)
const qawPosA = nonPersonalA.findIndex((p) => p.slug === 'sufi-qawwali')
const qawPosBase = base.findIndex((p) => p.slug === 'sufi-qawwali')
expect('user-A: qawwali playlist re-ranked UP', qawPosA < qawPosBase, true)

// tracks inside a base playlist reorder (order diff vs base, same set)
const naatBase = base.find((p) => p.slug === 'naat-sharif')!
const naatA = outA1.find((p) => p.slug === 'naat-sharif')!
expect(
  'same track set after reorder',
  [...naatA.tracks].sort((x, y) => x.videoId.localeCompare(y.videoId)).map((t) => t.videoId).join(','),
  [...naatBase.tracks].sort((x, y) => x.videoId.localeCompare(y.videoId)).map((t) => t.videoId).join(',')
)

// personal mixes me kam se kam 4 tracks
expect('personal mix bharri hui', (outA1[0]?.tracks.length ?? 0) >= 4, true)

// ── 4. Firestore playlists (admin) bhi personalize hoti hain ──
const fsPl: QalbPlaylist[] = [{
  id: 'fs-1', slug: 'admin-pick', name: 'Admin Pick', description: null,
  coverEmoji: '🕌', accentColor: '#10B981', tracks: base[0].tracks.slice(0, 6),
}]
const outFS = personalizePlaylists(fsPl, 'user-A', null)
expect('firestore playlist preserved', outFS.some((p) => p.id === 'fs-1'), true)
expect('firestore + personal mixes', outFS.length > fsPl.length, true)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail > 0 ? 1 : 0)
