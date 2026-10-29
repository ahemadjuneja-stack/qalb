'use client'

// Qalb — Profile Tab: user settings, downloads, app update (Step 5 hook), about

import { useEffect, useState } from 'react'
import {
  Pencil,
  Download,
  Trash2,
  RefreshCw,
  CloudDownload,
  Info,
  BadgeCheck,
  Smartphone,
  SunMedium,
  Moon,
  Palette,
  LogIn,
  LogOut,
  Sparkles,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useAppUpdate } from '@/hooks/use-app-update'
import { getDownloads, removeDownload, isNativeCapacitor } from '@/lib/downloads'
import { QALB } from '@/lib/qalb'
import { getTheme, applyTheme, type QalbTheme } from '@/lib/theme'
import { useQalbAuth } from '@/lib/auth'
import { getTasteProfile, useTasteStore } from '@/lib/recommend'
import type { SavedDownload } from '@/lib/types'

const NAME_KEY = 'qalb_user_name'

export function ProfileView() {
  const [name, setName] = useState('Zaire')
  const [editing, setEditing] = useState(false)
  const [downloads, setDownloads] = useState<SavedDownload[]>([])
  const [showUpdateCard, setShowUpdateCard] = useState(false)
  const [theme, setTheme] = useState<QalbTheme>('light')
  // auth + algorithm
  const user = useQalbAuth((s) => s.user)
  const openLogin = useQalbAuth((s) => s.openLogin)
  const logout = useQalbAuth((s) => s.logout)
  const tasteV = useTasteStore((s) => s.v)
  const { toast } = useToast()

  const { checking, update, hasUpdate, checkForUpdate, installUpdate } = useAppUpdate()

  useEffect(() => {
    // localStorage read → async (cascading render se bachne ke liye)
    const t = setTimeout(() => {
      try {
        const n = window.localStorage.getItem(NAME_KEY)
        if (n) setName(n)
      } catch {
        /* defaults */
      }
      setDownloads(getDownloads())
    }, 0)
    setTheme(getTheme())
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

  const switchTheme = (t: QalbTheme) => {
    applyTheme(t)
    setTheme(t)
    toast({
      title: t === 'light' ? 'Light theme on ho gayi ☀️' : 'Dark theme on ho gayi 🌙',
    })
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

  const handleLogout = () => {
    logout()
    toast({ title: 'Logout ho gaya', description: 'Musafir mode me chal rahe hain — app poori chalti hai.' })
  }

  // display identity — login ho to wahi, warna local naam
  const displayName = user?.name ?? name
  const taste = user
    ? getTasteProfile(user.uid)
    : getTasteProfile(null)
  const tasteTop = taste.artistScores.slice(0, 4).map(([n]) => n)

  return (
    <div className="space-y-5 px-4 pb-8 pt-5">
      {/* profile card */}
      <section aria-label="Profile" className="card-surface rounded-3xl p-5">
        <div className="flex items-center gap-4">
          <div
            className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-2xl font-extrabold text-emerald-950 shadow-[0_0_28px_-8px_var(--glow)] ${
              user ? 'gold-gradient' : 'emerald-gradient'
            }`}
          >
            {user?.photoUrl ? (
              <img src={user.photoUrl} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              displayName.charAt(0).toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1">
            {user ? (
              <div>
                <h2 className="truncate text-lg font-extrabold text-emerald-50">{displayName}</h2>
                <p className="flex items-center gap-1 text-[11px] text-emerald-200/50">
                  <BadgeCheck className="h-3.5 w-3.5 text-gold" />
                  {user.provider === 'phone'
                    ? user.phone
                    : (user.email ?? 'Google se login')}
                </p>
              </div>
            ) : (
              <>
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
                    <h2 className="truncate text-lg font-extrabold text-emerald-50">{displayName}</h2>
                    <Pencil className="h-3.5 w-3.5 text-emerald-200/40 transition group-hover:text-emerald-300" />
                  </button>
                )}
                <p className="flex items-center gap-1 text-[11px] text-emerald-200/50">
                  <BadgeCheck className="h-3.5 w-3.5 text-emerald-400" /> Musafir mode • v{QALB.currentVersionName}
                </p>
              </>
            )}
          </div>
          {/* login/logout — JioSaavn account action */}
          {user ? (
            <button
              type="button"
              onClick={handleLogout}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-red-400/25 px-3 text-[11px] font-bold text-red-300/80 transition hover:bg-red-400/10 hover:text-red-300"
              aria-label="Logout karein"
            >
              <LogOut className="h-3.5 w-3.5" /> Logout
            </button>
          ) : (
            <button
              type="button"
              onClick={openLogin}
              className="gold-gradient flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[11.5px] font-extrabold text-emerald-950 shadow-[0_0_16px_-4px_var(--glow)] transition hover:brightness-110 active:scale-95"
              aria-label="Login karein"
            >
              <LogIn className="h-3.5 w-3.5" /> Login
            </button>
          )}
        </div>

        {/* taste insight — algorithm aap ko kya pasand samajhta hai */}
        {tasteTop.length > 0 && (
          <div className="mt-4 rounded-2xl border border-gold/20 bg-gold/[0.05] p-3">
            <p className="flex items-center gap-1.5 text-[11.5px] font-bold text-gold">
              <Sparkles className="h-3.5 w-3.5" /> Aap ki Pasand — {taste.plays} kalaam sune
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tasteTop.map((a) => (
                <span
                  key={a}
                  className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-[10.5px] font-semibold text-emerald-200/80"
                >
                  {a}
                </span>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-emerald-200/40">
              Home feed isi pasand se roz naya banaya jata hai — jitna sunenge, utna behtar.
            </p>
          </div>
        )}

        {/* stats */}
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-emerald-400/5 py-2.5">
            <p className="text-lg font-extrabold text-emerald-300">{taste.plays}</p>
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

      {/* theme (light/dark) */}
      <section aria-label="Theme setting" className="card-surface rounded-2xl p-4">
        <p className="flex items-center gap-2 text-[13px] font-bold text-emerald-50">
          <Palette className="h-4 w-4 text-emerald-400" /> Theme — Light ya Dark
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-emerald-400/5 p-1.5">
          <button
            type="button"
            onClick={() => switchTheme('light')}
            aria-pressed={theme === 'light'}
            className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl text-[12.5px] font-bold transition ${
              theme === 'light'
                ? 'emerald-gradient text-emerald-950 shadow-[0_0_20px_-6px_var(--glow)]'
                : 'border border-emerald-400/15 text-emerald-200/70 hover:border-emerald-400/30'
            }`}
          >
            <SunMedium className="h-4 w-4" /> Light
          </button>
          <button
            type="button"
            onClick={() => switchTheme('dark')}
            aria-pressed={theme === 'dark'}
            className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl text-[12.5px] font-bold transition ${
              theme === 'dark'
                ? 'emerald-gradient text-emerald-950 shadow-[0_0_20px_-6px_var(--glow)]'
                : 'border border-emerald-400/15 text-emerald-200/70 hover:border-emerald-400/30'
            }`}
          >
            <Moon className="h-4 w-4" /> Dark
          </button>
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
          <div className="mt-3 rounded-2xl border border-gold/30 bg-gold/[0.06] p-3.5">
            <p className="flex items-center gap-1.5 text-[13px] font-bold text-gold">
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
              className="emerald-gradient mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[12.5px] font-extrabold text-emerald-950 transition hover:brightness-110 active:scale-[0.98]"
            >
              <Download className="h-4 w-4" /> Update Download Karein (APK)
            </button>
          </div>
        )}
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
                    <img src={d.thumbnailUrl} alt="" className="absolute left-1/2 top-1/2 h-[133.33%] w-auto max-w-none min-w-full -translate-x-1/2 -translate-y-1/2 object-cover" />
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
          har kalaam keyword-rules se verified. Hijri calendar, namaz ke auqaat aur Islamic Store bhi shamil
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
