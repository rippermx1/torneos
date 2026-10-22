'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { getOnboardingReturnPath } from '@/lib/auth/redirect'
import { ConfirmationGuidance } from './confirmation-guidance'

const ACCEPTED_MESSAGE = 'Si hay una cuenta pendiente para ese correo, enviaremos un enlace de confirmación. Revisa también spam.'
const FAILURE_MESSAGE = 'No pudimos procesar la solicitud. Inténtalo nuevamente más tarde.'
const INVALID_MESSAGE = 'Revisa el email e inténtalo nuevamente.'
const LIMITED_MESSAGE = 'Espera antes de solicitar otro enlace.'
const validDelay = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 86400
function retryDelay(value: unknown, header: string | null) {
  if (validDelay(value)) return value
  const seconds = header && /^\d+$/.test(header) ? Number(header) : null
  return validDelay(seconds) ? seconds : 60
}

interface PendingRequest {
  controller: AbortController
  timer: ReturnType<typeof setTimeout> | null
}

export function ResendVerificationButton({ returnTo = '/play', email: initialEmail = '', initialCooldownSeconds = 0 }: {
  returnTo?: string
  email?: string
  initialCooldownSeconds?: number
}) {
  const emailId = useId()
  const [email, setEmail] = useState(initialEmail)
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const initialDelay = validDelay(initialCooldownSeconds) ? initialCooldownSeconds : 0
  const [cooldown, setCooldown] = useState(initialDelay)
  const [initialDeadline] = useState(() => Date.now() + initialDelay * 1000)
  const cooldownUntil = useRef(initialDeadline)
  const pending = useRef<PendingRequest | null>(null)
  const alive = useRef(true)
  const coolingDown = cooldown > 0

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      const operation = pending.current
      pending.current = null
      if (operation?.timer) clearTimeout(operation.timer)
      operation?.controller.abort()
    }
  }, [])

  useEffect(() => {
    if (!coolingDown) return
    const timer = setInterval(() => {
      setCooldown(Math.max(0, Math.ceil((cooldownUntil.current - Date.now()) / 1000)))
    }, 250)
    return () => clearInterval(timer)
  }, [coolingDown])

  function changeEmail(value: string) {
    const operation = pending.current
    pending.current = null
    if (operation?.timer) clearTimeout(operation.timer)
    operation?.controller.abort()
    setEmail(value)
    setStatus('idle')
    setMessage('')
  }

  async function handleResend(event: React.FormEvent) {
    event.preventDefault()
    // This ref also rejects clicks before React has rendered the disabled button.
    if (!alive.current || pending.current || cooldownUntil.current > Date.now()) return
    const address = email.trim()
    if (address.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setStatus('error'); setMessage(INVALID_MESSAGE); return
    }
    const destination = getOnboardingReturnPath(returnTo)
    const operation: PendingRequest = { controller: new AbortController(), timer: null }
    pending.current = operation
    const current = () => alive.current && pending.current === operation
    setStatus('loading'); setMessage('')
    operation.timer = setTimeout(() => {
      if (!current()) return
      pending.current = null
      operation.controller.abort()
      setStatus('error'); setMessage(FAILURE_MESSAGE)
    }, 15000)

    try {
      const response = await fetch('/api/auth/resend-confirmation', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        headers: { 'content-type': 'application/json' }, signal: operation.controller.signal,
        body: JSON.stringify({ email: address, next: destination.length <= 1024 ? destination : '/play' }),
      })
      if (!current()) return
      let data: unknown = null
      try { data = await response.json() } catch { /* Provider and transport errors remain neutral. */ }
      if (!current()) return
      const body = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : null
      if (response.status === 429 || response.status === 202 && body) {
        const seconds = retryDelay(body?.retryAfterSeconds, response.headers.get('retry-after'))
        cooldownUntil.current = Date.now() + seconds * 1000
        setCooldown(seconds)
        setStatus(response.status === 202 ? 'sent' : 'error')
        setMessage(response.status === 202 ? ACCEPTED_MESSAGE : LIMITED_MESSAGE)
      } else {
        setStatus('error')
        setMessage(response.status === 400 ? INVALID_MESSAGE : FAILURE_MESSAGE)
      }
    } catch {
      if (current()) { setStatus('error'); setMessage(FAILURE_MESSAGE) }
    } finally {
      if (operation.timer) clearTimeout(operation.timer)
      if (current()) pending.current = null
    }
  }

  return <form onSubmit={handleResend} className="space-y-3 text-left">
    <ConfirmationGuidance />
    <div className="space-y-1.5">
      <label htmlFor={emailId} className="text-sm font-medium">Email de la cuenta pendiente</label>
      <input id={emailId} type="email" autoComplete="email" required maxLength={254}
        value={email} onChange={event => changeEmail(event.target.value)}
        className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm" />
    </div>
    <button type="submit" disabled={status === 'loading' || coolingDown}
      className="text-sm underline underline-offset-4 text-foreground hover:opacity-70 transition-opacity disabled:opacity-40">
      {status === 'loading' ? 'Solicitando enlace…' : coolingDown ? 'Reenviar disponible en ' + cooldown + 's' : 'Reenviar correo de confirmación'}
    </button>
    {message && <p role={status === 'error' ? 'alert' : 'status'} aria-atomic="true" className="text-sm text-muted-foreground">{message}</p>}
  </form>
}
