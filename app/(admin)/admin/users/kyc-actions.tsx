'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { KycStatus } from '@/types/database'

interface Props {
  userId: string
  currentStatus: KycStatus
}

export function KycActions({ userId, currentStatus }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const router = useRouter()

  async function updateKyc(action: 'approve' | 'reject') {
    setError(null)
    if (action === 'reject' && !notes.trim()) {
      setError('Nota obligatoria')
      return
    }
    startTransition(async () => {
      const res = await fetch(`/api/admin/users/${userId}/kyc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, notes: notes.trim() || null }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'Error al actualizar')
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-1.5 items-end self-start">
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Nota de revisión"
        className="w-32 border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-foreground/20"
      />
      {currentStatus !== 'approved' && (
        <button
          onClick={() => updateKyc('approve')}
          disabled={isPending}
          className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
        >
          Aprobar
        </button>
      )}
      {currentStatus !== 'rejected' && (
        <button
          onClick={() => updateKyc('reject')}
          disabled={isPending}
          className="text-xs px-3 py-1.5 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
        >
          Rechazar
        </button>
      )}
      {error && <p className="text-xs text-red-600 text-right max-w-[120px]">{error}</p>}
    </div>
  )
}
