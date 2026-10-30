'use client'

// Qalb — LOGIN GATE (v0.4.1) — "app download hote hi sab se pehle"
// ─────────────────────────────────────────────────────────────────
// Full-screen pehli launch screen (pehli baar — na user, na guest-skip):
//   • Background SIMPLE (user request): deep-emerald gradient + halki
//     glow + faint moon watermark — koi images nahi, clean look.
//   • Header me Qalb ka brand logo (app ke andar wala hi).
//   • Login: Google (GIS one-tap) ya Mobile OTP (+91) — lib/auth.ts ke
//     REST flows. Login hote hi gate gayab, app khul jaati hai.
//   • "Abhi nahi" → Musafir (guest) mode — gate dobara nahi aata, app
//     poori chalti hai. Login baad me Profile se bhi ho sakta hai.
//
// Session persistence: idToken/refreshToken localStorage (qalb_auth_v1)
// me hai — APK update / OTA web update / app restart KISI se logout
// nahi hota. Refresh token auto-renew lib/auth.ts ensureIdToken me.

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Loader2, Moon, Smartphone } from 'lucide-react'
import { QalbLogo } from '@/components/qalb/qalb-logo'
import {
  authErrorMessage,
  clearPhoneSession,
  googleSignIn,
  hasPhoneSession,
  sendPhoneOtp,
  useQalbAuth,
  verifyPhoneOtp,
} from '@/lib/auth'

type Step = 'entry' | 'phone' | 'otp'

export function LoginGate() {
  const user = useQalbAuth((s) => s.user)
  const guest = useQalbAuth((s) => s.guest)
  const continueAsGuest = useQalbAuth((s) => s.continueAsGuest)

  // login steps
  const [step, setStep] = useState<Step>(hasPhoneSession() ? 'otp' : 'entry')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState<'google' | 'send' | 'verify' | null>(null)
  const [err, setErr] = useState<{ title: string; desc: string } | null>(null)
  const [resendIn, setResendIn] = useState(0)
  const otpRef = useRef<HTMLInputElement>(null)

  // resend countdown
  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  // agar login/guest ho gaya to gate render hi nahi hota (neeche)
  // NOTE: ye return hooks ke BAAD nahi — upar saare hooks ho chuke
  if (user || guest) return null

  const showErr = (e: unknown) => setErr(authErrorMessage(e))

  const handleGoogle = async () => {
    setErr(null)
    setBusy('google')
    try {
      await googleSignIn() // completeLogin → user set → gate auto-hide
    } catch (e) {
      showErr(e)
    } finally {
      setBusy(null)
    }
  }

  const handleSendOtp = async () => {
    const digits = phone.replace(/\D/g, '')
    if (digits.length !== 10) {
      setErr({
        title: 'Number adhoora hai',
        desc: '10-digit mobile number daalein (jaise 98XXXXXXXX).',
      })
      return
    }
    setErr(null)
    setBusy('send')
    try {
      await sendPhoneOtp(`+91${digits}`)
      setStep('otp')
      setResendIn(30)
      setTimeout(() => otpRef.current?.focus(), 150)
    } catch (e) {
      showErr(e)
    } finally {
      setBusy(null)
    }
  }

  const handleVerify = async () => {
    const code = otp.replace(/\D/g, '')
    if (code.length !== 6) {
      setErr({ title: 'OTP adhoora hai', desc: '6-digit code daalein.' })
      return
    }
    setErr(null)
    setBusy('verify')
    try {
      await verifyPhoneOtp(code)
      clearPhoneSession()
    } catch (e) {
      showErr(e)
    } finally {
      setBusy(null)
    }
  }

  return (
    // NOTE: 'dark' class force — gate hamesha-dark screen hai.
    // Light theme user ke liye bhi emerald-* utilities dark values use
    // karein (theme ramp .dark scope pe flip hota hai).
    <div
      className="dark fixed inset-0 z-[90] overflow-hidden bg-[#07160F]"
      role="dialog"
      aria-modal="true"
      aria-label="Qalb — login"
    >
      {/* SIMPLE background: do halki emerald glows (upar logo, niche card) */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(70% 38% at 50% 6%, rgba(16,185,129,0.10), transparent 62%), radial-gradient(85% 42% at 50% 108%, rgba(16,185,129,0.09), transparent 58%)',
        }}
      />
      {/* faint moon watermark — center me, bilkul subtle */}
      <Moon
        className="pointer-events-none absolute left-1/2 top-[36%] h-64 w-64 -translate-x-1/2 -translate-y-1/2 text-emerald-200/[0.05]"
        strokeWidth={0.7}
        aria-hidden
      />

      {/* content */}
      <div className="relative z-[1] flex h-full flex-col">
        {/* header — Qalb brand logo (app ke andar wala hi) */}
        <div className="flex flex-col items-center pt-[calc(env(safe-area-inset-top)+4.6rem)]">
          <QalbLogo className="h-16 w-auto" />
        </div>

        {/* content hint — simple text line (user ko pata chale app me kya hai) */}
        <p className="mt-auto mb-4 text-center text-[10.5px] font-bold tracking-[0.22em] text-emerald-200/45">
          NAAT • BAYAN • REELS • CALENDAR
        </p>

        {/* bottom card — headline + login steps */}
        <div className="mx-4 mb-[calc(env(safe-area-inset-bottom)+1.6rem)] rounded-3xl border border-emerald-400/15 bg-[#0B1F17]/90 px-5 pb-6 pt-5">
          {step === 'entry' && (
            <>
              <h1 className="text-center text-[22px] font-extrabold leading-tight text-emerald-50">
                Qalb me Khush Aamdeed
              </h1>
              <p className="mx-auto mt-1.5 max-w-[30ch] text-center text-[12.5px] leading-relaxed text-emerald-200/60">
                Naat, Bayan, Reels aur Islami Calendar — sab kuch ek jagah.
                Login karein, aap ki har pasand mehfooz rahegi.
              </p>
            </>
          )}
          {step === 'phone' && (
            <>
              <h1 className="text-center text-[19px] font-extrabold text-emerald-50">
                Mobile number likhein
              </h1>
              <p className="mt-1 text-center text-[11.5px] text-emerald-200/50">
                India (+91) — 6-digit OTP SMS par aayega
              </p>
            </>
          )}
          {step === 'otp' && (
            <>
              <h1 className="text-center text-[19px] font-extrabold text-emerald-50">OTP daalein</h1>
              <p className="mt-1 text-center text-[11.5px] text-emerald-200/50">
                {phone.replace(/\D/g, '')} par bheja gaya 6-digit code
              </p>
            </>
          )}

          {/* error card */}
          {err && (
            <div className="mt-3.5 rounded-2xl border border-red-400/25 bg-red-400/[0.08] p-3">
              <p className="text-[12.5px] font-bold text-red-200">{err.title}</p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-red-100/70">{err.desc}</p>
            </div>
          )}

          {/* ── STEP: entry ── */}
          {step === 'entry' && (
            <div className="mt-5 space-y-3">
              <button
                type="button"
                onClick={() => void handleGoogle()}
                disabled={busy !== null}
                className="flex w-full items-center justify-center gap-3 rounded-2xl bg-white py-3.5 text-[14px] font-bold text-slate-800 shadow-lg transition active:scale-[0.98] disabled:opacity-50"
              >
                {busy === 'google' ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <GoogleG />
                )}
                Google se login karein
              </button>

              <button
                type="button"
                onClick={() => setStep('phone')}
                disabled={busy !== null}
                className="emerald-gradient flex w-full items-center justify-center gap-3 rounded-2xl py-3.5 text-[14px] font-extrabold text-emerald-950 shadow-lg transition active:scale-[0.98] disabled:opacity-50"
              >
                <Smartphone className="h-5 w-5" />
                Mobile number se login
              </button>

              <button
                type="button"
                onClick={continueAsGuest}
                className="w-full pt-1.5 text-center text-[12px] font-semibold text-emerald-200/55 transition active:scale-[0.98]"
              >
                Abhi nahi — pehle dekhna chahta hoon
              </button>

              <p className="text-center text-[10.5px] leading-relaxed text-emerald-200/35">
                Login karne par aap ki playlists, pasand aur history cloud me
                mehfooz hoti hai — app update ho ya phone badlo, sab wapis milega.
              </p>
            </div>
          )}

          {/* ── STEP: phone ── */}
          {step === 'phone' && (
            <div className="mt-5 space-y-3">
              <div className="flex items-stretch gap-2">
                <span className="flex items-center rounded-2xl border border-emerald-400/25 bg-emerald-400/5 px-3.5 text-[14px] font-bold text-emerald-100">
                  +91
                </span>
                <input
                  autoFocus
                  inputMode="numeric"
                  autoComplete="tel-national"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  onKeyDown={(e) => e.key === 'Enter' && void handleSendOtp()}
                  placeholder="98XXXXXXXX"
                  aria-label="Mobile number"
                  className="min-w-0 flex-1 rounded-2xl border border-emerald-400/25 bg-emerald-400/5 px-4 py-3.5 text-[15px] font-semibold tracking-wider text-emerald-50 placeholder:text-emerald-200/25 focus:border-emerald-400/50 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => void handleSendOtp()}
                disabled={busy !== null || phone.replace(/\D/g, '').length !== 10}
                className="emerald-gradient flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[14px] font-extrabold text-emerald-950 shadow-lg transition active:scale-[0.98] disabled:opacity-50"
              >
                {busy === 'send' ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : null}
                OTP bhejein
              </button>
              <button
                type="button"
                onClick={() => setStep('entry')}
                className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-200/50"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Wapas
              </button>
            </div>
          )}

          {/* ── STEP: otp ── */}
          {step === 'otp' && (
            <div className="mt-5 space-y-3">
              <input
                ref={otpRef}
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otp}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 6)
                  setOtp(v)
                  if (v.length === 6) void handleVerify()
                }}
                onKeyDown={(e) => e.key === 'Enter' && void handleVerify()}
                placeholder="••••••"
                aria-label="6-digit OTP"
                className="w-full rounded-2xl border border-emerald-400/25 bg-emerald-400/5 px-4 py-4 text-center text-[22px] font-extrabold tracking-[0.5em] text-emerald-50 placeholder:text-emerald-200/25 focus:border-emerald-400/50 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void handleVerify()}
                disabled={busy !== null || otp.replace(/\D/g, '').length !== 6}
                className="emerald-gradient flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[14px] font-extrabold text-emerald-950 shadow-lg transition active:scale-[0.98] disabled:opacity-50"
              >
                {busy === 'verify' ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : null}
                Login karein
              </button>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    clearPhoneSession()
                    setStep('phone')
                    setOtp('')
                  }}
                  className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-200/50"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Number badlein
                </button>
                <button
                  type="button"
                  onClick={() => void handleSendOtp()}
                  disabled={busy !== null || resendIn > 0}
                  className="text-[12px] font-bold text-emerald-300 disabled:opacity-40"
                >
                  {resendIn > 0 ? `Dobara bhejein ${resendIn}s` : 'OTP dobara bhejein'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Google "G" logo (SVG — offline-safe) */
function GoogleG() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  )
}
