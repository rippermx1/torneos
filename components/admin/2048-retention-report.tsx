'use client'
import { useEffect, useState } from 'react'
import { parsePlayer2048RetentionReport, type Player2048RetentionReport, type Player2048RetentionMetric } from '@/lib/game/player-2048-retention'

const metric = (value: Player2048RetentionMetric) => value.rate === null ? 'Sin cohorte madura' : `${(value.rate * 100).toLocaleString('es-CL', { maximumFractionDigits: 1 })}% · ${value.returnedAccounts}/${value.eligibleAccounts}`
export function Retention2048ReportView({ initialFrom, initialTo }: { initialFrom: string; initialTo: string }) {
  const [from, setFrom] = useState(initialFrom), [to, setTo] = useState(initialTo)
  const [selection, setSelection] = useState({ from: initialFrom, to: initialTo, generation: 0 })
  const [report, setReport] = useState<Player2048RetentionReport | null>(null)
  const [loading, setLoading] = useState(true), [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    let alive = true
    void (async () => {
      try {
        const response = await fetch(`/api/admin/reports/2048-retention?from=${selection.from}&to=${selection.to}`, {
          cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
        })
        const data = response.ok ? parsePlayer2048RetentionReport(await response.json()) : null
        if (!data || data.from !== selection.from || data.to !== selection.to) throw new Error('Report unavailable')
        if (alive) setReport(data)
      } catch { if (alive) setError('No se pudo cargar el reporte. Reintenta; el desafío gratuito sigue disponible.') }
      finally { if (alive) setLoading(false) }
    })()
    return () => { alive = false; controller.abort() }
  }, [selection])
  const download = () => {
    if (!report) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = '2048-retorno-cuentas.json'; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <div className="space-y-5 max-w-6xl">
    <h1 className="text-2xl font-bold">Retorno de cuentas · 2048</h1>
    <p>Cuentas con al menos un movimiento válido declarado en práctica libre o desafío diario. Una cuenta se cuenta una vez por día de Chile, también si juega desde varios dispositivos.</p>
    <p className="text-sm text-muted-foreground">La cohorte comienza en el primer día activo conocido desde esta recopilación. D1 y D7 miden regreso en el día exacto; su denominador incluye sólo fechas objetivo que ya terminaron. Cuentas y visitas anónimas se analizan por separado.</p>
    <form className="flex flex-wrap items-end gap-3" onSubmit={event => {
      event.preventDefault(); setLoading(true); setError(''); setReport(null)
      setSelection(value => ({ from, to, generation: value.generation + 1 }))
    }}>
      <label className="grid gap-1">Desde<input type="date" required value={from} onChange={event => setFrom(event.target.value)} className="rounded border p-2" /></label>
      <label className="grid gap-1">Hasta<input type="date" required value={to} onChange={event => setTo(event.target.value)} className="rounded border p-2" /></label>
      <button type="submit" className="rounded border px-4 py-2" disabled={loading}>Consultar / reintentar</button>
    </form>
    <p className="text-sm">Rango máximo: 90 días. Las visitas sin sesión se conservan sólo en su navegador; no se convierten en cuentas ni en personas únicas.</p>
    {loading && <p role="status">Cargando retorno de cuentas…</p>}
    {error && <p role="alert">{error}</p>}
    {report && <>
      <div className="grid gap-3 sm:grid-cols-3">
        <p className="rounded border p-4">Cuentas en estas cohortes: <strong>{report.totals.accounts}</strong></p>
        <p className="rounded border p-4">D1: <strong>{metric(report.totals.day1)}</strong></p>
        <p className="rounded border p-4">D7: <strong>{metric(report.totals.day7)}</strong></p>
      </div>
      <p>Fecha de corte: {report.asOfChileDay} · America/Santiago. Porcentaje · cuentas que regresaron / cuentas elegibles.</p>
      {!report.totals.accounts && <p>Aún no hay cuentas con juego registrado en estas cohortes.</p>}
      <div className="overflow-x-auto"><table className="w-full text-sm text-left">
        <caption className="text-left pb-2">Cohortes por primer día de juego conocido</caption>
        <thead><tr><th className="p-2" scope="col">Cohorte</th><th className="p-2" scope="col">Cuentas</th><th className="p-2" scope="col">D1</th><th className="p-2" scope="col">D7</th></tr></thead>
        <tbody>{report.cohorts.map(row => <tr key={row.cohortDay} className="border-t"><th className="p-2" scope="row">{row.cohortDay}</th><td className="p-2">{row.accounts}</td><td className="p-2">{metric(row.day1)}</td><td className="p-2">{metric(row.day7)}</td></tr>)}</tbody>
      </table></div>
      <button type="button" className="rounded border px-4 py-2" onClick={download}>Descargar reporte JSON</button>
      <p className="text-sm text-muted-foreground">Actividad declarada por el cliente: no prueba juego humano, integridad competitiva, adquisición ni ingresos. Una persona puede tener más de una cuenta.</p>
    </>}
  </div>
}
