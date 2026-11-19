# Módulo contable de TorneosPlay

La política detallada está en
[`docs/contabilidad-producto.md`](./contabilidad-producto.md). Este archivo resume
qué ofrece técnicamente el módulo administrativo.

## Fuentes y reportes

- `/admin/accounting`: gastos/aportes, liquidaciones y facturas Flow, cartola,
  conciliación y cierre versionado. [Backlog](CONTABILIDAD-BACKLOG.md) y
  [entrega/activación](CONTABILIDAD-IMPLEMENTACION.md).

- `/admin/reports`: F29 interno, contribución, pasivos, conciliaciones y balance
  de comprobación.
- `/api/admin/reports/accounting.csv`: cierre mensual de ventas, IVA, notas de
  crédito, premios y pagos.
- `/api/admin/reports/journal.csv?period=AAAA-MM`: líneas del libro diario.
- `/api/admin/reports/payouts.csv`: expediente de pagos a ganadores.
- `/admin/refunds`: control y registro de Notas de Crédito Electrónicas.

## Criterios invariantes

- La inscripción completa es venta afecta con precio final IVA incluido.
- El premio es gasto separado y no rebaja el IVA de la venta.
- Una devolución sólo rebaja IVA cuando su nota de crédito está registrada.
- Una comisión Flow estimada no constituye crédito fiscal confirmado.
- El premio se devenga al adjudicarse; la transferencia sólo paga el pasivo.
- Torneos de prueba y pagos simulados se excluyen de los reportes fiscales.

## Alcance actual

El libro es de doble partida, inmutable e idempotente. Registra cobros, ingreso
diferido, reconocimiento de ingreso, premios, devoluciones, notas de crédito y
transferencias. La nueva entrega añade documentos generales, cartola CSV,
conciliación manual y cierres versionados; exige activar su migración junto al código.
La conexión automática a bancos/Flow/RCV no está implementada. Los cierres requieren
documentos originales y verificación manual del responsable.
