'use client'

// Qalb — Store Tab: Islamic product catalog + category filters + Order on WhatsApp

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Star, MessageCircle, PackageX, BadgePercent } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { fetchProductsSmart } from '@/lib/remote-data'
import { STORE_CATEGORIES, QALB } from '@/lib/qalb'
import type { QalbProduct } from '@/lib/types'

function inr(n: number): string {
  return `₹ ${n.toLocaleString('en-IN')}`
}

export function StoreView() {
  const [products, setProducts] = useState<QalbProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState<string>('ALL')
  const { toast } = useToast()

  useEffect(() => {
    // hosted API pehle, APK me Firestore REST fallback (remote-data.ts)
    fetchProductsSmart()
      .then((p) => setProducts(p))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(
    () => (category === 'ALL' ? products : products.filter((p) => p.category === category)),
    [products, category]
  )

  const featured = useMemo(() => products.filter((p) => p.featured), [products])

  function orderOnWhatsapp(product: QalbProduct) {
    const msg = `Assalam-o-Alaikum! 🕌\nMujhe *${product.name}* (${inr(product.price)}) order karna hai — Qalb Store se.`
    const url = `https://wa.me/${QALB.whatsappNumber}?text=${encodeURIComponent(msg)}`
    window.open(url, '_blank', 'noopener')
    toast({
      title: 'WhatsApp khul raha hai 📦',
      description: `${product.name} ka order message ready hai.`,
    })
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-emerald-400" />
      </div>
    )
  }

  return (
    <div className="space-y-5 px-4 pb-8 pt-5">
      {/* header */}
      <header>
        <h1 className="text-xl font-extrabold text-emerald-50">Islamic Store 🛍️</h1>
        <p className="text-xs text-emerald-200/50">Attar, tasbeeh, jaanamaz aur bhi — WhatsApp pe order karein</p>
      </header>

      {/* featured banner */}
      {featured.length > 0 && category === 'ALL' && (
        <section aria-label="Featured products">
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {featured.map((p) => (
              <div
                key={p.id}
                className={`card-surface relative w-56 shrink-0 overflow-hidden rounded-2xl`}
              >
                <div className={`flex h-24 items-center justify-center bg-gradient-to-br text-5xl ${p.gradient}`}>
                  {p.emoji}
                  {p.originalPrice && (
                    <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-[#d4a937] px-2 py-0.5 text-[10px] font-extrabold text-emerald-950">
                      <BadgePercent className="h-3 w-3" />
                      {Math.round((1 - p.price / p.originalPrice) * 100)}% OFF
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <p className="truncate text-[13px] font-bold text-emerald-50">{p.name}</p>
                  <p className="mt-0.5 text-[11px] font-bold text-emerald-400">{inr(p.price)}</p>
                  <button
                    type="button"
                    onClick={() => orderOnWhatsapp(p)}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#25D366] py-2 text-[11.5px] font-bold text-emerald-950 transition hover:brightness-110 active:scale-[0.98]"
                  >
                    <MessageCircle className="h-3.5 w-3.5 fill-current" /> Order on WhatsApp
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* category chips */}
      <section aria-label="Categories">
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {STORE_CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setCategory(c.key)}
              className={`shrink-0 rounded-full px-3.5 py-2 text-[12px] font-semibold transition ${
                category === c.key
                  ? 'emerald-gradient text-emerald-950 shadow-[0_0_16px_-4px_rgba(16,185,129,0.6)]'
                  : 'border border-emerald-400/15 bg-emerald-400/5 text-emerald-200/70 hover:border-emerald-400/30'
              }`}
              aria-pressed={category === c.key}
            >
              {c.emoji} {c.label}
            </button>
          ))}
        </div>
      </section>

      {/* product grid */}
      <section aria-label="Products">
        {filtered.length === 0 ? (
          <div className="card-surface flex flex-col items-center gap-2 rounded-2xl p-8 text-center">
            <PackageX className="h-8 w-8 text-emerald-200/40" />
            <p className="text-sm text-emerald-200/60">Is category me products nahi hain.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((p) => (
              <article key={p.id} className="card-surface flex flex-col overflow-hidden rounded-2xl">
                <div className={`relative flex h-28 items-center justify-center bg-gradient-to-br text-5xl ${p.gradient}`}>
                  {p.emoji}
                  {!p.inStock && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-[11px] font-bold uppercase tracking-widest text-red-300">
                      Out of stock
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-3">
                  <h3 className="line-clamp-2 text-[12.5px] font-bold leading-snug text-emerald-50">
                    {p.name}
                  </h3>
                  <p className="mt-1 line-clamp-2 flex-1 text-[10.5px] leading-snug text-emerald-200/50">
                    {p.description}
                  </p>
                  <div className="mt-1.5 flex items-center gap-1 text-[10.5px] text-[#d4a937]">
                    <Star className="h-3 w-3 fill-current" />
                    <span className="font-bold">{p.rating}</span>
                    <span className="text-emerald-200/35">({p.reviews})</span>
                  </div>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-[13px] font-extrabold text-emerald-400">{inr(p.price)}</span>
                    {p.originalPrice && (
                      <span className="text-[10.5px] text-emerald-200/35 line-through">
                        {inr(p.originalPrice)}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => orderOnWhatsapp(p)}
                    disabled={!p.inStock}
                    className="mt-2 flex items-center justify-center gap-1.5 rounded-xl bg-[#25D366] py-2 text-[11.5px] font-bold text-emerald-950 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
                  >
                    <MessageCircle className="h-3.5 w-3.5 fill-current" /> Order
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
