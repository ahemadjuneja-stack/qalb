// Qalb — FAMOUS Naat Khwan / Qawwali Channel Whitelist (v0.5.43)
// ─────────────────────────────────────────────────────────────────
// User requirement: "usme sirf wahi naat aani chahiye jo famous channel
// par new launching hui ho — Urdu sirf famous naat khwan ki naat qawwali
// hi aani chahiye jo new launching hui ho."
//
// Pehle trending sirf views-count par thi — is hafte upload hui random
// channels ki videos ("2026 New Heart Touching…") bhi top par aa jati
// thin. Ab FAMOUS-FIRST ranking:
//
//   score 2 → channel/artist name khud famous hai (official launch)
//   score 1 → title me famous naat khwan ka naam hai (unrecorded kalaam)
//   score 0 → non-famous — trending me sirf fill ke liye, fresh me drop
//
// NOTE: ye NAME-based hai (title+artist) — channelId tracking nahi,
// kyunki Data API search me har video ka channelId aata hai lekin famous
// channels ke naye avatars/names bhi match hon chahiye.

import type { QalbTrack } from '@/lib/types'

/** Famous Urdu naat khwan + qawwali legends (naam-based match) */
export const FAMOUS_ARTISTS: string[] = [
  // qawwali legends
  'nusrat fateh ali khan',
  'rahat fateh ali khan',
  'amjad sabri',
  'amjad fareed sabri',
  'sabri brothers',
  'aziz mian',
  'abida parveen',
  'wadali brothers',
  'zain zohaib',
  'shahbaz qamar fareedi',
  // famous naat khwan
  'owais raza qadri',
  'hafiz ahmed raza qadri',
  'muhammad milad raza qadri',
  'milad raza qadri',
  'farhan ali qadri',
  'ghulam mustafa qadri',
  'umme habiba',
  'hooria faiz qadri',
  'syeda areeba fatima',
  'sibtain haider',
  'zohaib ashrafi',
  'junaid jamshed',
  'qari shahid mahmood',
]

/** Famous naat/qawwali production channels — nayi launches yahin hoti hain */
export const FAMOUS_CHANNELS: string[] = [
  'bukhari studio',
  'hi-tech islamic',
  'thar production',
]

// module-level compiled regexes (har call par recompile nahi)
const ARTIST_RES: Array<{ name: string; re: RegExp }> = FAMOUS_ARTISTS.map(
  (name) => ({
    name,
    re: new RegExp(`\\b${name.replace(/\s+/g, '\\s+')}\\b`, 'i'),
  })
)
const CHANNEL_RES: RegExp[] = FAMOUS_CHANNELS.map(
  (name) => new RegExp(`\\b${name.replace(/\s+/g, '\\s+')}\\b`, 'i')
)

/**
 * Track kitna "famous channel launch" hai:
 *   2 = channel/artist field khud famous (official channel upload)
 *   1 = title me famous naam (kalaam unka, channel production ka)
 *   0 = non-famous
 */
export function famousScore(t: Pick<QalbTrack, 'title' | 'artist'>): number {
  const artist = (t.artist ?? '').toLowerCase()
  const title = (t.title ?? '').toLowerCase()
  // channel/artist pehle — official launch sab se strong signal
  for (const re of CHANNEL_RES) {
    if (re.test(artist)) return 2
  }
  for (const { re } of ARTIST_RES) {
    if (re.test(artist)) return 2
  }
  for (const { re } of ARTIST_RES) {
    if (re.test(title)) return 1
  }
  return 0
}

/**
 * FAMOUS-FIRST ranking — famous launches upar (views desc),
 * non-famous neeche (sirf fill; fresh me ye filter ho hi jate hain).
 * Stable: same input → same output (feed flicker na ho).
 */
export function rankFamousFirst(tracks: QalbTrack[]): QalbTrack[] {
  return [...tracks].sort((a, b) => {
    const fa = famousScore(a)
    const fb = famousScore(b)
    if (fa !== fb) return fb - fa
    return (b.playCount ?? 0) - (a.playCount ?? 0)
  })
}

/** Sirf famous-channel/naat-khwan launches (fresh section ke liye) */
export function famousOnly(tracks: QalbTrack[]): QalbTrack[] {
  return tracks.filter((t) => famousScore(t) > 0)
}
