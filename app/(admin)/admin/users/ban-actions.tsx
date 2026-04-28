'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function BanActions({ userId, isBanned, isAdmin }: { userId: string; isBanned: boolean; isAdmin: boolean }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  if (isAdmin) return null

  async function toggleBan() {
    const action = isBanned ? 'desbanear' : 'banear'
    const confirmed = window.confirm(
      isBanned
        ? '¿Desbloquear esta cuenta? El usuario podrá volver a jugar.'
        : '¿Banear esta cuenta? El usuario no podrá inscribirse ni jugar. Sus partidas activas serán invalidadas.'
    )
    if (!confirmed) return

    setLoading(true)
    try {
      const res = await fetch(`/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ban: !isBanned, reason: `Acción manual admin (${action})` }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(`Error: ${data.error}`)
      } else {
        router.refresh()
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={toggleBan}
      disabled={loading}
      className={`text-xs px-2 py-1 rounded border font-medium transition-colors disabled:opacity-50 ${
        isBanned
          ? 'border-green-300 text-green-700 hover:bg-green-50'
          : 'border-red-300 text-red-700 hover:bg-red-50'
      }`}
    >
      {loading ? '...' : isBanned ? 'Desbanear' : 'Banear'}
    </button>
  )
}
