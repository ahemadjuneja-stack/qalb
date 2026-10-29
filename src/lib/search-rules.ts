// Qalb — Rule-based content guardian (CLIENT-SAFE)
// Yeh module sirf pure logic hai — koi server-only import nahi (no env, no SDK).
// APK (static export) aur server dono jagah use hota hai.

import type { SearchValidationResult } from '@/lib/types'

export const BLOCKED_TERMS = [
  'bollywood', 'lollywood', 'movie', 'film', 'filmi', 'picture',
  'pop', 'rock', 'rap', 'hip hop', 'hiphop', 'edm', 'dj', 'remix', 'mashup',
  'dance', 'party', 'club', 'masti', 'nach', 'gaana.com',
  'love song', 'sad song', 'breakup', 'romantic', 'pyar', 'ishq masiha',
  'trailer', 'drama', 'comedy', 'podcast', 'interview', 'news',
  'actor', 'actress', 'hero', 'heroine', 'salman', 'shahrukh', 'sharukh',
  'aamir khan movie', 'priyanka', 'deepika', 'alia', 'ranbir', 'srk',
]

export const ALLOWED_TERMS = [
  'naat', 'nat', 'hamd', 'humd', 'qawwali', 'qawali', 'kawali', 'nasheed', 'nashid',
  'sufi', 'kalam', 'kalame', 'noha', 'salam', 'darood', 'durood', 'manqabat',
  'allah', 'rabbi', 'rab', 'makkah', 'madina', 'madinah', 'haram', 'hussain', 'imam',
  'qalandar', 'khawaja', 'gharib nawaz', 'data', 'mast qalandar',
  'maher zain', 'sami yusuf', 'nusrat', 'sabri brothers', 'amjad sabri', 'owais raza',
  'atif aslam naat', 'tajdar', 'tajdar-e-haram', 'junaid jamshed', 'qari', 'khursheed',
  'hasbi rabbi', 'insha allah', 'inshaallah', 'mustt mustt', 'gorakh dhanda', 'ali da malang',
  'bhar do jholi', 'ya nabi', 'muhammad ka', 'zaheer ahmad', 'hafiz tahir qureshi',
]

export function ruleBasedValidate(query: string): SearchValidationResult {
  const q = query.toLowerCase()

  for (const term of BLOCKED_TERMS) {
    if (q.includes(term)) {
      return {
        valid: false,
        category: null,
        refinedQuery: null,
        reason: `Yeh query "${term}" se related lagti hai — Qalb sirf paak kalaam allow karta hai.`,
        provider: 'rules',
      }
    }
  }

  for (const term of ALLOWED_TERMS) {
    if (q.includes(term)) {
      const category = q.includes('qawwali') || q.includes('qawali')
        ? 'QAWWALI'
        : q.includes('naat') || q.includes('nat ')
          ? 'NAAT'
          : q.includes('hamd') || q.includes('humd') || q.includes('allah')
            ? 'HAMD'
            : 'NASHEED'
      return {
        valid: true,
        category,
        refinedQuery: `${query.trim()} ${category.toLowerCase()}`.replace(/\s+/g, ' '),
        reason: 'Keyword rules se validate hua.',
        provider: 'rules',
      }
    }
  }

  return {
    valid: false,
    category: null,
    refinedQuery: null,
    reason: 'Query clear nahi hai — naat, hamd, qawwali ya nasheed ka naam likhein.',
    provider: 'rules',
  }
}
