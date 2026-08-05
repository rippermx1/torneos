# Contabilidad canónica de TorneosPlay

Vigente desde el 4 de agosto de 2026. Esta es la fuente de verdad interna para
el producto, el panel financiero y el libro contable. Debe conciliarse cada mes
con el Registro de Compras y Ventas (RCV), los documentos de Flow y el F29 que
prepare la empresa con su contador.

## 1. Sustancia del negocio

La empresa organiza el torneo y vende al usuario una inscripción individual,
no transferible, para competir bajo condiciones publicadas. No recibe depósitos,
no custodia dinero de terceros, no mantiene una billetera de libre disposición y
no administra un pozo común de los jugadores.

Consecuencia contable y tributaria:

- El precio completo de la inscripción es una venta de la empresa.
- El precio publicado al consumidor es final e incluye IVA.
- El premio es un gasto y una obligación propia de la empresa; no reduce la base
  imponible de la inscripción.
- Los campos históricos `prize_fund_*` y `platform_fee_*` son métricas internas
  de presupuesto y contribución, no dos ventas ni una relación de custodia.
- Llamar a la inscripción "ticket" no cambia la sustancia tributaria o legal.

## 2. Ejemplo obligatorio: inscripción de $1.000

Si el precio publicado y cobrado es $1.000 CLP, esos $1.000 ya contienen IVA:

| Concepto | CLP por inscripción |
|---|---:|
| Precio final cobrado | $1.000,00 |
| Venta neta (`1.000 / 1,19`) | $840,34 |
| IVA débito incluido | $159,66 |
| Presupuesto máximo de premios (55% del bruto mínimo) | $550,00 |
| Comisión Flow neta estimada (3,19%) | $31,90 |
| Contribución devengada estimada | $258,44 |

La contribución corresponde a `venta neta - premio - comisión Flow neta`. No
incluye costos fijos, marketing, contador, software ni impuesto a la renta.

Si la intención comercial fuera recibir $1.000 netos antes de IVA por la venta,
el precio final informado al consumidor tendría que ser $1.190. Esa no es la
configuración actual.

## 3. Política de documentos tributarios

El sistema usa el modelo de emisión en que el voucher de pago electrónico de
Flow respalda la venta completa, siempre que la empresa haya declarado y
configurado ese modelo ante el SII. No se debe emitir además otra boleta por el
mismo cobro: eso duplicaría la venta documentada.

Una devolución Flow y una nota de crédito son hechos relacionados, pero no
idénticos:

- Al completarse la devolución, se reconoce la reversa económica.
- El IVA sólo se rebaja en el período en que se registra la Nota de Crédito
  Electrónica correspondiente.
- `/admin/refunds` deja la devolución en estado "N/C pendiente" hasta que el
  administrador registra folio y fecha.
- Toda devolución completada sin N/C bloquea la conciliación mensual como
  observación pendiente.

La comisión de Flow se calcula como estimación de gestión. Su IVA no se descuenta
automáticamente del F29: sólo se reconoce como crédito fiscal al conciliar la
factura real de Flow en el RCV.

Referencias oficiales:

- [SII: IVA aplicable a servicios](https://www.sii.cl/noticias/2022/211222noti01aav.htm)
- [SII: voucher como boleta electrónica](https://www.sii.cl/destacados/boleta_electronica_voucher/index.html)
- [SII: instrucciones del F29](https://www.sii.cl/servicios_online/instrucciones_f29_20241112.pdf)
- [Flow: preguntas sobre voucher, boleta y reversas](https://web.flow.cl/es-cl/ayuda/)
- [Flow: tarifas](https://web.flow.cl/es-cl/tarifas/)

## 4. Libro de doble partida

El journal en `accounting_journal_entries` y `accounting_postings` es inmutable,
idempotente y siempre debe cuadrar Debe = Haber. Sólo el backend administrativo
puede leerlo. Los eventos principales son:

| Evento | Debe | Haber |
|---|---|---|
| Cobro confirmado | Flow por liquidar (bruto) | IVA débito + ingreso diferido neto |
| Torneo completado | Ingreso diferido neto | Ingreso neto por inscripciones |
| Premio adjudicado | Gasto por premios | Premios por pagar |
| Transferencia al ganador | Premios por pagar | Banco |
| Devolución Flow | Devolución/ingreso diferido + IVA N/C pendiente | Flow por liquidar |
| N/C registrada | IVA débito por pagar | IVA N/C pendiente |

Las comisiones Flow se registran en asientos separados marcados como
`is_estimate=true`. No deben confundirse con movimientos confirmados.

El libro aún requiere conciliación externa de las liquidaciones efectivas de
Flow contra la cartola bancaria. Hasta incorporar un importador de liquidaciones
y facturas, `Flow por liquidar` es una cuenta de control, no el saldo bancario.

## 5. Devengo, pasivo y pago de premios

El gasto nace cuando el torneo termina y el resultado adjudica el premio. En ese
momento se crea el pasivo con el ganador. Aprobar una solicitud no crea otro
gasto; transferir sólo liquida el pasivo.

Cada transferencia debe:

1. Corresponder al titular cuyo RUT y nombre fueron aprobados en KYC.
2. Salir desde la cuenta bancaria de la empresa.
3. Registrar referencia bancaria, folio interno, fecha y monto.
4. Guardar la evidencia en el bucket privado `payout-proofs`, separado de KYC.
5. Poder conciliarse con `/api/admin/reports/payouts.csv` y la cartola bancaria.

El comprobante interno acredita la trazabilidad del pago, pero no reemplaza el
comprobante del banco ni es por sí mismo un documento tributario.

## 6. Cierre mensual F29

1. Abrir `/admin/reports` y escoger el período.
2. Exigir conciliación sin diferencias y Debe = Haber.
3. Descargar `accounting.csv`, `journal.csv` y `payouts.csv`.
4. Conciliar venta bruta, cantidad de vouchers e IVA débito con Flow y el RCV.
5. Resolver todos los reembolsos marcados "N/C pendiente".
6. Incorporar IVA crédito sólo desde facturas reales aceptadas en el RCV.
7. Conciliar transferencias de premios y liquidaciones Flow con la cartola.
8. Entregar el paquete al contador; el panel no envía ni reemplaza el F29.

## 7. Exclusiones y legado

- Torneos `is_test` y pagos `simulation` no entran al P&L ni al F29 interno.
- Las recompensas acumulables están desactivadas para el piloto. Los créditos ya
  otorgados siguen canjeables para no desconocer obligaciones existentes.
- `wallet_transactions` se conserva como subledger técnico de premios y créditos
  históricos; no representa una billetera financiera ofrecida al usuario.
- `dte_documents` queda como legado sin emisión automática. Reactivarlo exigiría
  un rediseño jurídico, contractual, documental y de pagos; no un cambio de flag.

## 8. Pendientes que requieren validación profesional

- Confirmar por escrito con el contador el modelo de voucher elegido en Flow y
  su reflejo exacto en RCV/F29 antes del primer cobro real.
- Definir el tratamiento anual de premios para la empresa y los antecedentes que
  se entregarán a ganadores, según monto y calidad tributaria de cada receptor.
- Confirmar giro, régimen de renta y deducibilidad documental de premios.
- Obtener revisión jurídica de competencia de habilidad y bases del torneo antes
  de adquirir usuarios con premios en dinero.
