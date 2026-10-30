'use client'

// Qalb — Per-User Cloud Sync (v0.4.0): "purana user wapis aaye to wahi
// playlist wapis mile" — users/{uid} doc ke `playlists` field me.
// ─────────────────────────────────────────────────────────────────
//  • MERGE (bidirectional, updatedAt newest-wins):
//      local + cloud dono ki playlists id se union → jo playlist jis
//      taraf se nayi hai wo jeet-ti hai → result local me bhi aur cloud
//      me bhi. Legacy playlists (updatedAt nahi) createdAt se backfill.
//  • Best-effort: network/rules fail → chup-chaap skip, agli baar phir
//    try hoga (login/boot/write par). App kabhi block nahi hoti.
//  • Firestore REST + Bearer idToken (ensureIdToken se auto-refresh).
//  • Generic JSON→Firestore value encoder — QalbTrack ka shape badle to
//    bhi sync tootega nahi.
//
// LOOP GUARD: sync ke dauran writeAll() push schedule nahi karti
// (syncingRef) — warna push→merge→writeAll→push infinite chalta.

import type { UserPlaylist } from '@/lib/user-playlists'
import { readAll, writeAll } from '@/lib/user-playlists'
import { ensureIdToken, useQalbAuth } from '@/lib/auth'
import { QALB } from '@/lib/qalb'
import { withNetTimeout } from '@/lib/remote-data'

const FS_BASE = () =>
  `https://firestore.googleapis.com/v1/projects/${QALB.firebaseProjectId}/databases/(default)/documents`

let syncing = false
let pushTimer: ReturnType<typeof setTimeout> | null = null

/** Local playlist badla → 2.5s debounce ke baad cloud push (login sirf) */
export function schedulePush() {
  if (syncing) return // sync ke apne writes push trigger nahi karte
  if (!useQalbAuth.getState().user) return // guest — cloud nahi
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    void syncUserPlaylists()
  }, 2_500)
}

// ── Firestore REST value codec (generic JSON ⇄ Firestore Value) ──

type FsValue = Record<string, unknown>

function jsonToFs(v: unknown): FsValue {
  if (v === null || v === undefined) return { nullValue: null }
  if (typeof v === 'string') return { stringValue: v }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number')
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  if (Array.isArray(v))
    return { arrayValue: { values: v.map(jsonToFs) } }
  const fields: Record<string, FsValue> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (val !== undefined) fields[k] = jsonToFs(val)
  }
  return { mapValue: { fields } }
}

function fsToJson(v: FsValue | undefined): unknown {
  if (!v) return null
  if ('nullValue' in v) return null
  if ('stringValue' in v) return v.stringValue
  if ('booleanValue' in v) return v.booleanValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return Number(v.doubleValue)
  if ('arrayValue' in v) {
    const vals = ((v.arrayValue as { values?: FsValue[] }).values ?? []) as FsValue[]
    return vals.map(fsToJson)
  }
  if ('mapValue' in v) {
    const fields = ((v.mapValue as { fields?: Record<string, FsValue> }).fields ?? {})
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(fields)) out[k] = fsToJson(val)
    return out
  }
  return null
}

// ── Merge (updatedAt newest-wins, id union) ─────────────────────

function backfill(p: UserPlaylist): UserPlaylist {
  return { ...p, updatedAt: p.updatedAt ?? p.createdAt ?? new Date(0).toISOString() }
}

function mergePlaylists(local: UserPlaylist[], cloud: UserPlaylist[]): UserPlaylist[] {
  const byId = new Map<string, UserPlaylist>()
  for (const p of local) {
    const b = backfill(p)
    byId.set(b.id, b)
  }
  for (const p of cloud) {
    const b = backfill(p)
    const cur = byId.get(b.id)
    if (!cur || (b.updatedAt ?? '') > (cur.updatedAt ?? '')) byId.set(b.id, b)
  }
  // naya pehle (createdAt desc) — UI jaisa hi
  return [...byId.values()].sort((a, b) =>
    (b.createdAt ?? '').localeCompare(a.createdAt ?? '')
  )
}

function encodePlaylists(list: UserPlaylist[]): FsValue {
  return jsonToFs(list) as FsValue
}

function decodePlaylists(v: FsValue | undefined): UserPlaylist[] {
  const raw = v && 'arrayValue' in v ? fsToJson(v) : null
  return Array.isArray(raw) ? (raw.filter(Boolean) as UserPlaylist[]) : []
}

// ── Main sync ───────────────────────────────────────────────────

/**
 * Pull (cloud playlists) + local merge + merged ko dono taraf likho.
 * Kabhi throw nahi karta — best-effort.
 */
export async function syncUserPlaylists(): Promise<void> {
  if (syncing) return
  const u0 = useQalbAuth.getState().user
  if (!u0) return
  syncing = true
  try {
    const u = (await ensureIdToken()) ?? u0

    // 1) PULL — users/{uid} sirf playlists field
    let cloud: UserPlaylist[] = []
    try {
      const res = await withNetTimeout(
        fetch(`${FS_BASE()}/users/${u.uid}?mask.fieldPaths=playlists`, {
          headers: { Authorization: `Bearer ${u.idToken}` },
          cache: 'no-store',
        }),
        12_000
      )
      if (res.ok) {
        const j = (await res.json()) as { fields?: Record<string, FsValue> }
        cloud = decodePlaylists(j.fields?.playlists)
      }
      // 404 = doc nahi (naya user) — cloud khali maano; 403 = rules pending — skip
    } catch {
      /* network — cloud khali maano, merge local-only hoga aur push try hoga */
    }

    // 2) MERGE
    const local = readAll()
    const merged = mergePlaylists(local, cloud)
    const changed =
      JSON.stringify(local.map((p) => [p.id, p.updatedAt ?? '', p.tracks.length]).sort()) !==
        JSON.stringify(merged.map((p) => [p.id, p.updatedAt ?? '', p.tracks.length]).sort()) ||
      JSON.stringify(cloud.map((p) => [p.id, p.updatedAt ?? '', p.tracks.length]).sort()) !==
        JSON.stringify(merged.map((p) => [p.id, p.updatedAt ?? '', p.tracks.length]).sort())

    // 3) LOCAL write (push-schedule guard ke andar — syncing=true hai)
    if (JSON.stringify(local) !== JSON.stringify(merged)) writeAll(merged)

    // 4) PUSH — merged cloud par (sirf jab kuch badla ho)
    if (changed || cloud.length === 0) {
      await withNetTimeout(
        fetch(`${FS_BASE()}/users/${u.uid}?updateMask.fieldPaths=playlists`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${u.idToken}`,
          },
          body: JSON.stringify({ fields: { playlists: encodePlaylists(merged) } }),
        }),
        15_000
      )
    }
  } catch {
    /* silent — agli baar phir sync hoga */
  } finally {
    syncing = false
  }
}
