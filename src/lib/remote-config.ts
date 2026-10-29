'use client'

// Qalb — Remote Config (Layer 5: server-side kill switch)
// ─────────────────────────────────────────────────────────────────
// Firestore doc `remoteConfig/app` se app KHUD ko control karti hai:
//   - minVersionCode   → isse purana version chal hi nahi sakta
//                        (Force Update screen, bypass impossible)
//   - killSwitch       → maintenance screen (catastrophe me)
//   - disabledFeatures → crash karne wala feature turant OFF
//                        (e.g. ["player","calendar"]) — APK update
//                        ke bina hi sab users me band
//
// Last-good config localStorage me cache — network mara ho to bhi
// purani config 7 din tak kaam karti hai. Doc missing = defaults.
//
// User Firestore me ye doc khud banayega (console se):
//   collection: remoteConfig, doc id: app
//   fields: minVersionCode (number), killSwitch (boolean),
//           maintenanceMessage (string), disabledFeatures (array),
//           notice (string), noticeActive (boolean)
// Rule: match /remoteConfig/{doc} { allow read: if true; }

import { create } from 'zustand'
import { QALB } from '@/lib/qalb'

export interface QalbRemoteConfig {
  minVersionCode: number
  killSwitch: boolean
  maintenanceMessage: string
  disabledFeatures: string[]
  notice: string | null
  noticeActive: boolean
}

export const DEFAULT_REMOTE_CONFIG: QalbRemoteConfig = {
  minVersionCode: 0,
  killSwitch: false,
  maintenanceMessage:
    'Qalb thodi der ke liye band hai — hum isse behtar bana rahe hain. Zara der baad app khol ke "Phir se try karein" dabaein.',
  disabledFeatures: [],
  notice: null,
  noticeActive: false,
}

const CACHE_KEY = 'qalb_remote_config'
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 8000

// ── cache (last good config survives network failures) ────────────

function loadCachedConfig(): QalbRemoteConfig {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return DEFAULT_REMOTE_CONFIG
    const parsed = JSON.parse(raw) as { cfg?: QalbRemoteConfig; ts?: number }
    if (!parsed?.cfg || typeof parsed.ts !== 'number') return DEFAULT_REMOTE_CONFIG
    if (Date.now() - parsed.ts > CACHE_MAX_AGE_MS) return DEFAULT_REMOTE_CONFIG
    return normalizeConfig(parsed.cfg)
  } catch {
    return DEFAULT_REMOTE_CONFIG
  }
}

function cacheConfig(cfg: QalbRemoteConfig): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ cfg, ts: Date.now() }))
  } catch {
    /* ignore */
  }
}

export function normalizeConfig(d: Partial<QalbRemoteConfig> | Record<string, unknown>): QalbRemoteConfig {
  const features = Array.isArray(d.disabledFeatures)
    ? (d.disabledFeatures as unknown[]).map(String)
    : []
  return {
    minVersionCode: Number(d.minVersionCode ?? 0) || 0,
    killSwitch: Boolean(d.killSwitch),
    maintenanceMessage:
      typeof d.maintenanceMessage === 'string' && d.maintenanceMessage
        ? d.maintenanceMessage
        : DEFAULT_REMOTE_CONFIG.maintenanceMessage,
    disabledFeatures: features,
    notice: typeof d.notice === 'string' && d.notice ? d.notice : null,
    noticeActive: Boolean(d.noticeActive),
  }
}

// ── Firestore REST fetch (single doc) ─────────────────────────────

interface FSDoc {
  fields?: Record<string, Record<string, unknown>>
}

function unwrap(v: Record<string, unknown> | undefined): unknown {
  if (!v) return null
  if ('stringValue' in v) return v.stringValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return Number(v.doubleValue)
  if ('booleanValue' in v) return v.booleanValue
  if ('arrayValue' in v) {
    const vals = (v.arrayValue as { values?: Record<string, unknown>[] }).values ?? []
    return vals.map((x) => unwrap(x))
  }
  return null
}

async function fetchRemoteConfig(): Promise<QalbRemoteConfig | null> {
  try {
    const url =
      `https://firestore.googleapis.com/v1/projects/${QALB.firebaseProjectId}` +
      `/databases/(default)/documents/remoteConfig/app`
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (res.status === 404) return DEFAULT_REMOTE_CONFIG // doc abhi nahi bana — defaults
    if (!res.ok) return null
    const doc = (await res.json()) as FSDoc
    const flat = Object.fromEntries(
      Object.entries(doc.fields ?? {}).map(([k, v]) => [k, unwrap(v)]),
    )
    return normalizeConfig(flat)
  } catch {
    return null // network fail → caller cached/default use karega
  }
}

// ── store ─────────────────────────────────────────────────────────

interface RemoteConfigState {
  config: QalbRemoteConfig
  loaded: boolean
  refresh: () => Promise<void>
}

export const useRemoteConfig = create<RemoteConfigState>((set) => ({
  config: typeof window === 'undefined' ? DEFAULT_REMOTE_CONFIG : loadCachedConfig(),
  loaded: false,
  refresh: async () => {
    const cfg = await fetchRemoteConfig()
    if (cfg) {
      cacheConfig(cfg)
      set({ config: cfg, loaded: true })
    } else {
      set({ loaded: true }) // network fail — cached/default chalta rahega
    }
  },
}))

/** Force-update chahiye? (remote minVersionCode > is build ka versionCode) */
export function needsForceUpdate(cfg: QalbRemoteConfig): boolean {
  return cfg.minVersionCode > QALB.currentVersionCode
}
