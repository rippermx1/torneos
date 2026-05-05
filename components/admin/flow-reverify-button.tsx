'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function FlowReverifyButton({ attemptId, token }: { attemptId: string; token: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const onClick = () => {
    setError(null)
    startTransition(async () => {
      const res = await fetch(`/api/admin/payments/${attemptId}/reverify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        setError(data.error ?? 'Error al reverificar')
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="text-xs border rounded-lg px-3 py-1.5 hover:bg-muted transition-colors disabled:opacity-50"
      >
        {pending ? 'Verificando…' : 'Reverificar'}
      </button>
      {error && <p className="text-xs text-red-600 max-w-[180px]">{error}</p>}
    </div>
  )
}
