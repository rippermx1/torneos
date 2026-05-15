'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function RefundRetryButton({ refundId }: { refundId: string }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const router = useRouter()

  async function handleRetry() {
    if (!confirm('¿Reintentar esta reversa Flow?')) return
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(`/api/admin/refunds/${refundId}/retry`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setResult(`Error: ${data.error}`)
      } else {
        setResult('✓ Reintento enviado')
        router.refresh()
      }
    } catch {
      setResult('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  if (result) {
    return (
      <span className={`text-xs ${result.startsWith('Error') ? 'text-red-600' : 'text-green-700'}`}>
        {result}
      </span>
    )
  }

  return (
    <button
      onClick={handleRetry}
      disabled={loading}
      className="text-xs border border-amber-300 text-amber-700 rounded-lg px-3 py-1.5 hover:bg-amber-50 transition-colors disabled:opacity-50 whitespace-nowrap"
    >
      {loading ? 'Enviando...' : 'Reintentar'}
    </button>
  )
}
