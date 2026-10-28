// Qalb — POST /api/search
// User query ko AI Guardian se validate + refine karta hai.

import { NextResponse } from 'next/server'
import { validateSearchQuery } from '@/lib/search-validator'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const query = typeof body.query === 'string' ? body.query : ''
    if (!query.trim()) {
      return NextResponse.json(
        { valid: false, reason: 'Khaali search query.', refinedQuery: null, category: null },
        { status: 400 }
      )
    }
    const result = await validateSearchQuery(query)
    return NextResponse.json(result)
  } catch (e) {
    console.error('[api/search] error:', e)
    return NextResponse.json(
      { valid: false, reason: 'Search service me masla hua — dobara koshish karein.', refinedQuery: null, category: null },
      { status: 500 }
    )
  }
}
