'use client'

import { useRef, useState, type ReactNode, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export function CashForm({ action, id, title, children }: { action: string; id?: string; title: string; children?: ReactNode }) {
  const router = useRouter(), formRef = useRef<HTMLFormElement>(null)
  const [pending, setPending] = useState(false), [message, setMessage] = useState(''), [retryId, setRetryId] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage('')
    try {
      const body = new FormData(event.currentTarget), key = `cash:${action}`
      const requestId = id ?? sessionStorage.getItem(key) ?? crypto.randomUUID()
      if (!id) sessionStorage.setItem(key, requestId)
      setRetryId(requestId); body.set('id', requestId); body.set('action', action)
      for (const field of ['date', 'due']) {
        const value = body.get(field)
        if (typeof value === 'string' && value) body.set(field, new Date(value).toISOString())
      }
      const response = await fetch('/api/admin/cash', { method: 'POST', body }), result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'No se pudo confirmar el registro')
      if (!id) sessionStorage.removeItem(key)
      setRetryId(''); setMessage('Registro confirmado. Revisa el historial.'); formRef.current?.reset(); router.refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Respuesta incierta; consulta el historial y conserva el identificador') }
    finally { setPending(false) }
  }
  return <form ref={formRef} onSubmit={submit} className="space-y-3 rounded-xl border p-4">
    <h3 className="font-semibold">{title}</h3>{children}
    <label className="block text-sm">Justificación<textarea name="note" required minLength={10} maxLength={2000} className="mt-1 block w-full rounded border bg-background p-2" /></label>
    <button disabled={pending} className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-50">{pending ? 'Comprobando…' : title}</button>
    {message && <p role="status" className="text-sm">{message}</p>}
    {retryId && <p className="break-all text-xs">Identificador conservado: {retryId}. Si la respuesta es incierta, consulta el historial antes de reintentar con los mismos datos y archivos.</p>}
  </form>
}
