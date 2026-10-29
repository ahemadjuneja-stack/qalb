// Quick unit test — search-rules + result-filter logic verification
// Run: npx tsx scripts/test-search-filter.ts
import { ruleBasedValidate, queryHasIslamicIntent } from '../src/lib/search-rules'
import { filterSearchResults, isBlockedResult, hasIslamicMarker } from '../src/lib/result-filter'
import type { QalbTrack } from '../src/lib/types'

let pass = 0
let fail = 0
function expect(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) pass++
  else {
    fail++
    console.log(`✗ ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

// ── L1: query guard ──────────────────────────────────────────────
expect('bhagvan blocked', ruleBasedValidate('Bhagvan').valid, false)
expect('bhajan blocked', ruleBasedValidate('krishna bhajan').valid, false)
expect('vishnu blocked', ruleBasedValidate('who is lord vishnu').valid, false)
expect('aarti blocked', ruleBasedValidate('om jai jagdish aarti').valid, false)
expect('mandir blocked', ruleBasedValidate('mandir video').valid, false)
expect('salman khan blocked', ruleBasedValidate('salman khan songs').valid, false)
expect('bollywood blocked', ruleBasedValidate('bollywood hit songs').valid, false)
expect('dua lipa blocked', ruleBasedValidate('dua lipa songs').valid, false)
expect('mary blocked', ruleBasedValidate('mary gospel song').valid, false)
expect('gurbani blocked', ruleBasedValidate('punjabi gurbani kirtan').valid, false)

// Islamic queries pass
expect('naat valid', ruleBasedValidate('owais raza qadri naat').valid, true)
expect('qawwali valid', ruleBasedValidate('nusrat fateh ali khan qawwali').valid, true)
expect('tajdar valid', ruleBasedValidate('Tajdar-e-Haram').valid, true)

// ── L2: strict flag ──────────────────────────────────────────────
expect('salman ambiguous → strict', ruleBasedValidate('salman').strict, true)
expect('zain zohaib → strict (naam)', ruleBasedValidate('zain zohaib').strict, true)
expect('naat query → non-strict', ruleBasedValidate('owais raza qadri naat').strict, false)
expect('qawwali → non-strict', ruleBasedValidate('dama dam mast qawwali').strict, false)
expect('tajdar (haram word) → non-strict', ruleBasedValidate('tajdar-e-haram').strict, false)
expect('allah hoo → non-strict', ruleBasedValidate('allah hoo').strict, false)
expect('madina → non-strict', ruleBasedValidate('madina video').strict, false)

// ── L3: result filter — STRICT mode ──────────────────────────────
const mk = (title: string, artist: string): QalbTrack => ({
  id: `yt-${title}`, videoId: title, title, artist, category: 'SEARCH',
  thumbnailUrl: null, tags: '',
})

const salmanResults = [
  mk('The Real Salman Khan Story', 'Bollywood Biopic'),
  mk('Saiyaara | Ek Tha Tiger', 'YRF'),
  mk('Dil Diyan Gallan | Tiger Zinda Hai', 'T-Series Films'),
  mk('Salman New Naat 2025', 'Naat Studio'),
  mk('Zain Zohaib | Salam Ya Hussain', 'Naat Academy'),
]
const strictFiltered = filterSearchResults(salmanResults, true)
expect('strict: sirf naat wale bache', strictFiltered.length, 2)
expect('strict: YRF gaya', strictFiltered.some((t) => t.artist === 'YRF'), false)

// bhajans in strict
const bhajanResults = [
  mk('Bhagavān | Mahabharat Rap Song', 'Siddharth Sharma'),
  mk('Achutam Keshavam', 'Rajshri Bhakti'),
  mk('Who is Lord Vishnu?', 'Mythology Stories'),
  mk('Hey Dukh Bhanjan', 'Bhakti Sagar'),
]
expect('strict: bhajan sab gaye', filterSearchResults(bhajanResults, true).length, 0)

// ── L3: non-strict mode (Islamic-intent queries) ─────────────────
const mixedResults = [
  mk('Lam Yati Nazeeroka | Beautiful Naat', 'Islamic Video'),
  mk('Bhar Do Jholi Meri', 'Nusrat Fateh Ali Khan'),
  mk('Saiyaara | Ek Tha Tiger', 'YRF'), // film song — hard block even non-strict
  mk('Mumbai Travel Vlog', 'Traveler Channel'), // neutral — pass non-strict
]
const looseFiltered = filterSearchResults(mixedResults, false)
expect('non-strict: film song fir bhi blocked', looseFiltered.some((t) => t.artist === 'YRF'), false)
expect('non-strict: neutral pass', looseFiltered.length, 3)

// ── marker checks (Islamic content zinda rehna chahiye) ──────────
const mustPass = [
  ['Tajdar-e-Haram | Atif Aslam', 'Coke Studio'],
  ['Lam Yati Nazeeroka Fi Nazrin', 'Qari Studio'],
  ['Insha Allah Official', 'Maher Zain'],
  ['Hasbi Rabbi', 'Sami Yusuf'],
  ['Dama Dam Mast Qalandar', 'Abida Parveen'],
  ['Kalam e Iqbal', 'Naat Khawan'],
  ['Ya Rasool Allah', 'Owais Raza Qadri'],
  ['Maula Ali Shaan', 'Zain Zohaib'],
  ['Surah Rahman', 'Mishary Rashid'],
  ['99 Names of Allah', 'Islamic Channel'],
  ['Dua for parents', 'Deen TV'],
  ['Ajmer Sharif Qawwali', 'Qawwal Party'],
  ['Mehfil e Naat', 'Alhaj Chishti'],
  ['Qawwal Party Live', 'Chishti Order'],
  ['Madine ke Malik', 'Hafiz Ahmed Raza'],
  ['Ramzan Special Naat', 'Islamic Studio'],
]
for (const [title, artist] of mustPass) {
  const t = `${title} ${artist}`.toLowerCase()
  expect(`marker: ${title}`, isBlockedResult(t), false)
  expect(`islamic: ${title}`, hasIslamicMarker(t), true)
}

// hard-block samples (kabhi pass nahi hone chahiye)
const mustBlock = [
  ['Achutam Keshavam', 'Rajshri Bhakti'],
  ['Bhagavān Mahabharat Rap', 'Sid Sharma'],
  ['Om Namah Shivaya', 'Temple Records'],
  ['Jesus Loves Me', 'Gospel Music'],
  ['Waheguru Simran', 'Gurbani Kirtan'],
  ['Saiyaara | Ek Tha Tiger', 'YRF'],
  ['Dua Lipa - Levitating', 'Dua Lipa'],
  ['Allah Duhai Hai | Race 2', 'T-Series Films'],
  ['Tiger Zinda Hai Trailer', 'YRF'],
  ['Nora Fatehi Dance', 'Sony Music India'],
  ['Salman Khan Funny Moments', 'Comedy Channel'],
]
for (const [title, artist] of mustBlock) {
  const t = `${title} ${artist}`.toLowerCase()
  expect(`block: ${title}`, isBlockedResult(t), true)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail > 0 ? 1 : 0)
