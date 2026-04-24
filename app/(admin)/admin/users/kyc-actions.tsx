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
  const router = useRouter()

  async function updateKyc(action: 'approve' | 'reject') {
    setError(null)
    startTransition(async () => {
      const res = await fetch(`/api/admin/users/${userId}/kyc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
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
