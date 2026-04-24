'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  defaults: { username: string; full_name: string }
}

export function ProfileEditForm({ defaults }: Props) {
  const [username, setUsername] = useState(defaults.username)
  const [fullName, setFullName] = useState(defaults.full_name)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleCancel() {
    setUsername(defaults.username)
    setFullName(defaults.full_name)
    setError(null)
    setEditing(false)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (username.trim().length < 3) {
      setError('El usuario debe tener al menos 3 caracteres.')
      return
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      setError('Solo letras, números y guión bajo.')
      return
    }

    startTransition(async () => {
      const res = await fetch('/api/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), full_name: fullName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Error al guardar.')
        return
      }
      setEditing(false)
      router.refresh()
    })
  }

  return (
    <div className="border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Información personal</p>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-muted-foreground hover:text-foreground border px-2.5 py-1 rounded-lg transition-colors"
          >
            Editar
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="username" className="text-sm font-medium">Nombre de usuario</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={30}
              className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-foreground/20"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="full_name" className="text-sm font-medium">Nombre completo</label>
            <input
              id="full_name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              maxLength={80}
              className="w-full border rounded-xl px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-foreground/20"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 bg-foreground text-background py-2.5 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isPending ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={isPending}
              className="flex-1 border py-2.5 rounded-xl text-sm hover:bg-muted transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-3 text-sm">
          <Row label="Usuario" value={defaults.username} />
          <Row label="Nombre" value={defaults.full_name || '—'} />
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  )
}
