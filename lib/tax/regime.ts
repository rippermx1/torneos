// ───────────────────────────────────────────────────────────────
// Régimen tributario activo para emisión de documentos.
//
// 'A' (Modelo A — interim de lanzamiento):
//   - Voucher Flow funciona como boleta electrónica.
//   - SII trata el monto total cobrado por Flow como venta gravada.
//   - IVA débito = 19% sobre cargado_pesos. IVA crédito = 19% de gastos.
//   - NO se encola dte_documents; LibreDTE no se invoca.
//   - Precondición SII: panel Flow + Mi SII configurados para vouchers.
//
// 'B' (Modelo B — destino post-validación):
//   - Plataforma opera en custodia (mandato civil).
//   - Sólo el platform_fee_gross_cents es venta gravada.
//   - Cada inscripción genera una boleta separada por el fee de servicio.
//   - Requiere LibreDTE + certificado digital + cron de emisión.
//
// El switch entre A y B es un cambio de constante. Toda la
// arquitectura DB (split prize_fund / platform_fee, dte_documents)
// ya está lista para el día que migremos a B.
// ───────────────────────────────────────────────────────────────

export type TaxRegime = 'A' | 'B'

export const TAX_REGIME: TaxRegime = 'A'

export function isModeloA(): boolean {
  return TAX_REGIME === 'A'
}

export function isModeloB(): boolean {
  return TAX_REGIME === 'B'
}
