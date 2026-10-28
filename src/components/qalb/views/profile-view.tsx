'use client'

// Qalb — Profile Tab: user settings, downloads, app update (Step 5 hook), about

import { useEffect, useState } from 'react'
import {
  Pencil,
  Download,
  Trash2,
  RefreshCw,
  CloudDownload,
  MapPin,
  Info,
  BadgeCheck,
  Smartphone,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { usePlayerStore } from '@/lib/player-store'
import { useAppUpdate } from '@/hooks/use-app-update'
import { getDownloads, removeDownload, isNativeCapacitor } from '@/lib/downloads'
import { PRAYER_CITIES, QALB } from '@/lib/qalb'
import type { SavedDownload } from '@/lib/types'

const NAME_KEY = 'qalb_user_name'
const LOCATION_KEY = 'qalb_location_v1'

export function ProfileView() {
  const [name, setName] = useState('Zaire')
  const [editing, setEditing] = useState(false)
  const [downloads, setDownloads] = useState<SavedDownload[]>([])
  const [city, setCity] = useState(PRAYER_CITIES[0])
  const [showUpdateCard, setShowUpdateCard] = useState(false)
  const recents = usePlayerStore((s) => s.recents)
  const { toast } = useToast()

  const { checking, update, hasUpdate, checkForUpdate, installUpdate } = useAppUpdate()

  useEffect(() => {
    // localStorage read → async (cascading render se bachne ke liye)
    const t = setTimeout(() => {
      try {
        const n = window.localStorage.getItem(NAME_KEY)
        if (n) setName(n)
        const raw = window.localStorage.getItem(LOCATION_KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          const found = PRAYER_CITIES.find((c) => c.city === parsed.city)
          if (found) setCity(found)
        }
      } catch {
        /* defaults */
      }
      setDownloads(getDownloads())
    }, 0)
    return () => clearTimeout(t)
  }, [])

  const saveName = (value: string) => {
    const v = value.trim() || 'Musafir'
    setName(v)
    setEditing(false)
    try {
      window.localStorage.setItem(NAME_KEY, v)
    } catch {
      /* ignore */
    }
    toast({ title: `Naam update ho gaya — Assalam-o-Alaikum, ${v}!` })
  }

  const pickCity = (c: (typeof PRAYER_CITIES)[number]) => {
    setCity(c)
    try {
      window.localStorage.setItem(LOCATION_KEY, JSON.stringify(c))
    } catch {
      /* ignore */
    }
    toast({ title: `Namaz ke auqaat ab ${c.city} ke liye honge 🕌` })
  }

  const handleCheckUpdate = async () => {
    const found = await checkForUpdate()
    if (found) {
      setShowUpdateCard(true)
    } else {
      toast({
        title: 'Aap ka app latest hai ✅',
        description: `Version ${QALB.currentVersionName} chal raha hai.`,
      })
    }
  }

  const handleInstall = async () => {
    await installUpdate()
    toast({ title: 'APK download shuru…', description: 'Install prompt aayega.' })
  }

  const handleRemove = async (trackId: string) => {
    await removeDownload(trackId)
    setDownloads(getDownloads())
    toast({ title: 'Download remove ho gaya' })
  }

  return (
    <div className="space-y-5 px-4 pb-8 pt-5">
      {/* profile card */}
      <section aria-label="Profile" className="card-surface rounded-3xl p-5">
        <div className="flex items-center gap-4">
          <div className="emerald-gradient flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-extrabold text-emerald-950 shadow-[0_0_28px_-8px_rgba(16,185,129,0.7)]">
            {name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            {editing ? (
              <input
                autoFocus
                defaultValue={name}
                onBlur={(e) => saveName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveName((e.target as HTMLInputElement).value)}
                aria-label="Apna naam likhein"
                className="w-full rounded-lg border border-emerald-400/30 bg-emerald-400/5 px-2.5 py-1.5 text-base font-bold text-emerald-50 focus:outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="group flex items-center gap-1.5"
                aria-label="Naam edit karein"
              >
                <h2 className="truncate text-lg font-extrabold text-emerald-50">{name}</h2>
                <Pencil className="h-3.5 w-3.5 text-emerald-200/40 transition group-hover:text-emerald-300" />
              </button>
            )}
            <p className="flex items-center gap-1 text-[11px] text-emerald-200/50">
              <BadgeCheck className="h-3.5 w-3.5 text-emerald-400" /> Qalb member • v{QALB.currentVersionName}
            </p>
          </div>
        </div>

        {/* stats */}
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-emerald-400/5 py-2.5">
            <p className="text-lg font-extrabold text-emerald-300">{recents.length}</p>
            <p className="text-[10px] text-emerald-200/50">Played</p>
          </div>
          <div className="rounded-2xl bg-emerald-400/5 py-2.5">
            <p className="text-lg font-extrabold text-emerald-300">{downloads.length}</p>
            <p className="text-[10px] text-emerald-200/50">Downloads</p>
          </div>
          <div className="rounded-2xl bg-emerald-400/5 py-2.5">
            <p className="text-lg font-extrabold text-emerald-300">∞</p>
            <p className="text-[10px] text-emerald-200/50">Kalam</p>
          </div>
        </div>
      </section>

      {/* update card */}
      <section aria-label="App update" className="card-surface rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10">
              <Smartphone className="h-5 w-5 text-emerald-400" />
            </span>
            <div>
              <p className="text-[13px] font-bold text-emerald-50">App Version</p>
              <p className="text-[11px] text-emerald-200/50">
                {QALB.currentVersionName} (code {QALB.currentVersionCode})
                {isNativeCapacitor() ? ' • Android' : ' • web preview'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCheckUpdate}
            disabled={checking}
            className="flex items-center gap-1.5 rounded-full border border-emerald-400/25 px-3 py-1.5 text-[11.5px] font-bold text-emerald-300 transition hover:bg-emerald-400/10 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`} />
            Check
          </button>
        </div>

        {(hasUpdate || showUpdateCard) && update && (
          <div className="mt-3 rounded-2xl border border-[#d4a937]/30 bg-[#d4a937]/[0.06] p-3.5">
            <p className="flex items-center gap-1.5 text-[13px] font-bold text-[#e6c868]">
              <CloudDownload className="h-4 w-4" /> Naya version: {update.versionName} (code{' '}
              {update.versionCode})
            </p>
            {update.releaseNotes && (
              <p className="mt-1.5 whitespace-pre-line text-[11.5px] leading-relaxed text-emerald-100/70">
                {update.releaseNotes}
              </p>
            )}
            <button
              type="button"
              onClick={handleInstall}
              className="gold-gradient mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[12.5px] font-extrabold text-emerald-950 transition hover:brightness-110 active:scale-[0.98]"
            >
              <Download className="h-4 w-4" /> Update Download Karein (APK)
            </button>
          </div>
        )}
      </section>

      {/* prayer location */}
      <section aria-label="Namaz location" className="card-surface rounded-2xl p-4">
        <p className="flex items-center gap-2 text-[13px] font-bold text-emerald-50">
          <MapPin className="h-4 w-4 text-emerald-400" /> Namaz ke auqaat — shehar
        </p>
        <div className="thin-scrollbar mt-3 flex max-h-44 flex-wrap gap-2 overflow-y-auto">
          {PRAYER_CITIES.map((c) => (
            <button
              key={`${c.city}-${c.country}`}
              type="button"
              onClick={() => pickCity(c)}
              className={`rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition ${
                city.city === c.city
                  ? 'emerald-gradient text-emerald-950'
                  : 'border border-emerald-400/15 text-emerald-200/70 hover:border-emerald-400/30'
              }`}
              aria-pressed={city.city === c.city}
            >
              {c.flag} {c.city}
            </button>
          ))}
        </div>
      </section>

      {/* downloads */}
      <section aria-label="Downloads">
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-emerald-300/80">
          <Download className="h-4 w-4" /> Offline Downloads ({downloads.length})
        </h2>
        {downloads.length === 0 ? (
          <div className="card-surface rounded-2xl p-5 text-center">
            <p className="text-sm text-emerald-200/60">Abhi koi download nahi hua.</p>
            <p className="mt-1 text-[11px] text-emerald-200/40">
              Player me “Offline download” button se kalam save karein.
            </p>
          </div>
        ) : (
          <div className="card-surface thin-scrollbar max-h-80 overflow-y-auto rounded-2xl p-2">
            {downloads.map((d) => (
              <div key={d.trackId} className="flex items-center gap-3 rounded-xl px-2 py-2">
                <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-emerald-950">
                  {d.thumbnailUrl ? (
                    <img src={d.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center">🕌</span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-emerald-50">
                    {d.title}
                  </span>
                  <span className="block text-[10.5px] text-emerald-200/50">
                    {d.artist} • {d.sizeMB} MB {d.offline ? '• device par saved' : '• demo save'}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void handleRemove(d.trackId)}
                  aria-label={`Remove ${d.title}`}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-red-300/70 transition hover:bg-red-400/10 hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* about */}
      <section aria-label="About" className="card-surface rounded-2xl p-4">
        <p className="flex items-center gap-2 text-[13px] font-bold text-emerald-50">
          <Info className="h-4 w-4 text-emerald-400" /> Qalb ke baare mein
        </p>
        <p className="mt-2 text-[11.5px] leading-relaxed text-emerald-200/55">
          Qalb aik paak Islamic media platform hai — sirf authentic Naat, Hamd aur Sufi Qawwali,
          AI guardian se verified. Hijri calendar, namaz ke auqaat aur Islamic Store bhi shamil
          hai. GitHub Actions se signed APK builds automatically release hote hain aur in-app
          updater users ko naye version ki itla deta hai.
        </p>
        <p className="mt-2 text-[10px] text-emerald-200/35">
          {QALB.tagline} • © {new Date().getFullYear()} Qalb
        </p>
      </section>
    </div>
  )
}
