# Capacidad contable de TorneosPlay

Esta auditoría describe el estado anterior a la implementación. Correcciones,
backlog y validación posterior: [entrega contable](CONTABILIDAD-IMPLEMENTACION.md).

Evaluación del 5 de octubre de 2026. Alcance: registro preciso de operaciones, cierre mensual y herramientas para la contabilidad de la empresa. El propietario confirmó en esta conversación que todavía no hay ventas.

## Dictamen

**Cobertura parcial.** La plataforma tiene un subledger operativo y un libro de doble partida aprovechables para torneos, pero los reportes actuales presentan defectos de integridad y de corte mensual. Además, faltan herramientas para conciliar liquidaciones/banco y registrar los gastos generales de la empresa. No debe utilizarse como único sistema de contabilidad general ni como cierre fiscal autónomo.

No hace falta sustituir todo lo existente. Conviene corregir los reportes, mantener el registro propio de torneos y conectarlo con la contabilidad general que prepare el contador. La cuenta Banco y un balance que cuadra no demuestran que se hayan registrado todos los movimientos de la empresa.

## Cobertura encontrada

| Necesidad | Herramienta en el repositorio | Evaluación |
|---|---|---|
| Cobros e inscripciones | Flow, registros por usuario/torneo, estado e identificadores del cobro | Implementado; operación real no comprobada en esta revisión |
| Libro de doble partida | Plan de cuentas, journal, postings, clave única por evento, validación de Debe/Haber | Buena base técnica; tablas y triggers sólo revisados como código |
| Protección y trazabilidad | Journal sin UPDATE/DELETE por trigger, funciones privadas, vistas invoker y SELECT restringido; APIs con MFA | Implementado en código; permisos de una DB desplegada no auditados |
| Ingreso diferido | Cobro a ingreso diferido; reconocimiento al completar torneo | Correcto en el diseño del journal; el resumen mensual no sigue el mismo corte |
| Premios | Adjudicación separada de autorización y transferencia; referencia, folio, evidencia privada | Implementado; comprobante no sustituye conciliación con banco |
| IVA de ventas | Precio completo con IVA incluido, extracción neto/débito | Implementado; documentación real y declaración externa pendientes |
| Devoluciones y notas de crédito | Estado económico separado de folio/fecha de N/C y bitácora del administrador | Parcial: registro manual, no emisión/verificación tributaria automática |
| Comisiones Flow | Provisiones identificadas como estimadas; sin deducir automáticamente IVA estimado en F29 | Parcial: falta sustituir/conciliar con facturas y liquidaciones reales |
| Exportaciones | accounting.csv, journal.csv, payouts.csv, finance.csv | Parcial: libro diario truncado; otros reportes no equivalen a cierre integral |
| Gastos de la empresa | No se encontró flujo de proveedores, facturas de compra y gastos generales | No cubierto como módulo operativo completo |
| Banco y liquidaciones Flow | Cuenta Banco en journal y referencias de pagos de premios | No se encontró importación/matching completo de abonos y cartola |
| Cierre de período | Reportes dinámicos, controles internos y balance por período | No se encontró cierre aprobado/bloqueado, snapshot versionado o reapertura controlada |
| Balance financiero y resultado completo | Balance de movimientos por mes y contribución de torneos | No equivalen a balance general acumulado, flujo de caja ni utilidad neta de empresa |

Fuentes principales: `docs/accounting.md`, `docs/contabilidad-producto.md`, `lib/accounting/*`, APIs de reportes/refunds/payouts y las migraciones del journal y sus adaptadores. No se asignan porcentajes artificiales de cobertura.

## Problemas reproducidos

### A. La exportación del libro diario pierde líneas

`lib/accounting/ledger.ts:53` aplica `.limit(300)` a las líneas del journal. `app/api/admin/reports/journal.csv/route.ts:14` exporta ese mismo resultado. El balance se calcula desde otra vista agregada, por lo que puede mostrar Debe = Haber mientras el CSV está incompleto.

Reproducción con las funciones actuales y un cliente sintético que respeta el límite: 500 líneas disponibles, 300 descargadas, `balanced: true`. Pueden omitirse también partes de un asiento al cortar por líneas. Debe separarse el límite de visualización de la exportación completa, con conteo y totales de control. Varias líneas por inscripción hacen que este problema pueda aparecer aun con pocos torneos.

### B. El resumen mensual mezcla cobro con ingreso devengado

`lib/accounting/model-a-report.ts:671` asigna el cobro al mes de liquidación/creación. `finalizePeriod`, desde la línea 429, usa esa venta para calcular `accruedContributionCents`. No obtiene el ingreso reconocido al completar el torneo desde el journal.

El journal, en cambio, registra el cobro en `210300` (ingreso diferido) y reconoce `410100` al completar el servicio. La versión vigente de esa función está en `supabase/migrations/20260804231035_account_for_pre_completion_refunds.sql:6`.

Reproducción: cobro de $5.000 el 31 de octubre, torneo completado el 1 de noviembre. El resumen devuelve octubre con venta bruta $5.000 y contribución $4.042,18, sin fila de ingreso de noviembre. La política del journal exige reconocer el ingreso neto del servicio en noviembre. El importe de IVA/cobro y el ingreso devengado deben presentarse separadamente; no se propone cambiar el período fiscal del IVA por este defecto.

Efecto: comparación mensual de rentabilidad incorrecta aunque la suma de varios períodos pueda coincidir. Debe construirse el resultado devengado desde el journal o desde eventos equivalentes y reconciliarse con los reportes operativos.

### C. Las devoluciones simuladas contaminan el resultado

`addFlowAttempt` excluye `payment_method === 'simulation'`, pero el bucle de `flowRefunds` desde `lib/accounting/model-a-report.ts:692` no aplica la misma exclusión ni comprueba el origen real del pago.

Reproducción: intento simulado cancelado y devolución completada sintética por $5.000, N/C aún requerida. El resumen tiene venta bruta cero, devolución $5.000, comisión de devolución estimada $202 y contribución **-$4.403,68**. El journal SQL sí omite la devolución cuyo pago es simulado.

Debe filtrar consistentemente pruebas/simulaciones en ventas, premios, devoluciones y documentación antes de agregarlos. Esta prueba demuestra el camino de código, no que exista esa contaminación en una base real.

## Brechas de alcance para llevar toda la empresa

### Banco y comisiones reales

Registrar el cobro pendiente de liquidación y una transferencia de premio no registra automáticamente el abono Flow en Banco. No se encontró un flujo completo que enlace liquidación, pagos incluidos, comisión real, factura y movimiento bancario, resuelva diferencias y evite importaciones duplicadas.

El estado verde del panel significa que pasan invariantes internos: importes de registros, inscripciones, cadena de saldos, trazabilidad de premios y N/C pendientes. No prueba igualdad con cartola, RCV o saldo Flow externo.

Las provisiones de comisiones están marcadas `is_estimate=true`. Para precisión deben ajustarse/reversarse y reemplazarse con documentación real, conservando trazabilidad. La recuperación del IVA de facturas depende del respaldo y condiciones correspondientes; una tarifa estimada no es crédito fiscal confirmado.

### Gastos, proveedores y aportes

El plan de cuentas inicial cubre premios y comisiones, pero no un circuito administrativo completo para publicidad, hosting, herramientas, contador, asesoría, remuneraciones, activos, aportes del propietario y cuentas por pagar. No se encontró una interfaz/API de gastos generales con documento, contraparte, fecha, impuestos, estado de pago y vínculo al banco.

Aunque no haya ventas, la empresa puede tener egresos y aportes. Sin registrarlos no se conocerá su pérdida real, capital invertido o necesidad de caja. Puede cubrirse inicialmente en un sistema contable externo y enlazarse por identificadores, sin construir otro ERP dentro de TorneosPlay.

### Saldos y cierres

La vista `accounting_trial_balance` agrupa sumas por `e.period`. Su `balance_cents` es el neto de movimientos de ese período. Filtrar un mes no incorpora automáticamente saldos anteriores; no debe confundirse con saldo bancario final ni balance general acumulado.

No se encontró un procedimiento de aprobación y congelación del cierre con responsable, fecha, archivos y ajustes posteriores identificados. El journal es inmutable, pero un período histórico puede recibir nuevos asientos con fecha anterior; son cuestiones distintas.

Las consultas del resumen paginan sin un orden explícito estable y sus fuentes se leen por separado. Con escrituras concurrentes existe riesgo de cortes inconsistentes. Debe definirse un corte común y orden determinista, o construir el paquete desde un snapshot consistente.

### Documentos tributarios

La ruta de registro de N/C recibe folio, fecha y notas; no emite la N/C ni verifica automáticamente su existencia en el SII o su correspondencia con RCV. Eso permite control manual, no certificación documental.

Debe verificarse el modelo de emisión de la empresa y cada medio de pago. El SII reconoce voucher de tarjetas según modelo declarado y exige boleta para efectivo/transferencias. Los reportes internos ayudan al contador; no sustituyen la documentación ni presentan automáticamente el F29.

Si se venden patrocinios, eventos B2B o cosméticos, se necesitan sus documentos y eventos de ingreso propios. No deben forzarse a parecer inscripciones de torneo.

## Prioridades recomendadas

1. **Integridad de los reportes actuales:** exportación completa, corte de devengo correcto y exclusión de simulaciones en todos los eventos. Añadir conciliación de totales exportados y separación entre cobros, ingreso, contribución y caja.
2. **Conciliación documental y bancaria:** importación o carga controlada de liquidaciones/facturas Flow y cartola; matching, estados pendiente/conciliado/diferencia y ajustes trazables. No exige automatización total para el primer piloto, pero sí un procedimiento verificable.
3. **Contabilidad general:** definir con el contador dónde registrar gastos, proveedores, aportes y obligaciones. Mantener referencias entre ese sistema, TorneosPlay y banco; incorporar todos los costos al resultado empresarial.
4. **Cierre mensual controlado:** saldos iniciales/finales, responsable, fecha de corte, paquete completo y versionado, ajustes y reapertura identificados. Confirmar formato compatible con el sistema del contador.

Un primer cierre aceptable debe poder explicar cada cobro, ingreso, premio y devolución; cuadrar archivos completos con el journal; mostrar pendientes y estimaciones; conciliar documentos Flow/RCV/banco y sumar gastos externos. Se recomienda ensayar primero casos sintéticos entre meses y después conciliar una operación real cuando esté autorizada.

## Verificación realizada y límites

Pruebas existentes ejecutadas:

```text
npx vitest run __tests__/accounting-effective.test.ts __tests__/accounting-ledger.test.ts __tests__/accounting-payout-ledger.test.ts __tests__/payout-evidence.test.ts __tests__/payout-receipt.test.ts __tests__/tournament-refunds.test.ts
6 archivos PASS / 14 pruebas PASS
```

Los tres casos anteriores se ejecutaron contra las funciones TypeScript actuales, con datos sintéticos y cliente de lectura simulado. El script está fuera del repositorio de aplicación:

- `C:/Users/valde/.codex/visualizations/2026/10/05/01a10cce-bcec-7130-8ed7-55a74e63b2ea/contabilidad-review.cjs`
- Evidencia: `contabilidad-review-evidence.json` en esa misma carpeta.

No se modificaron funciones, migraciones, Flow ni DB. No se ejecutaron triggers en PostgreSQL ni un recorrido administrativo autenticado de cierre. Aplicación de migraciones, estado real de permisos, conciliación bancaria/documental y aprobación del contador: **NOT_RUN**. Las pruebas existentes pasan, pero no demuestran cobertura de los defectos reproducidos ni de una operación contable completa.

## Referencias oficiales consultadas

- [SII: voucher, modelo de emisión y relación con RCV/F29](https://www.sii.cl/destacados/boleta_electronica_voucher/index.html).
- [Flow: reembolso como servicio adicional y costo de recaudación original](https://web.flow.cl/es-cl/reembolsos).

Son referencias de las condiciones documentales y de pago, no una aprobación tributaria específica de TorneosPlay.
