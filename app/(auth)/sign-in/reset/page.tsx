'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 12 || password.length > 128) {
      setError('La contraseña debe tener entre 12 y 128 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/account/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) })
      const result = await response.json()
      if (!response.ok) { setError(result.error ?? 'No se pudo actualizar la contraseña.'); return }
      router.push('/sign-in?password=updated')
      router.refresh()
    } catch { setError('No se pudo confirmar el cambio. Intenta iniciar sesión antes de repetir.') }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">Nueva contraseña</h1>
          <p className="text-sm text-muted-foreground">Elige una contraseña segura</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium">Nueva contraseña</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 12 caracteres"
              required
              autoComplete="new-password"
              className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="confirm" className="text-sm font-medium">Confirmar contraseña</label>
            <input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repite la contraseña"
              required
              autoComplete="new-password"
              className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
            />
          </div>

          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-foreground text-background py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? 'Guardando…' : 'Guardar contraseña'}
          </button>
        </form>
      </div>
    </div>
  )
}
