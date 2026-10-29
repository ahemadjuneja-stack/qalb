'use client'

// Qalb — Login Bottom Sheet
// ─────────────────────────────────────────────────────────────────
// JioSaavn/Spotify style login: Google + Mobile OTP + Musafir (guest)
// Steps: entry → phone-input → otp → done. Har error friendly message.
// Auth logic lib/auth.ts me (identitytoolkit REST) — UI yahan sirf
// orchestrate karta hai.

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Loader2, Smartphone, X } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  authErrorMessage,
  clearPhoneSession,
  googleSignIn,
  hasPhoneSession,
  sendPhoneOtp,
  verifyPhoneOtp,
  useQalbAuth,
} from '@/lib/auth'

type Step = 'entry' | 'phone' | 'otp'

export function LoginSheet() {
  const { loginOpen, closeLogin, setSession } = useQalbAuth()
  const [step, setStep] = useState<Step>('entry')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState<'google' | 'send' | 'verify' | null>(null)
  const [err, setErr] = useState<{ title: string; desc: string } | null>(null)
  const [resendIn, setResendIn] = useState(0)
  const { toast } = useToast()
  const otpRef = useRef<HTMLInputElement>(null)

  // sheet reset har baar
  useEffect(() => {
    if (loginOpen) {
      setStep(hasPhoneSession() ? 'otp' : 'entry')
      setErr(null)
      setOtp('')
    }
  }, [loginOpen])

  // resend countdown
  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  if (!loginOpen) return null

  const close = () => {
    closeLogin()
    setStep('entry')
    setErr(null)
  }

  const showErr = (e: unknown) => {
    setErr(authErrorMessage(e))
  }

  const handleGoogle = async () => {
    setErr(null)
    setBusy('google')
    try {
      await googleSignIn()
      toast({ title: 'Assalam-o-Alaikum! Google se login ho gaya 🎉' })
      close()
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
      toast({ title: `OTP bhej diya ${digits.slice(0, 2)}${'•'.repeat(6)}${digits.slice(8)} par 📱` })
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
      const user = await verifyPhoneOtp(code)
      setSession(user)
      toast({ title: 'Assalam-o-Alaikum! Login ho gaya 🎉' })
      clearPhoneSession()
      close()
    } catch (e) {
      showErr(e)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Qalb me login karein"
      onClick={close}
    >
      <div
        className="w-full max-w-md rounded-t-3xl border-t border-emerald-400/20 bg-[#0B1F17] px-5 pb-9 pt-3 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-emerald-200/20" />

        {/* header */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-extrabold text-emerald-50">
              {step === 'entry' && 'Qalb me Khush Aamdeed'}
              {step === 'phone' && 'Mobile number likhein'}
              {step === 'otp' && 'OTP daalein'}
            </p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-emerald-200/50">
              {step === 'entry' && 'Login karein — har user ko apni pasand ke mutabiq kalaam milte hain'}
              {step === 'phone' && 'India (+91) — 6-digit OTP SMS par aayega'}
              {step === 'phone' && ''}
              {step === 'otp' && `${phone.replace(/\D/g, '')} par bheja gaya code`}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-200 transition hover:bg-emerald-400/20"
            aria-label="Band karein"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* error card */}
        {err && (
          <div className="mb-4 rounded-2xl border border-red-400/25 bg-red-400/[0.07] p-3">
            <p className="text-[12.5px] font-bold text-red-200">{err.title}</p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-red-100/70">{err.desc}</p>
          </div>
        )}

        {/* ── STEP: entry ── */}
        {step === 'entry' && (
          <div className="space-y-3">
            {/* Google */}
            <button
              type="button"
              onClick={() => void handleGoogle()}
              disabled={busy !== null}
              className="flex w-full items-center justify-center gap-3 rounded-2xl border border-emerald-400/20 bg-white py-3.5 text-[14px] font-bold text-slate-800 transition hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50"
            >
              {busy === 'google' ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <GoogleG />
              )}
              Google se login karein
            </button>

            {/* Mobile */}
            <button
              type="button"
              onClick={() => setStep('phone')}
              disabled={busy !== null}
              className="emerald-gradient flex w-full items-center justify-center gap-3 rounded-2xl py-3.5 text-[14px] font-extrabold text-emerald-950 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
            >
              <Smartphone className="h-5 w-5" />
              Mobile number se login
            </button>

            {/* Guest */}
            <button
              type="button"
              onClick={close}
              className="w-full py-2 text-center text-[12px] font-semibold text-emerald-200/50 transition hover:text-emerald-200"
            >
              Abhi nahi — Musafir mode me chalao
            </button>

            <p className="pt-1 text-center text-[10.5px] leading-relaxed text-emerald-200/35">
              Login karne par aap ki pasand cloud me bhi save hoti hai — koi
              kalaam miss nahi hota. Bina login bhi app poori chalti hai.
            </p>
          </div>
        )}

        {/* ── STEP: phone ── */}
        {step === 'phone' && (
          <div className="space-y-3">
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
              className="emerald-gradient flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[14px] font-extrabold text-emerald-950 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
            >
              {busy === 'send' ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : null}
              OTP bhejein
            </button>
            <button
              type="button"
              onClick={() => setStep('entry')}
              className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-200/50 transition hover:text-emerald-200"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Wapas
            </button>
          </div>
        )}

        {/* ── STEP: otp ── */}
        {step === 'otp' && (
          <div className="space-y-3">
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
              className="emerald-gradient flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[14px] font-extrabold text-emerald-950 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
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
                className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-200/50 transition hover:text-emerald-200"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Number badlein
              </button>
              <button
                type="button"
                onClick={() => void handleSendOtp()}
                disabled={busy !== null || resendIn > 0}
                className="text-[12px] font-bold text-emerald-300 transition hover:text-emerald-200 disabled:opacity-40"
              >
                {resendIn > 0 ? `Dobara bhejein ${resendIn}s` : 'OTP dobara bhejein'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Google "G" logo (SVG — offline-safe, koi network nahi) */
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
