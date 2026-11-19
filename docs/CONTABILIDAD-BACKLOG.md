# Backlog contable — TorneosPlay

Creado el 5 de octubre de 2026. Solicitud: cerrar las brechas de la auditoría
[contable](AUDITORIA-CAPACIDAD-CONTABLE-2026-10-05.md). El propietario confirmó **sin ventas**.
Conservar plataforma, cuentas y journal; registrar también los costos previos a ventas.

Estados: **Implementado y probado localmente** exige evidencia ejecutada; **Pendiente operativo**
exige la base desplegada, documentos reales o intervención del contador. Un estado local
no afirma que una migración ya esté aplicada ni que la empresa tenga un cierre tributario aprobado.

| ID | Gap y entrega verificable | Estado |
|---|---|---|
| CONT-01 | Diario completo sin límite de 300 ni máximo de filas PostgREST; totales derivados del mismo snapshot, conteo y CSV exacto | Implementado y probado localmente |
| CONT-02 | Resultado devengado desde journal, separado de cobro/IVA; devolución previa reduce diferido; exclusión consistente de pruebas/simulaciones | Implementado y probado localmente |
| CONT-03 | Documentos de gastos, proveedor, deuda, pago, aportes, otros ingresos y ajustes; referencias únicas, RCV explícito, partidas balanceadas y reversas | Implementado y probado localmente |
| CONT-04 | Liquidación Flow separada de su factura; reemplazo de provisiones con reversa inmutable y protección contra doble reemplazo | Implementado y probado localmente |
| CONT-05 | Carga atómica de cartola CSV, duplicados controlados, matching de importe/período (varios asientos por movimiento), deshacer con motivo y bitácora | Implementado y probado localmente |
| CONT-06 | Saldos iniciales/finales acumulados y resultado empresarial incluyendo gastos; exportación para contador | Implementado y probado localmente |
| CONT-07 | Cierre con revisión y saldos externos, snapshot completo/versionado, bloqueo de backdating y reapertura justificada en orden | Implementado y probado localmente |
| CONT-08 | N/C con referencia al original y verificación manual SII/RCV, responsable y fecha; cierre bloqueado si no está verificada | Implementado y probado localmente |
| CONT-09 | Sustituir script de rentabilidad antiguo: usar journal completo por mes, sin hipótesis 75/25 ni muestras parciales | Implementado; consulta real de octubre en Supabase dev PASS |
| CONT-10 | Activar migración y aplicación juntas; probar administrador real con MFA, proveedores, cartola y cierre en entorno autorizado | Terminado y publicado en desarrollo: Supabase real + Vercel torneos-dev; 38 pruebas del paquete y 9 controles HTTP publicados PASS con MFA real y documentos sintéticos. Aceptación del contador pendiente |
| CONT-11 | Primer cierre con cartola completa, facturas Flow, RCV, documentos originales y revisión del contador | En progreso: propietario confirma sin movimientos reales; identidad de empresa incorporada desde certificado de 30-01-2026 al expediente local de septiembre propuesto. Saldos/respaldos externos, período, responsable y revisión del contador pendientes; cierre no aprobado |
| CONT-12 | Definir/empezar emisión de DTE y presentación fiscal fuera de la plataforma, o contratar integración certificada si se desea automatizar | Pendiente operativo; no se emiten DTE ni presenta F29 desde este módulo |

## Orden de operación

1. Registrar aporte inicial y todos los gastos anteriores a las primeras ventas. Una factura a
   crédito crea Proveedores; pagarla cancela la deuda sin repetir gasto ni IVA.
2. Registrar liquidación neta Flow como Banco contra Flow por liquidar. Registrar su factura
   verificada con IDs de las provisiones comprendidas; la diferencia queda visible en Flow.
3. Cargar cartola en el formato indicado en `/admin/accounting`, conciliar referencias y resolver
   diferencias. Si una transferencia agrupa varios asientos, indicar todos sus IDs.
4. Verificar N/C desde `/admin/refunds`. Usar referencias privadas localizables; comprobar
   correspondencia de documento, emisor, folio, importe y RCV fuera de la plataforma.
5. Cerrar meses terminados en orden. El responsable declara saldo inicial/final de banco,
   pendiente Flow y referencias a cartola, liquidaciones y RCV, incluso si no hubo actividad.
6. Descargar el paquete aprobado y CSV. Para corregir historia, reabrir primero los cierres
   posteriores y después el afectado. Conservar versiones anteriores y emitir nuevos asientos.

Evidencia y límites: [implementación](CONTABILIDAD-IMPLEMENTACION.md).
Publicación y verificaciones: [Vercel dev](CONTABILIDAD-PUBLICACION-DESARROLLO.md).
Expediente sin movimientos reales: [primer cierre](CONTABILIDAD-PRIMER-CIERRE.md).
