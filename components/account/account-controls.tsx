'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function AccountControls() {
  const [message,setMessage] = useState(''), [busy,setBusy] = useState(false)
  const router = useRouter()
  async function revoke() {
    setBusy(true); setMessage('')
    try {
      const r = await fetch('/api/account/sessions/revoke', { method: 'POST' }), data = await r.json()
      if (!r.ok) { setMessage(data.error ?? 'No se pudo confirmar la revocación'); return }
      router.push('/sign-in'); router.refresh()
    } catch { setMessage('No se pudo confirmar el resultado. Intenta iniciar sesión.') }
    finally { setBusy(false) }
  }
  return <div className="space-y-3 border rounded-xl p-4">
    <h2 className="font-semibold">Seguridad y datos</h2>
    <p className="text-sm text-muted-foreground">Cierra las sesiones de todos tus dispositivos. Necesitarás iniciar sesión de nuevo.</p>
    <button onClick={revoke} disabled={busy} className="border rounded-lg px-3 py-2 text-sm">{busy?'Cerrando…':'Cerrar todas mis sesiones'}</button>
    <div className="flex flex-wrap gap-4 text-sm underline"><a href="/api/account/export">Descargar perfil e historial</a><a href="/support">Mis casos y solicitudes de datos</a><a href="/sign-in/forgot">Recuperar contraseña</a></div>
    {message && <p role="alert">{message}</p>}
  </div>
}
