# RM-05/06/07 — Dinero recuperable

Fecha: **2026-10-05**. Estado: **implementación y verificación local; integración operativa pendiente**. Dictamen: **NO_GO para operar con dinero real**.

Candidata: `codex/real-money-access`, checkout `C:/Users/valde/.codex/worktrees/real-money-access/torneos`, base `77dd712f2af1852085afe97a260d9868a6e18d7f`. El checkout compartido `C:/torneos` conserva su trabajo paralelo. [Evidencia reproducible](RM05-RM07-DINERO-RECUPERABLE-EVIDENCE.json).

## Cambios comprobados

| Incremento | Comportamiento de la candidata | Cierre todavía pendiente |
| --- | --- | --- |
| RM-05 / OP-06 | La expiración comercial tiene su propio campo. Una respuesta perdida queda `unknown`, bloquea otro checkout y se consulta por la misma orden comercial, incluso sin token. Pagos tardíos se inscriben si siguen siendo elegibles; en otro caso se registra devolución dentro del settlement. | Flow sandbox HTTPS, Auth/Data API, revisión de registros anteriores y ciclo externo |
| RM-06 / OP-03 | La cancelación registra obligaciones en su transacción. Cada pago tiene una clave estable; un RPC reclama el envío antes de contactar a Flow. Pérdida de respuesta o caída deja incertidumbre visible y no autoriza reenvío. | Procedimiento operativo de conciliación manual, tratamiento de históricos, alertas atendidas y devoluciones externas observadas |
| RM-07 / OP-04 | Una transacción valida saldo, saldo retirable, topes e identidad vigente; crea solicitud y débito juntos. El navegador conserva el identificador por usuario durante reintentos/recarga. El mismo identificador devuelve la misma solicitud; otro payload genera conflicto. | Recorrido autenticado en staging, aprobación/retención y transferencia bancaria real con evidencia |

La migración `20261005141433_durable_financial_operations.sql` fue creada con Supabase CLI y probada solamente en PostgreSQL desechable. Reutiliza tablas, RPC de inscripción, wallet y adaptadores contables del monolito. Las nuevas funciones tienen permisos de servidor y `search_path` fijo; también se revocan permisos de escritura por columna del navegador sobre devoluciones y solicitudes de retiro.

El settlement bloquea torneo y pago en el mismo orden que cancelación. Confirma identidad, monto y orden; una falla comercial de inscripción conserva el cobro confirmado y su obligación de devolución. Una falla al guardar la obligación revierte toda la transacción para que la misma orden pueda recuperarse. Dos cobros por el último cupo producen una inscripción y una devolución durable. Callbacks duplicados no crean nuevas inscripciones ni obligaciones.

Los rechazos de creación antiguos pudieron ser pérdidas de respuesta: pasan a `unknown`, conservando historial. Una obligación nueva usa `refund-payment:<payment-id>` y una orden `ref-<payment-id>`. El reclamo usa un nonce; otro trabajador no puede adjuntar una respuesta con un nonce distinto. Si un proceso cae después del reclamo, no se vuelve a liberar el envío por vencimiento. Su respuesta tardía sí puede adjuntar token al mismo reclamo. Con token conocido se consulta Flow; sin token se requiere conciliación con el proveedor. Un rechazo o cancelación de una devolución tampoco crea otra orden automáticamente.

La referencia oficial de [Flow](https://developers.flow.cl/api) documenta `/payment/getStatusByCommerceId` para recuperar pagos y `/refund/getStatus` mediante token para devoluciones. No se encontró allí una consulta de devolución por orden comercial ni una garantía de idempotencia para repetir su creación. La decisión de bloquear el reenvío incierto es conservadora; no demuestra ejecución exactamente una vez por parte del proveedor. Los estados no reconocidos fallan y requieren investigación.

Una devolución completa valida token, orden y monto contra el registro local, no vuelve a pendiente y contabiliza una sola reversa. Conserva la exigencia de nota de crédito. Los depósitos legados confirmados conservan una obligación **manual**, sin crédito nuevo ni devolución automática: antes de disponer de ese dinero hay que revisar los saldos históricos y su tratamiento contable. La falta de destinatario también deja una obligación manual durable.

Los reconciliadores ya no presentan errores de consulta como vencimientos financieros. Rotan la revisión por `last_reconciled_at`; las peticiones Flow tienen límite de ocho segundos. Errores o devoluciones inciertas/manuales producen HTTP 500 y heartbeat de error. El panel incluye los estados nuevos y permite reverificar pagos sin token. Esto mejora RM-09, pero no demuestra recepción/atención de alertas ni recuperación manual completa. Recuperación de gran backlog y presupuesto de cron siguen dentro de RM-13.

El retiro usa el mismo bloqueo de wallet que los demás movimientos. El saldo se obtiene sumando el ledger, evitando depender del orden de UUID entre movimientos con igual timestamp. Se mantienen límites de $5.000–$500.000 por solicitud, $500.000 diarios y $2.000.000 mensuales. Se conserva la validación de RUT/nombre en servidor y se compara la identidad verificada bajo bloqueo para detectar cambios entre la validación HTTP y el commit. Los premios de torneos de prueba no son retirables. Ante respuesta perdida no se genera un crédito compensatorio ni otro identificador.

## Evidencia

- **3.591 pruebas web / 65 archivos: PASS**, incluyendo recuperación, validación de prueba Flow, incertidumbre, errores de persistencia y solicitud HTTP de retiro. Son mocks del proveedor, sin llamadas externas.
- **62 comprobaciones PostgreSQL 17.11: PASS**. El runner verifica primero 36 casos del incremento de acceso y después aplica la migración financiera para 26 casos nuevos, con roles y sesiones concurrentes reales. Incluye último cupo, reclamos simultáneos, crash después del débito, error al guardar obligación, cambio de identidad, topes, premios de prueba, depósitos legados y asientos balanceados/idempotentes.
- TypeScript completo sin emisión/incremental: **PASS**. Lint dirigido sobre archivos cambiados: **PASS, sin warnings**. `git diff --check`: **PASS**.
- Next 16.3.8 **Webpack: PASS**, 58 páginas estáticas. Solo claves sintéticas para build. Turbopack no se repitió: el checkout usa una junction de dependencias fuera de su raíz, limitación documentada en RM-01; sigue pendiente en el runner de release.
- Cada cluster de prueba se crea con UUID en loopback y termina detenido. Los hashes vinculan evidencia y fuentes. No se aplicaron migraciones a Supabase operativo ni se ejecutaron Flow, correos, órdenes bancarias, despliegues o builds de juegos.

Reproducción desde el checkout aislado:

```powershell
node_modules/.bin/vitest.cmd run
node_modules/.bin/tsc.cmd --noEmit --incremental false
node scripts/verify-commercial-entry-sql.mjs --financial --pg-bin C:/torneos/artifacts/2048-adversarial/postgres-portable/pgsql/bin
```

Logs ignorados: `artifacts/financial-operations/{web.json,sql.json,build-webpack.log}`. El fixture es un contrato mínimo con funciones reales; no sustituye la base Supabase completa ni sus JWT/Data API. No hubo prueba humana/móvil/bancaria.

## Integración pendiente y continuación

Antes de aplicar fuera de este fixture, revisar registros antiguos: pagos expirados o cobrados sin inscripción, devoluciones múltiples por pago y rechazos sin confirmación del proveedor, destinatarios ausentes, débitos huérfanos, saldos y snapshots históricos. Mantener sus evidencias; no borrar históricos ni asumir que un error significa que Flow no recibió la solicitud.

RM-11 debe coordinar código y migración con checkout, retiros y trabajadores financieros detenidos durante el cambio. No ejecutar trabajadores de la versión anterior contra estos estados nuevos. Si una actualización falla, mantener la operación detenida hasta recuperar una versión compatible; no eliminar obligaciones o devolver saldo mediante compensaciones improvisadas. Ensayar este procedimiento y la restauración en staging.

Sigue **RM-08**: revisión/retención persistente, bloqueo antes de liberar premios o autorizar transferencias y protección del circuito de operadores. Después, RM-09 completa la cola por edad/monto, conciliación manual auditada y prueba de alertas atendidas. RM-04 sigue esperando antecedentes y revisión de abogado, Flow y contador; RM-12/13/15 siguen pendientes. Esta entrega no constituye aceptación para lanzamiento.
