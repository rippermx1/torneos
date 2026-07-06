# Contabilidad del producto — guía operativa

> Qué contabilidad lleva TorneosPlay, cómo la determina el código, y qué revisar
> en cada cierre mensual. Verificada contra `lib/accounting/model-a-report.ts`
> el 2026-07-06 (post escalera de premios + brackets + rakeback).
> Complementa `docs/roadmap-retencion-rentabilidad.md` (estrategia) y
> `docs/sii-setup-modelo-a.md` (configuración SII).

## 1. El criterio único (contabilidad efectiva, base cash)

Todo el modelo se reduce a una fórmula sobre **flujos reales de dinero**:

```
margen afecto      = cobros cash por inscripción − premios pagados − reembolsos
IVA débito         = 19/119 × margen afecto
resultado neto     = margen afecto − IVA débito
resultado operativo= resultado neto − comisión Flow neta (la plataforma la absorbe)
IVA a pagar        = IVA débito − IVA crédito de la factura Flow
```

- No depende del split contable 70/30 por inscripción (queda como referencia).
- El margen puede ser **negativo** en un mes (premios de torneos cobrados el mes
  anterior, freerolls): el IVA débito negativo es remanente a favor y se arrastra.
- Régimen vigente: **Modelo A** (`lib/tax/regime.ts`) — el comprobante Flow opera
  como boleta del cobro; no se emite DTE propio.

## 2. Mapa: evento del producto → efecto contable

| Evento | Efecto en el P&L | Dónde se ve |
|---|---|---|
| Inscripción pagada por Flow (cash) | + cobros efectivos | `efectivo_cobros_inscripcion` |
| Inscripción pagada con **crédito rakeback** | **NADA** (excluida de cobros: no entró cash; el costo del programa es este ingreso no percibido) | `credito_redimido` (informativa) |
| Premio pagado (escalera: **tramo alcanzado**) | − premios pagados | `efectivo_premios_pagados` |
| Premios no adjudicados (<3 finalistas) | quedan en el margen automáticamente (no se pagan) | `unclaimed` en snapshot |
| Premio de freeroll | − premios sin cobro asociado → margen negativo = **costo de marketing** (reduce IVA) | `efectivo_premios_pagados` |
| Torneo cancelado → **reversa Flow completada** | − reembolsos (en el período en que se completó) | `reversas_flow` |
| Refund de wallet ligado a torneo (legado) | − reembolsos | `efectivo_reembolsos` |
| Refund por retiro fallido | **NADA en P&L** (ajuste de pasivo, no reversa de venta) | `reembolsos_wallet` (informativa) |
| Reversa de pago **no asentable** (pagó pero no alcanzó cupo) | **NADA** (ese cobro nunca contó como venta) | — |
| **Rakeback otorgado** (7% al liquidar) | **NADA en P&L** (sería doble conteo; es pasivo) | `rakeback_otorgado` (informativa) |
| **Crédito expirado** (30 días FIFO) | NADA (breakage: el cash ya se contó al cobrar; solo baja el pasivo) | ledger |
| Retiro de premios aprobado | NADA en P&L (liquidación de pasivo) | `retiros_*` |
| Comisión Flow (absorbida) | − resultado operativo; su IVA es **crédito fiscal** | `flow_comision_neta_estimada`, `flow_iva_credito_estimado` |
| Brackets / divisiones | sin efecto contable | — |
| Torneos `is_test` | **excluidos del P&L** (sí cuentan en el pasivo de wallet, que refleja el ledger real) | — |

## 3. Ejemplo de un mes (números redondos)

Supuestos: 30 inscripciones cash × $3.000 (incluye 3 de un torneo que luego se
canceló y reembolsó vía Flow el mismo mes); 2 inscripciones adicionales pagadas
con crédito; premios pagados $31.500 (bolsa del tramo 15); rakeback otorgado 7%.

```
cobros cash            = 30 × 3.000            =  $90.000   (las 2 con crédito NO suman)
premios pagados        =                          $31.500
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
2. Verificar que la **conciliación** esté OK (4 invariantes automáticos):
   montos internos Flow · fee = neto + IVA por inscripción · todo pago `paid`
   tiene inscripción · cadena de saldos del wallet sin drift.
3. **F29**: usar `efectivo_iva_debito` como débito e IVA crédito de la **factura
   real de Flow** (la columna es estimación) → `efectivo_iva_a_pagar`.
4. Revisar **pasivos**: `saldo_wallet_cierre` (incluye créditos rakeback),
   `retiros_pendientes_cierre`, y crédito rakeback vivo (otorgado − redimido −
   expirado). El crédito vence a 30 días, así que está acotado.
5. Guardar el CSV como respaldo del período.

## 5. Pasivos que el sistema mantiene

- **Wallet** (premios por retirar + créditos): `saldo_wallet_cierre`. Los créditos
  NO son retirables (`wallet_withdrawable_balance` los excluye).
- **Premios comprometidos** (`prize_liability`): vista de solvencia. ⚠️ Pendiente
  conocido: usa el tramo BASE de la escalera → **subestima** el comprometido en
  torneos que cruzaron tramos (afecta monitoreo, no pagos).
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
