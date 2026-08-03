# Contabilidad del producto — guía operativa

> Qué contabilidad lleva TorneosPlay, cómo la determina el código, y qué revisar
> en cada cierre mensual. Verificada contra `lib/accounting/model-a-report.ts`
> el 2026-08-03 (incluye trazabilidad bancaria de pagos de premios).
> Complementa `docs/roadmap-retencion-rentabilidad.md` (estrategia) y
> `docs/sii-setup-modelo-a.md` (configuración SII).

## 1. Dos vistas que no deben mezclarse

El sistema separa devengo y caja. La transferencia no vuelve a crear un gasto:

```
resultado devengado = cobros − premios adjudicados − reembolsos − costos
caja operativa      = cobros bancarios − transferencias − reversas − costos pagados
```

- `prize_credit` reconoce el premio adjudicado y el pasivo con el ganador.
- `withdrawal_requests.status = approved` sólo autoriza el pago.
- `withdrawal_requests.status = paid` registra la salida bancaria, referencia,
  evidencia y folio. Esa transferencia liquida el pasivo.
- El IVA y la forma de documentar la venta siguen siendo criterios que debe
  confirmar el contador; el reporte interno no reemplaza F29/F22.

## 1.b Principio "sin wallet" (alineación CMF, verificado 2026-07-06)

La plataforma opera como **compraventa de participaciones**: no mantiene cuentas
ni saldos de dinero de usuarios, no acepta depósitos ni recargas. Los premios son
**deuda por pagar** que se liquida por transferencia bancaria (no un medio de pago
interno: no se pueden gastar en inscripciones), el cobro es por el total adeudado
(no montos a elección), y las recompensas del rakeback son **promocionales**: no
comprables, no transferibles, no canjeables por efectivo, canjeables solo por
participaciones gratis y caducan a 30 días. El "ledger" interno
(`wallet_transactions`) es el registro contable de esas deudas y recompensas, no
una cuenta ofrecida al usuario (la UI y los T&C no exponen concepto de saldo).

## 2. Mapa: evento del producto → efecto contable

| Evento | Efecto en el P&L | Dónde se ve |
|---|---|---|
| Inscripción pagada por Flow (cash) | + cobros efectivos | `efectivo_cobros_inscripcion` |
| Inscripción pagada con **crédito rakeback** | **NADA** (excluida de cobros: no entró cash; el costo del programa es este ingreso no percibido) | `credito_redimido` (informativa) |
| Premio adjudicado (escalera: **tramo alcanzado**) | − gasto y + pasivo | `premios_acreditados`, `premios_devengados` |
| Premios no adjudicados (<3 finalistas) | quedan en el margen automáticamente (no se pagan) | `unclaimed` en snapshot |
| Premio de freeroll | − gasto promocional, sujeto a validación contable | `premios_devengados` |
| Torneo cancelado → **reversa Flow completada** | − reembolsos (en el período en que se completó) | `reversas_flow` |
| Refund de wallet ligado a torneo (legado) | − reembolsos | `efectivo_reembolsos` |
| Refund por retiro fallido | **NADA en P&L** (ajuste de pasivo, no reversa de venta) | `reembolsos_wallet` (informativa) |
| Reversa de pago **no asentable** (pagó pero no alcanzó cupo) | **NADA** (ese cobro nunca contó como venta) | — |
| **Rakeback otorgado** (7% al liquidar) | **NADA en P&L** (sería doble conteo; es pasivo) | `rakeback_otorgado` (informativa) |
| **Crédito expirado** (30 días FIFO) | NADA (breakage: el cash ya se contó al cobrar; solo baja el pasivo) | ledger |
| **Recompensa restituida** (canje en torneo luego cancelado) | NADA en P&L (repone el pasivo promocional; la inscripción canjeada sigue fuera de cobros) | `rakeback_otorgado` (informativa) |
| Pago autorizado | NADA en P&L; todavía no salió del banco | `retiros_aprobados` |
| Transferencia confirmada | NADA adicional en P&L; liquida pasivo y reduce caja | `retiros_pagados` + ledger de pagos |
| Comisión Flow (absorbida) | − resultado operativo; su IVA es **crédito fiscal** | `flow_comision_neta_estimada`, `flow_iva_credito_estimado` |
| Brackets / divisiones | sin efecto contable | — |
| Torneos `is_test` | **excluidos del P&L y del monto cobrable**; sus movimientos permanecen en el ledger sólo para pruebas | — |

## 3. Ejemplo de un mes (números redondos)

Supuestos: 30 inscripciones cash × $3.000 (incluye 3 de un torneo que luego se
canceló y reembolsó vía Flow el mismo mes); 2 inscripciones adicionales pagadas
con crédito; premios adjudicados $31.500 (bolsa del tramo 15); rakeback otorgado 7%.

```
cobros cash            = 30 × 3.000            =  $90.000   (las 2 con crédito NO suman)
premios adjudicados    =                          $31.500
reversas Flow          = 3 × 3.000             =   $9.000
margen afecto          = 90.000 − 31.500 − 9.000 = $49.500
IVA débito             = 19/119 × 49.500       ≈   $7.903
resultado neto         =                       ≈  $41.597
comisión Flow neta     ≈ 3,19% × 90.000        ≈   $2.871   (IVA crédito ≈ $545)
resultado operativo    ≈ 41.597 − 2.871        ≈  $38.726
IVA a pagar            ≈ 7.903 − 545           ≈   $7.358
rakeback otorgado      = 7% × 90.000           =   $6.300   (pasivo, no gasto)
```

## 4. Cierre mensual — checklist

1. Abrir `/admin/reports` (o descargar `/api/admin/reports/accounting.csv`).
2. Verificar que la **conciliación** esté OK (5 invariantes automáticos):
   montos internos Flow · fee = neto + IVA por inscripción · todo pago `paid`
   tiene inscripción · cadena de saldos sin drift · todo premio transferido tiene
   referencia bancaria, folio, vínculo al ledger y evidencia.
3. Entregar el CSV al contador y conciliar F29 con documentos reales. No declarar
   automáticamente desde la estimación interna sin el criterio profesional.
4. Revisar **pasivos**: `saldo_wallet_cierre` (incluye créditos rakeback),
   `retiros_pendientes_cierre`, y crédito rakeback vivo (otorgado − redimido −
   expirado). El crédito vence a 30 días, así que está acotado.
5. Descargar también `/api/admin/reports/payouts.csv` y cuadrar `retiros_pagados`
   con las cartolas de la cuenta bancaria de la SpA.

## 4.b Expediente de cada pago

- El comprobante bancario se guarda en el bucket privado `payout-proofs`, separado
  de `kyc-documents`.
- El ganador y el administrador pueden abrir el comprobante interno por folio;
  sólo administradores con MFA acceden a la evidencia bancaria original.
- El comprobante interno acredita el registro de pago, pero no es DTE ni reemplaza
  el documento emitido por el banco.

## 5. Pasivos que el sistema mantiene

- **Wallet** (premios por retirar + créditos): `saldo_wallet_cierre`. Los créditos
  NO son retirables (`wallet_withdrawable_balance` los excluye).
- **Premios comprometidos** (`prize_liability`): vista de solvencia calculada con
  el tramo vigente de la escalera y excluyendo torneos de prueba.
- **Créditos rakeback**: expiración FIFO 30 días vía cron (`expireStaleCredits`).
- Solvencia de la escalera: cada tramo se paga solo si inscritos ≥ su umbral y
  fondo ≤ 70% × entry × umbral → siempre cubierto por la recaudación. Nota: una
  inscripción con crédito ocupa cupo premiable sin cash de ESE torneo; solvente
  en agregado (el crédito provino de cash previo).

## 6. Puntos abiertos con el contador

1. **Criterio de boleta** (pendiente desde jun-2026): ¿se emite por el total de la
   inscripción o por el margen? El cálculo interno ya es unívoco; falta el
   criterio de emisión ante SII.
2. **Inscripciones con crédito**: no tienen voucher Flow (no hubo cobro). Nuestro
   criterio: no son venta afecta (el cash ya tributó al cobrarse originalmente).
   Confirmar si requieren algún documento.
3. **Confirmar el criterio cash-accurate del rakeback** (grant = pasivo sin
   asiento de gasto; costo = ingreso no percibido al redimir).
4. Tributación de premios para ganadores (mención F22 ya existente en las notas).
5. Confirmar conservación mínima de comprobantes bancarios y si corresponde una
   declaración jurada o certificado anual de premios.

## 7. Historial de decisiones

- 2026-06-16: IVA = contabilidad efectiva (decisión del dueño; elimina la
  ambigüedad del split 70/30).
- 2026-07-02: la plataforma **absorbe** la comisión Flow (checkout sin recargo);
  el reporte la descuenta del operativo y toma su IVA como crédito.
- 2026-07-02: rakeback cash-accurate (redenciones fuera de cobros; grant sin
  asiento).
- 2026-07-06: reembolsos efectivos = refunds de torneo + **reversas Flow
  completadas** (antes las reversas no se descontaban → margen sobreestimado);
  refunds por retiro fallido fuera del margen; torneos `is_test` fuera del P&L.
- 2026-08-03: autorización y transferencia pasan a ser estados separados; cada
  pago nuevo exige evidencia bancaria y genera folio de comprobante interno.
