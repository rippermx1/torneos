'use client'

import { useRouter } from 'next/navigation'

interface Props {
  status: 'success' | 'failure' | 'pending'
}

const CONFIG = {
  success: {
    bg: 'bg-green-50 border-green-200',
    text: 'text-green-800',
    title: '¡Pago recibido!',
    desc: 'Tu saldo se acreditará en unos segundos.',
  },
  pending: {
    bg: 'bg-amber-50 border-amber-200',
    text: 'text-amber-800',
    title: 'Pago pendiente',
    desc: 'Tu pago está siendo procesado. Te notificaremos cuando se acredite.',
  },
  failure: {
    bg: 'bg-red-50 border-red-200',
    text: 'text-red-800',
    title: 'Pago rechazado',
    desc: 'No se pudo procesar tu pago. Intenta de nuevo.',
  },
}

export function DepositBanner({ status }: Props) {
  const router = useRouter()
  const c = CONFIG[status]

  return (
    <div className={`border rounded-xl p-4 flex items-start justify-between gap-3 ${c.bg}`}>
      <div className={c.text}>
        <p className="font-semibold">{c.title}</p>
        <p className="text-sm mt-0.5">{c.desc}</p>
      </div>
      <button
        onClick={() => router.replace('/wallet')}
        className={`text-xs underline shrink-0 mt-0.5 ${c.text}`}
      >
        Cerrar
      </button>
    </div>
  )
}
