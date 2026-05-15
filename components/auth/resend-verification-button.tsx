'use client'

import { useState } from 'react'

export function ResendVerificationButton() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [cooldown, setCooldown] = useState(0)

  async function handleResend() {
    setStatus('loading')
    setErrorMsg('')

    const res = await fetch('/api/auth/resend-confirmation', { method: 'POST' })
    const data = await res.json()

    if (!res.ok) {
      setStatus('error')
      setErrorMsg(data.error ?? 'Error al reenviar.')
      return
    }

    setStatus('sent')

    // Cooldown de 60s para evitar clicks repetidos
    setCooldown(60)
    const id = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(id)
          setStatus('idle')
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  if (status === 'sent') {
    return (
      <p className="text-sm text-green-700">
        ✓ Correo reenviado — revisa tu bandeja
        {cooldown > 0 && <span className="text-muted-foreground"> (reenviar en {cooldown}s)</span>}
      </p>
    )
  }

  return (
    <div className="space-y-1">
      <button
        onClick={handleResend}
        disabled={status === 'loading' || cooldown > 0}
        className="text-sm underline underline-offset-4 text-foreground hover:opacity-70 transition-opacity disabled:opacity-40"
      >
        {status === 'loading' ? 'Enviando…' : 'Reenviar correo de confirmación'}
      </button>
      {status === 'error' && (
        <p className="text-xs text-red-600">{errorMsg}</p>
      )}
    </div>
  )
}
