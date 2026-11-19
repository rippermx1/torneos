import { clpToCents } from './operations'

/** Portable cartola format. Reject malformed rows before atomic DB import. */
export function parseBankCsv(csv: string) {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false; let closedQuote = false
  const input = csv.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  for (let i = 0; i < input.length; i++) {
    const c = input[i]
    if (closedQuote && c !== ',' && c !== '\n') throw new Error('Texto después de comillas CSV.')
    if (c === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i++ }
      else if (!quoted && cell !== '') throw new Error('Comillas CSV inválidas.')
      else { closedQuote = quoted; quoted = !quoted }
    } else if (!quoted && (c === ',' || c === '\n')) {
      row.push(cell); cell = ''; closedQuote = false
      if (c === '\n') { if (row.some(Boolean)) rows.push(row); row = [] }
    } else cell += c
  }
  if (quoted) throw new Error('Comillas CSV sin cerrar.')
  row.push(cell); if (row.some(Boolean)) rows.push(row)
  if (rows.shift()?.join(',') !== 'fecha_iso,referencia,monto_clp,respaldo') throw new Error('Columnas requeridas: fecha_iso,referencia,monto_clp,respaldo')
  if (!rows.length || rows.length > 1000) throw new Error('Importe entre 1 y 1000 filas.')
  const references = new Set<string>()
  return rows.map((fields, i) => {
    if (fields.length !== 4) throw new Error(`Fila ${i + 2}: se requieren cuatro campos.`)
    const [date, reference, amount, evidence] = fields.map((f) => f.trim())
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(date) || !Number.isFinite(Date.parse(date))) throw new Error(`Fila ${i + 2}: fecha ISO con zona horaria requerida.`)
    if (!reference || reference.length > 160 || evidence.length < 3 || evidence.length > 500 || references.has(reference)) throw new Error(`Fila ${i + 2}: referencia duplicada o respaldo inválido.`)
    references.add(reference)
    const amount_cents = clpToCents(amount)
    if (!amount_cents) throw new Error(`Fila ${i + 2}: monto cero.`)
    return { occurred_at: new Date(date).toISOString(), reference, amount_cents, evidence }
  })
}
