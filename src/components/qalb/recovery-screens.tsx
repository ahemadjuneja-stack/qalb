'use client'

// Qalb — Recovery Screens (sab themes me kaam karein isliye CSS tokens)
// ─────────────────────────────────────────────────────────────────
// 1. SafeModeScreen      — crash-loop pakda gaya, tiny UI se recovery
// 2. ErrorFallbackCard   — React render crash (white screen nahi)
// 3. ForceUpdateScreen   — remoteConfig minVersionCode cross ho gaya
// 4. MaintenanceScreen   — remote killSwitch ON
//
// Ye screens JAAN BOOJH KAR minimal hain: koi data-fetch, koi heavy
// component — tabhi wo crash-loop me bhi reliably render hoti hain.

import { useEffect, useState } from 'react'
import { HeartPulse, RotateCcw, ShieldAlert, Sparkles, Trash2, TrendingUp } from 'lucide-react'
import { checkForUpdateEngine, useUpdateStore } from '@/lib/update-engine'
import { resetBootCounters, fullResetAndReload } from '@/lib/boot-guard'
import { QALB } from '@/lib/qalb'
import { UpdatePopup } from '@/components/qalb/update-popup'

// ── shared shell ──────────────────────────────────────────────────

function RecoveryShell({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-10 text-foreground">
      <div className="w-full max-w-sm rounded-3xl border border-emerald-400/15 bg-popover/60 p-6 shadow-2xl backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-500">
            {icon}
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight">{title}</h1>
            <p className="text-[11px] font-medium text-emerald-500">Qalb v{QALB.currentVersionName}</p>
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
        <div className="mt-5 space-y-2.5">{children}</div>
      </div>
    </div>
  )
}

function ActionButton({
  onClick,
  primary,
  children,
}: {
  onClick: () => void
  primary?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        primary
          ? 'w-full rounded-2xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-lg transition active:scale-95'
          : 'w-full rounded-2xl border border-emerald-400/25 bg-transparent py-3 text-sm font-semibold text-emerald-600 transition active:scale-95 dark:text-emerald-300'
      }
    >
      {children}
    </button>
  )
}

// ── 0. Boot splash (SSR/client pehli frame — hydration-safe gate) ──

export function BootSplash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground">
      <p className="text-2xl font-black tracking-tight">
        Qa<span className="text-emerald-500">lb</span>
      </p>
      <div className="mt-4 h-6 w-6 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-500" />
    </div>
  )
}

// ── 1. Safe Mode (crash-loop recovery) ────────────────────────────

export function SafeModeScreen() {
  const [checking, setChecking] = useState(false)
  const phase = useUpdateStore((s) => s.phase)

  // Safe mode me bhi update engine chalna chahiye — aksar ilaj
  // naya version hi hota hai (popup progress khud dikh jayega)
  useEffect(() => {
    void checkForUpdateEngine(false)
  }, [])

  return (
    <>
      <UpdatePopup />
      <RecoveryShell
        icon={<HeartPulse className="h-6 w-6" />}
        title="App khud ko theek kar rahi hai"
        subtitle="Qalb ne dekha hai ke app kuch baar baar band ho rahi thi. Aapka naat library, playlists — sab mehfooz hain. Neeche se app wapas zinda karein."
      >
        <ActionButton
          primary
          onClick={() => {
            resetBootCounters()
            window.location.reload()
          }}
        >
          App restart karein
        </ActionButton>
        <ActionButton onClick={() => { setChecking(true); void checkForUpdateEngine(true) }}>
          {checking || phase === 'checking' || phase === 'downloading'
            ? 'Update check ho raha hai…'
            : 'Naya update check karein'}
        </ActionButton>
        <ActionButton
          onClick={() => {
            void fullResetAndReload()
          }}
        >
          <span className="inline-flex items-center justify-center gap-2">
            <Trash2 className="h-4 w-4" />
            Data reset karke restart (last option)
          </span>
        </ActionButton>
        <p className="pt-1 text-center text-[11px] leading-relaxed text-muted-foreground">
          Data reset sirf app ki settings khali karta hai — aapki playlists cloud par hain.
        </p>
      </RecoveryShell>
    </>
  )
}

// ── 2. Error fallback (React render crash) ────────────────────────

export function ErrorFallbackCard({
  onRetry,
}: {
  onRetry: () => void
}) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-background px-5 text-foreground">
      <div className="w-full max-w-sm rounded-3xl border border-amber-400/25 bg-popover/60 p-6 shadow-xl backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-500">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h1 className="text-base font-bold leading-tight">Ek hisse me gadbad thi</h1>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Chinta na karein — ghalti ki report hum tak pahunch gayi aur app baaki hisso se chalti rahegi.
          Dobara try karein.
        </p>
        <div className="mt-5 space-y-2.5">
          <ActionButton primary onClick={onRetry}>
            Dobara koshish karein
          </ActionButton>
          <ActionButton onClick={() => window.location.reload()}>App restart karein</ActionButton>
          <ActionButton onClick={() => void fullResetAndReload()}>Data reset karke restart</ActionButton>
        </div>
      </div>
    </div>
  )
}

// ── 3. Force Update (minVersionCode cross ho gaya) ────────────────

export function ForceUpdateScreen({ message }: { message: string | null }) {
  const phase = useUpdateStore((s) => s.phase)

  // Screen khulte hi auto-download shuru — install popup progress dega
  useEffect(() => {
    void checkForUpdateEngine(true)
  }, [])

  const downloading = phase === 'downloading' || phase === 'ready'

  return (
    <>
      <UpdatePopup />
      <RecoveryShell
        icon={<TrendingUp className="h-6 w-6" />}
        title="Naya version zaroori hai"
        subtitle={
          message ??
          'Qalb ka naya version aa chuka hai jisme ye ghalti theek ki gayi hai. Update ke bina app chal nahi sakti — neeche ka button dabaein, download khud ho jayega.'
        }
      >
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
          {downloading
            ? 'Download ho raha hai — bas ek dafa Install dabana hoga…'
            : 'Update khud download ho raha hai…'}
        </div>
        <ActionButton
          onClick={() => {
            window.open(
              `${QALB.githubRepo ? `https://github.com/${QALB.githubRepo}` : ''}/releases/latest`,
              '_blank',
              'noopener',
            )
          }}
        >
          Browser se download karein
        </ActionButton>
      </RecoveryShell>
    </>
  )
}

// ── 4. Maintenance (kill switch) ──────────────────────────────────

export function MaintenanceScreen({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  const [busy, setBusy] = useState(false)
  return (
    <RecoveryShell
      icon={<Sparkles className="h-6 w-6" />}
      title="Thodi der baad wapas aaein"
      subtitle={message}
    >
      <ActionButton
        primary
        onClick={() => {
          setBusy(true)
          onRetry()
          setTimeout(() => setBusy(false), 1500)
        }}
      >
        {busy ? 'Check ho raha hai…' : 'Phir se try karein'}
      </ActionButton>
      <ActionButton onClick={() => window.location.reload()}>App restart karein</ActionButton>
    </RecoveryShell>
  )
}

// ── 5. Remote notice (non-blocking announcement) ──────────────────

export function RemoteNoticeBanner({ notice }: { notice: string }) {
  const [closed, setClosed] = useState(false)
  if (closed) return null
  return (
    <div className="mx-auto mt-2 max-w-md px-3">
      <div className="flex items-start gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2.5 text-xs leading-relaxed text-emerald-700 dark:text-emerald-200">
        <RotateCcw className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span className="flex-1">{notice}</span>
        <button
          type="button"
          aria-label="Notice band karein"
          onClick={() => setClosed(true)}
          className="shrink-0 font-bold text-emerald-600 dark:text-emerald-300"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
