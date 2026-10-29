// Qalb — Rule-based content guardian (CLIENT-SAFE)
// Yeh module sirf pure logic hai — koi server-only import nahi (no env, no SDK).
// APK (static export) aur server dono jagah use hota hai.
//
// USER RULE (v0.2.1-22): sirf NON-ISLAMIC SONGS filter karne hain —
// Bollywood/film/pop/romantic music block, baaki SAB allow (sufi qawwali,
// naat, hamd, artist ke naam — "Zain Zohaib" jaise searches bhi).
//
// Isliye ab:
//   1) sirf blocked-marker check hota hai (word-boundary regex — substring
//      nahi, warna "pyare nabi" me "pyar" aur "jannat" me "nat" match ho jata)
//   2) blocked marker na mile to query VALID — koi "clear nahi hai" gate nahi
//      (pehle artist-name searches is gate se block ho jati thi)

import type { SearchValidationResult } from '@/lib/types'

// Sirf clear non-Islamic music markers (word-boundary match)
export const BLOCKED_TERMS = [
  'bollywood', 'lollywood', 'movie', 'film', 'filmi',
  'pop', 'rock', 'rap', 'hip hop', 'hiphop', 'edm', 'dj', 'remix', 'mashup',
  'dance', 'party', 'club', 'gaana',
  'love song', 'sad song', 'breakup', 'romantic',
  'trailer', 'comedy', 'podcast', 'interview',
  'actor', 'actress',
  'salman khan', 'shahrukh', 'sharukh', 'shah rukh', 'srk',
  'priyanka', 'deepika', 'alia bhatt', 'ranbir',
]

// Category sirf UI/badge ke liye — blocking isse decide nahi hoti
function detectCategory(q: string): SearchValidationResult['category'] {
  if (/qaww?ali|kaww?ali|qwal|sufi/.test(q)) return 'QAWWALI'
  if (/\bnaats?\b|\bnoha\b|\bmanqabat\b|\bhamd|\bhumd\b|\bnasheed|\bnashid\b/.test(q)) {
    return /\bnaats?\b|\bnoha\b|\bmanqabat\b/.test(q) ? 'NAAT' : 'HAMD'
  }
  if (/\bnasheed|\bnashid|\bdarood|\bdurood|\bsalam\b/.test(q)) return 'NASHEED'
  if (/madina|madinah|makkah|allah|\brab\b|\brabbi/.test(q)) return 'HAMD'
  return null
}

export function ruleBasedValidate(query: string): SearchValidationResult {
  const q = query.toLowerCase().trim()

  for (const term of BLOCKED_TERMS) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`\\b${escaped}\\b`).test(q)) {
      return {
        valid: false,
        category: null,
        refinedQuery: null,
        reason: `Yeh query "${term}" se related lagti hai — Qalb sirf paak kalaam allow karta hai.`,
        provider: 'rules',
      }
    }
  }

  // Koi non-Islamic song marker nahi mila → ALLOW.
  // User ka exact query YouTube ko jata hai (koi word force-append nahi —
  // pehle category word append hota tha jo results kharab karta tha).
  return {
    valid: true,
    category: detectCategory(q),
    refinedQuery: query.trim(),
    reason: 'Paak kalaam search — allowed.',
    provider: 'rules',
  }
}
