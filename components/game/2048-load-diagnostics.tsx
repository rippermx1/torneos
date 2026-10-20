'use client'
import type { Load2048Diagnostics } from '@/lib/game/2048-load-diagnostics'

type Snapshot = ReturnType<Load2048Diagnostics['snapshot']>
const labels = { loading: 'En curso', ready: 'Juego listo', error: 'Error de carga', timeout: 'Tiempo de espera agotado', inconclusive: 'Sin resultado confirmado' }

export function Load2048DiagnosticsView({ snapshot, currentId, onExport }: {
  snapshot: Snapshot | null; currentId: string | null; onExport: () => void
}) {
  const current = snapshot?.entries.find(entry => entry.id === currentId)
  return <details className="rounded-lg border p-3 text-sm space-y-2">
    <summary className="cursor-pointer font-medium">Diagnóstico de carga de 2048</summary>
    <p>Registro local desde que se prepara el juego. Puedes descargarlo aunque Unity no termine de cargar. No mide visitas previas, personas ni retorno.</p>
    <p>Esta carga: {current ? labels[current.result] : 'Preparando diagnóstico…'}.
      {current?.durationMs !== null && current?.durationMs !== undefined && ` Duración observada: ${(current.durationMs / 1000).toLocaleString('es-CL', { maximumFractionDigits: 1 })} s.`}</p>
    {snapshot && snapshot.storageStatus !== 'ready' && <p>El guardado del diagnóstico no está disponible. La descarga conserva lo observado en esta pestaña.</p>}
    {snapshot && (snapshot.truncated || snapshot.observationGap) && <p>La cobertura del diagnóstico es incompleta; puede faltar evidencia anterior.</p>}
    <p>Una carga inconclusa no confirma abandono. Los movimientos se consultan desde el registro existente; cargar o reintentar no acredita juego.</p>
    <button type="button" className="rounded border px-3 py-2" disabled={!snapshot} onClick={onExport}>Descargar diagnóstico de carga</button>
  </details>
}
