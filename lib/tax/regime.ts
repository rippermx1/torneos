// ───────────────────────────────────────────────────────────────
// Régimen tributario canónico para emisión de documentos.
//
// Modelo A:
//   - Voucher Flow funciona como boleta electrónica.
//   - SII trata el monto total cobrado por Flow como venta gravada.
//   - IVA débito = 19% sobre cargado_pesos. IVA crédito = 19% de gastos.
//   - NO se encola dte_documents; LibreDTE no se invoca.
//   - Precondición SII: panel Flow + Mi SII configurados para vouchers.
// La plataforma no opera en custodia ni por mandato: el premio es gasto propio
// y no reduce la base imponible de la inscripción.
// ───────────────────────────────────────────────────────────────

export type TaxRegime = 'A'

export const TAX_REGIME: TaxRegime = 'A'

export function isModeloA(): boolean {
  return TAX_REGIME === 'A'
}
