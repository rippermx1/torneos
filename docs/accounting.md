# Contabilidad simple de TorneosPlay

## Modelo de salida a producción

El lanzamiento usa **Modelo A**:

- Cada inscripción pagada se cobra directamente en Flow.
- La plataforma no acepta recargas ni depósitos prepagados.
- El voucher/comprobante electrónico de Flow es la boleta electrónica cuando el
  modelo de emisión está declarado correctamente ante el SII.
- Para F29, la venta afecta se controla desde `flow_payment_attempts.status =
  'paid'` y el monto base es `charged_amount_cents`.

El modelo interno separa la economía del torneo:

- `prize_fund_contribution_cents`: reserva de premios de referencia.
- `platform_fee_gross_cents`: comisión bruta de plataforma con IVA incluido.
- `platform_fee_net_cents`: comisión neta de plataforma.
- `platform_fee_iva_cents`: IVA interno asociado al fee de plataforma.

Los premios publicados son fijos y no se recalculan al cierre. En Modelo A, esa
separación sirve para gestión y rentabilidad; la declaración mensual se concilia
contra el total cobrado por Flow.

## Reportes disponibles

### Panel admin

Ruta:

```text
/admin/reports
```

Muestra:

- venta afecta F29,
- base neta F29,
- IVA débito F29,
- comisión Flow estimada,
- reserva de premios de referencia,
- premios acreditados,
- saldo wallet de cierre,
- retiros pendientes,
- resultado operativo devengado estimado.

### CSV contable principal

Ruta:

```text
/api/admin/reports/accounting.csv
```

Columnas clave:

- `f29_venta_afecta_bruta_clp`: total bruto cobrado por Flow en pagos `paid`.
- `f29_base_neta_clp`: venta neta estimada (`bruto / 1,19`).
- `f29_iva_debito_clp`: IVA débito estimado.
- `flow_comision_neta_estimada_clp`: comisión Flow estimada al 3,19%.
- `flow_iva_credito_estimado_clp`: IVA crédito estimado sobre comisión Flow.
- `reserva_premios_ref_clp`: reserva interna de referencia; no aumenta los premios por inscritos.
- `premios_acreditados_clp`: premios fijos registrados en wallet.
- `saldo_wallet_cierre_clp`: obligación con usuarios al cierre del mes.
- `retiros_pendientes_cierre_clp`: solicitudes pendientes al cierre del mes.
- `resultado_operativo_devengado_est_clp`: referencia de gestión, no sustituto
  de la declaración tributaria.

La comisión e IVA de Flow son estimaciones operativas. Para F29 se deben cuadrar
contra la factura real de Flow y los demás documentos de compra.

### CSV de fee plataforma

Ruta:

```text
/api/admin/reports/finance.csv
```

Este CSV conserva el desglose interno de `entry_pool`. Es útil para medir
rentabilidad por comisiones de plataforma, pero no reemplaza el CSV contable
Modelo A.

## Checklist mensual F29

1. Descargar el reporte `accounting.csv`.
2. Descargar el libro/registro de ventas o reporte tributario desde Flow.
3. Conciliar pagos `paid`:
   - `flow_cobrado_bruto_clp` contra total bruto Flow.
   - `flow_pagos_pendientes` debe quedar en 0 o explicado por reconciliación.
4. Declarar ventas afectas usando:
   - `f29_venta_afecta_bruta_clp`,
   - `f29_base_neta_clp`,
   - `f29_iva_debito_clp`.
5. Registrar IVA crédito contra documentos reales:
   - factura de Flow,
   - hosting,
   - software,
   - otros gastos con respaldo tributario.
6. Revisar obligaciones:
   - `saldo_wallet_cierre_clp`,
   - `retiros_pendientes_cierre_clp`,
   - premios comprometidos en `/admin/reports`.

## Checklist anual F22

Para el contador:

- ventas netas: suma anual de `f29_base_neta_clp`;
- premios: revisar `premios_acreditados_clp` y retiros efectivamente pagados;
- comisiones Flow: usar facturas reales, no sólo la estimación;
- freerolls: clasificar como gasto promocional/marketing si corresponde;
- otros costos: hosting, software, servicios profesionales y gastos bancarios;
- régimen sugerido inicial: Pro Pyme General, si cumple requisitos.

## Controles de salud

Ejecutar:

```bash
npm run analyze:business
```

Ese script alerta si:

- hay pagos Flow pendientes;
- los retiros pendientes superan la obligación wallet;
- hay torneos pagados activos con riesgo de pérdida al mínimo.

## Guardia de rentabilidad

En el modelo actual, cada inscripción pagada se divide así:

```text
75% reserva de premios de referencia
25% fee bruto plataforma, IVA incluido
```

El margen neto de plataforma por inscripción es aproximadamente:

```text
25% / 1,19 = 21,01%
```

El cargo de procesamiento de Flow se cobra al usuario de forma visible y se
calcula para cubrir una comisión estimada de tarjeta con abono al día hábil
siguiente.

Reglas prácticas:

- Express y Standard: formatos principales de operación.
- Elite: usar sólo cuando haya demanda suficiente.
- Freeroll: costo de adquisición, no torneo rentable.
