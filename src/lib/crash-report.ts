'use client'

// Qalb — Crash Reporter (Layer 2: visibility)
// ─────────────────────────────────────────────────────────────────
// Play Store console nahi hai → crashes hamare paas aane chahiye.
// window.onerror + unhandledrejection + React render errors →
// Firestore REST `crashLogs` collection me best-effort write.
//
// IMPORTANT: reporter khud KABHI crash/throw nahi karega —
// poora chain try/catch me, fire-and-forget, koi await nahi.

import { QALB } from '@/lib/qalb'
import { APP_BUILD } from '@/lib/app-build'

export type CrashKind = 'js-error' | 'js-rejection' | 'render' | 'native' | 'manual'

// per-session throttle state (module scope — memory only, koi persistence nahi)
let sessionId = ''
let lastReportAt = 0
let sessionCount = 0
const seen = new Set<string>()

const MAX_REPORTS_PER_SESSION = 5
const MIN_GAP_MS = 10_000

function s(v: string): Record<string, string> {
  return { stringValue: v }
}

function safeId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  } catch {
    /* fallthrough */
  }
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Crash report Firestore `crashLogs` me likho.
 * Rules (user manually publish karega):
 *   match /crashLogs/{doc} { allow create: if true; allow read: if true; }
 * Dedupe: same kind+message session me 1 dafa hi jata hai.
 */
export async function reportCrash(
  kind: CrashKind,
  message: string,
  stack?: string | null,
  extra?: Record<string, unknown>,
): Promise<void> {
  try {
    if (typeof window === 'undefined') return
    const now = Date.now()
    if (sessionCount >= MAX_REPORTS_PER_SESSION) return
    if (now - lastReportAt < MIN_GAP_MS) return
    const key = `${kind}::${String(message ?? '').slice(0, 120)}`
    if (seen.has(key)) return

    seen.add(key)
    lastReportAt = now
    sessionCount += 1
    if (!sessionId) sessionId = safeId()

    const fields: Record<string, unknown> = {
      kind: s(kind),
      message: s(String(message ?? 'unknown').slice(0, 1200)),
      stack: s(String(stack ?? '').slice(0, 6000)),
      versionCode: { integerValue: String(APP_BUILD.versionCode) },
      versionName: s(APP_BUILD.versionName),
      userAgent: s(String(navigator.userAgent ?? '').slice(0, 300)),
      language: s(String(navigator.language ?? '')),
      sessionId: s(sessionId),
      page: s(String(window.location.pathname ?? '').slice(0, 200)),
      ts: s(new Date().toISOString()),
      extra: s(extra ? JSON.stringify(extra).slice(0, 2000) : ''),
    }

    const url =
      `https://firestore.googleapis.com/v1/projects/${QALB.firebaseProjectId}` +
      `/databases/(default)/documents/crashLogs`

    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
      // crash report ko koi long timeout nahi chahiye — fail silently
      signal: AbortSignal.timeout(6000),
    })
  } catch {
    /* reporting kabhi app tod nahi sakti */
  }
}

/** Global handlers — shell mount pe 1 dafa install hota hai */
export function installCrashReporter(): void {
  if (typeof window === 'undefined') return
  const w = window as unknown as { __qalbCrashInstalled?: boolean }
  if (w.__qalbCrashInstalled) return
  w.__qalbCrashInstalled = true

  window.addEventListener('error', (ev) => {
    try {
      const msg = ev?.message || 'Script error'
      const err = ev?.error as Error | undefined
      const stack =
        err?.stack || `${ev?.filename ?? 'unknown'}:${ev?.lineno ?? '?'}:${ev?.colno ?? '?'}`
      void reportCrash('js-error', msg, stack)
    } catch {
      /* ignore */
    }
  })

  window.addEventListener('unhandledrejection', (ev) => {
    try {
      const reason = (ev as PromiseRejectionEvent)?.reason
      // network aborts/timeout = noise, crash nahi
      if (reason instanceof DOMException && (reason.name === 'AbortError' || reason.name === 'TimeoutError'))
        return
      if (reason instanceof Error) {
        void reportCrash('js-rejection', reason.message || String(reason), reason.stack)
      } else if (typeof reason === 'string' && reason) {
        void reportCrash('js-rejection', reason, null)
      }
    } catch {
      /* ignore */
    }
  })
}
