// Qalb — In-memory response cache (TTL-based, server-side)
// Design per spec: "local response caching" for AI + YouTube search responses.

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

const store = new Map<string, CacheEntry<unknown>>()

export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    store.delete(key)
    return null
  }
  return entry.value as T
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  // rudimentary size guard
  if (store.size > 500) {
    const oldest = store.keys().next().value
    if (oldest) store.delete(oldest)
  }
  store.set(key, { value, expiresAt: Date.now() + ttlMs })
}

export function cacheKey(parts: (string | number | boolean | null | undefined)[]): string {
  return parts.map((p) => String(p ?? '').trim().toLowerCase()).join('::')
}
