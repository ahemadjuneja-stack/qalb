// Qalb — GET /api/products?category=ATTAR
// Islamic Store product catalog (Firestore products collection ka local mirror).

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category')?.toUpperCase()

    const products = await db.product.findMany({
      where: category && category !== 'ALL' ? { category } : {},
      orderBy: [{ featured: 'desc' }, { rating: 'desc' }],
    })

    return NextResponse.json({ products })
  } catch (e) {
    console.error('[api/products] error:', e)
    return NextResponse.json({ products: [], error: 'Store load nahi hua' }, { status: 500 })
  }
}
