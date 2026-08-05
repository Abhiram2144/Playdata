import { useState } from 'react'
import { useRouter } from 'next/router'
import { motion } from 'framer-motion'
import { Zap, Hash, User, BadgeCheck, ArrowRight, Loader2, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

export default function GuestJoin() {
  const router = useRouter()
  const prefill = (router.query.code as string) ?? ''

  const [step, setStep] = useState<'identity' | 'code'>('identity')
  const [name, setName] = useState('')
  const [studentId, setStudentId] = useState('')
  const [code, setCode] = useState(prefill.toUpperCase())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const nameValid = name.trim().length >= 2
  const studentIdValid = studentId.trim().length >= 1

  const handleIdentityNext = () => {
    if (!nameValid) { setError('Please enter your full name'); return }
    if (!studentIdValid) { setError('Please enter your student ID'); return }
    setError('')
    setStep('code')
  }

  const handleJoin = async () => {
    const c = code.trim().toUpperCase()
    if (c.length < 6) { setError('Please enter a 6-character session code'); return }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/guest/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ join_code: c, guest_name: name.trim(), guest_student_id: studentId.trim() }),
      })
      const data = await res.json()

      if (!res.ok) { setError(data.error ?? 'Failed to join'); return }

      // Persist token in localStorage so the session page can retrieve it on refresh
      localStorage.setItem(`pd_guest_${data.session_id}`, data.guest_token)
      router.push(`/guest/sessions/${data.session_id}`)
    } catch {
      toast.error('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f3ff] flex flex-col items-center justify-center px-4 py-12">
      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2 mb-8"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-600 shadow-sm">
          <Zap className="size-4 text-white" />
        </div>
        <span className="text-xl font-bold text-gray-900">PlayData</span>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="w-full max-w-sm"
      >
        {/* Card */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {/* Header */}
          <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-br from-violet-50 to-indigo-50">
            <div className="flex items-center gap-2 mb-1">
              <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-700">Guest</span>
              {step === 'code' && (
                <span className="text-xs text-gray-400">· {name}</span>
              )}
            </div>
            <h1 className="text-lg font-bold text-gray-900">
              {step === 'identity' ? 'Who are you?' : 'Enter session code'}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {step === 'identity'
                ? 'Your teacher will see this on their screen.'
                : 'Enter the 6-character code your teacher shared.'}
            </p>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4">
            {step === 'identity' ? (
              <>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                    <User className="size-3.5 text-violet-500" />
                    Full name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setError('') }}
                    onKeyDown={(e) => e.key === 'Enter' && handleIdentityNext()}
                    placeholder="e.g. Alex Johnson"
                    autoFocus
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100 transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                    <BadgeCheck className="size-3.5 text-violet-500" />
                    Student ID
                  </label>
                  <input
                    type="text"
                    value={studentId}
                    onChange={(e) => { setStudentId(e.target.value); setError('') }}
                    onKeyDown={(e) => e.key === 'Enter' && handleIdentityNext()}
                    placeholder="e.g. s1234567"
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100 transition"
                  />
                </div>

                {error && (
                  <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>
                )}

                <button
                  onClick={handleIdentityNext}
                  disabled={!nameValid || !studentIdValid}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Continue
                  <ArrowRight className="size-4" />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => { setStep('identity'); setError('') }}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition mb-1"
                >
                  <ArrowLeft className="size-3" /> Back
                </button>

                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                    <Hash className="size-3.5 text-violet-500" />
                    Session code
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
                      setError('')
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                    placeholder="AB12CD"
                    maxLength={6}
                    autoFocus
                    disabled={loading}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.35em] text-gray-900 placeholder:text-gray-300 placeholder:tracking-widest focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100 disabled:opacity-50 transition"
                  />
                </div>

                {error && (
                  <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>
                )}

                <button
                  onClick={handleJoin}
                  disabled={loading || code.length < 6}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <><Loader2 className="size-4 animate-spin" /> Joining…</>
                  ) : (
                    <>Join Session <ArrowRight className="size-4" /></>
                  )}
                </button>
              </>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Have an account?{' '}
          <Link href="/auth/login" className="text-violet-600 hover:text-violet-500 font-medium transition">
            Sign in instead
          </Link>
        </p>
      </motion.div>
    </main>
  )
}
