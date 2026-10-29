// Qalb — Step 2: Smart Search Filter Service
// Strict content-guardian validation: sirf authentic Islamic devotional content
// (Naat, Hamd, Sufi Qawwali, Nasheed) allow hota hai; Bollywood/pop strictly block.
//
// Provider chain:
//   1. Google AI Studio — Gemini Flash (GEMINI_API_KEY / GOOGLE_AI_API_KEY set ho to)
//   2. z-ai-web-dev-sdk LLM (sandbox default)
//   3. Rule-based keyword guard (offline fallback)
// Results 24h in-memory cache me save hote hain.

import type { SearchValidationResult } from '@/lib/types'
import { cacheGet, cacheSet, cacheKey } from '@/lib/search-cache'
import { ruleBasedValidate } from '@/lib/search-rules'

// Rule-based guardian ab shared client-safe module (search-rules.ts) me hai —
// wahi logic APK me bhi offline fallback ke liye use hota hai.

const CACHE_TTL = 24 * 60 * 60 * 1000 // 24h

export const CONTENT_GUARDIAN_SYSTEM_PROMPT = `You are "Qalb Guardian", the strict content moderation engine of an Islamic devotional media app named Qalb.

YOUR ONLY JOB: Decide whether a user's search query is intended for authentic ISLAMIC DEVOTIONAL AUDIO content, and if so, refine it for the best YouTube search.

ALLOWED categories:
- NAAT: praise poetry of Prophet Muhammad (peace be upon him). e.g. "Tajdar-e-Haram", "Lam Yati Nazeeroka", naats by Owais Raza Qadri, Atif Aslam naat, Coke Studio naats/hamd/qawwali.
- HAMD: praise of Allah. e.g. "Allah Hoo", "Hamd" by Nusrat Fateh Ali Khan.
- QAWWALI: Sufi devotional qawwali. e.g. Nusrat Fateh Ali Khan, Sabri Brothers, Amjad Sabri, qawwalis like "Bhar Do Jholi", "Tum Ek Gorakh Dhanda Ho", "Dama Dam Mast Qalandar".
- NASHEED: Islamic devotional songs. e.g. Maher Zain, Sami Yusuf, Zain Bhikha, Ahmed Bukhatir, Mesut Kurtis.

STRICTLY BLOCKED (valid=false):
- Bollywood / Lollywood movie songs, filmi music, any film soundtrack
- Pop, rock, rap, hip-hop, EDM, remix, mashup, DJ, dance, party music
- Romantic/love songs, sad songs, breakup songs (secular music)
- Podcasts, talk shows, lectures, dramas, trailers, comedy
- Any content hostile to Islam or generally non-devotional music
- Secular songs by Islamic artists (e.g. Maher Zain pop collabs, Atif Aslam Bollywood hits like "Tera Hone Laga Hoon" — block those; but his naats are allowed)

REFINEMENT RULES (when valid):
- Keep artist names and core kalam/title words.
- Add genre words like "naat", "qawwali", "hamd", "nasheed", "official", "full" where natural.
- Remove noise words (like "gaana", "song", "play", "video", "lao", "chalao", "hd", "mp3").
- The refined query MUST be a clean YouTube search string.

RESPONSE FORMAT — respond with MINIFIED JSON only, no markdown, no explanation outside JSON:
{"valid":<true|false>,"category":"NAAT"|"HAMD"|"QAWWALI"|"NASHEED"|null,"refinedQuery":"<string or null>","reason":"<one short sentence, Roman Urdu>"}`

interface GuardianJson {
  valid?: boolean
  category?: string | null
  refinedQuery?: string | null
  reason?: string
}

// ── Provider 1: Gemini Flash (Google AI Studio) ──────────────────

async function geminiValidate(query: string): Promise<SearchValidationResult | null> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY
  if (!apiKey) return null

  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash'
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: CONTENT_GUARDIAN_SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: `SEARCH QUERY: "${query}"` }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 256, responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(8000),
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) return null
    const parsed = JSON.parse(text) as GuardianJson
    return {
      valid: Boolean(parsed.valid),
      category: (parsed.category as SearchValidationResult['category']) ?? null,
      refinedQuery: parsed.valid ? parsed.refinedQuery ?? query : null,
      reason: parsed.reason || 'Content verified.',
      provider: 'gemini',
    }
  } catch {
    return null
  }
}

// ── Provider 2: z-ai-web-dev-sdk (server-only) ───────────────────

async function zaiValidate(query: string): Promise<SearchValidationResult | null> {
  try {
    const { default: ZAI } = await import('z-ai-web-dev-sdk')
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: CONTENT_GUARDIAN_SYSTEM_PROMPT },
        { role: 'user', content: `SEARCH QUERY: "${query}"` },
      ],
      thinking: { type: 'disabled' },
    })
    const text = completion.choices[0]?.message?.content
    if (!text) return null
    // JSON extract (agar model ne extra text daal diya ho)
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0]) as GuardianJson
    return {
      valid: Boolean(parsed.valid),
      category: (parsed.category as SearchValidationResult['category']) ?? null,
      refinedQuery: parsed.valid ? parsed.refinedQuery ?? query : null,
      reason: parsed.reason || 'Content verified.',
      provider: 'zai',
    }
  } catch {
    return null
  }
}

// ── Public API ───────────────────────────────────────────────────

export async function validateSearchQuery(rawQuery: string): Promise<SearchValidationResult> {
  const query = rawQuery.trim().slice(0, 200)
  if (!query) {
    return {
      valid: false,
      category: null,
      refinedQuery: null,
      reason: 'Khaali search query.',
      provider: 'rules',
    }
  }

  const key = cacheKey(['guardian', query])
  const cached = cacheGet<SearchValidationResult>(key)
  if (cached) return { ...cached, provider: 'cache' }

  // Provider chain — pehla successful result final hai
  let result: SearchValidationResult | null = null
  try {
    result = await geminiValidate(query)
  } catch {
    /* fall through */
  }
  if (!result) {
    try {
      result = await zaiValidate(query)
    } catch {
      /* fall through */
    }
  }
  if (!result) result = ruleBasedValidate(query)

  cacheSet(key, result, CACHE_TTL)
  return result
}
