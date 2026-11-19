# RM-10: conciliación y reserva de caja

2026-10-05. Candidata local `codex/real-money-access`, base
`d85173bd343b9487bea7ff77c5125a3e37095e1a`, en
`C:/Users/valde/.codex/worktrees/real-money-access/torneos`.
**NO_GO productivo vigente.** Esta entrega prepara controles técnicos y una
rutina operativa; no certifica fondos, impuestos ni conciliaciones reales.
[Evidencia](RM10-CONCILIACION-Y-RESERVA-CAJA-EVIDENCE.json).

## Resultado

`/admin/cash`, con MFA administrativo, muestra exposición completa, reserva,
caja bancaria respaldada, cortes, diferencias y acciones. Las lecturas fallidas
se presentan como caja sin comprobar. Los agregados SQL consideran todas las
filas; las listas muestran hasta 50 registros, con el alcance indicado.

Un operador registra movimientos y prepara cortes con archivos privados.
Otro operador vigente revisa el movimiento o el cierre. Solo el propietario
vigente define pausa, límite de exposición y reserva adicional. Los permisos
se vuelven a comprobar en la transacción SQL; ninguna escritura directa del
cliente o de `service_role` puede editar estos registros o borrar su historial.

La migración candidata crea `cash-proofs` privado. Los archivos se verifican
por contenido y MIME, hasta 6 MB, y se almacenan por SHA-256 bajo el identificador
estable del registro. Una respuesta perdida conserva archivo e identificador:
consultar el historial antes de repetir con los mismos datos. Las consultas de
evidencia se registran y generan enlaces de 60 segundos, sin caché.

## Qué se reserva

| Componente | Tratamiento |
| --- | --- |
| Saldo monetario | Suma por jugador; incluye premios acreditados retenidos y obligaciones históricas. Excluye créditos de torneo y consumos de tickets promocionales |
| Premios sin acreditar | Importe adjudicado menos créditos existentes del mismo jugador/torneo; al acreditar se traslada al saldo, sin duplicación |
| Retiros | La reserva abierta reemplaza el débito del saldo. `pending`, `claimed`, `approved`, `transferring` y `reconciling` mantienen la obligación; pago confirmado la consume |
| Premios publicados | Premios reales de torneos `scheduled`, `open`, `live`, `finalizing`, incluidos freerolls con premios reales |
| Devoluciones | Importe pendiente hasta confirmación `completed`; no asumir éxito del envío |
| Cobros sin liquidar | Importe previsto de checkouts reales `pending`, `unknown`, `expired`, como contingencia conservadora. Un URL vencido localmente aún puede pagarse en el proveedor |
| Impuestos | Saldo acreedor no negativo de la cuenta tributaria existente `210100`; reserva contable, no declaración fiscal validada |
| Gastos y riesgo | Reserva adicional y exposición máxima explícitas, definidas y financiadas por el propietario |

La exposición suma las primeras seis partidas. La reserva requerida agrega
impuestos y reserva adicional. Los créditos promocionales no son dinero
retirable; los consumos históricos de tickets no rebajan esta reserva de
premios. Si existe un saldo monetario negativo, un libro banco/Flow negativo o fallan las comprobaciones
contables de RM-09, se bloquea la admisión y se exige conciliar el histórico.

Solo el banco disponible constituye cobertura: saldo total observado menos
fondos retenidos en el último corte aprobado, ajustado por la variación del
libro bancario desde ese corte. El ajuste usa saldos del libro, no una fecha de
asiento o un número de secuencia: incluye movimientos aprobados con fecha
anterior y pagos bancarios confirmados después del corte. Todo saldo Flow,
aunque no esté retenido, se excluye de la cobertura bancaria hasta su abono.

## Bloqueo y alertas

Los nuevos intentos de cobro y la publicación/incremento de premios reales
exigen corte aprobado de menos de 24 horas, política definida y sin pausa,
ninguna diferencia abierta, integridad y reserva financiada. El control de
checkout incluye el importe solicitado y serializa las decisiones entre
intentos: varios checkouts no pueden utilizar la misma cobertura. La
publicación incluye el incremento de premios antes de comprometernos.

Se bloquean nuevos compromisos ante déficit o límite excedido. La recuperación,
callbacks, devoluciones, retiros existentes y práctica continúan por sus
controles financieros vigentes. URLs de Flow ya emitidos no se revocan con una
pausa local: hay que aceptar su confirmación y liquidarlos o devolverlos.

RM-09 incorpora incidentes críticos por diferencias abiertas, reserva bancaria
insuficiente y conciliación vencida/ausente cuando se pretende admitir cobros.
Reutiliza deduplicación, acuse, escalamiento y recuperación por comprobación.
La pausa inicial sin un cierre no dispara por sí sola un correo. Un déficit
observado sí se sigue aunque el propietario haya pausado los cobros.

## Rutina diaria del operador

1. Comprobar obligaciones, integridad, éxitos del monitor y avisos pendientes.
2. Descargar cartola bancaria y respaldo de saldo/comisiones/retenciones de
   Flow para el corte; adjuntar documentos completos que puedan revisar otros.
3. Registrar hechos bancarios: aporte de apertura, abono Flow, pago tributario,
   gasto operativo o contracargo. Usar referencia bancaria única, fecha real,
   importe CLP y evidencia. Estas acciones no envían dinero ni llaman a Flow.
4. Otro operador comprueba monto, origen/destino, referencia y documento, y
   aprueba o rechaza el registro incorrecto sin borrar su evidencia. Solo la
   aprobación genera un asiento equilibrado e idempotente junto con el historial.
5. Preparar el corte con saldos totales y retenidos de banco y Flow. Las
   diferencias observadas respecto al libro quedan asignadas al creador,
   con vencimiento inicial de 24 horas. Reasignar con explicación y plazo hasta
   siete días; esta reasignación no elimina el bloqueo.
6. Investigar cada diferencia. Si corresponde exclusivamente a comisiones Flow
   estimadas frente a comisiones reales, otro operador puede realizar la
   corrección explícita respaldada por el corte. No usarla para ocultar cobros,
   devoluciones, abonos faltantes, IVA u otras causas. Cambia el libro Flow y
   gasto de comisión; no cambia caja bancaria ni resuelve la diferencia.
7. Tras cualquier corrección, preparar un corte nuevo. Un cierre con diferencia
   o libro cambiado no puede aprobarse. Otro operador revisa y aprueba el corte
   nuevo sin diferencias; después vincula ese corte para resolver las anteriores.
8. Comprobar cobertura y límite. El propietario financia el desfase y fija la
   reserva adicional para gastos/riesgo. Activar la admisión sigue sujeto al resto
   de los controles y a la decisión de lanzamiento pendiente.
9. Dejar responsable titular/suplente y atender alertas durante la cobertura
   publicada. Si vence el corte o aparece déficit, conservar la pausa hasta
   recuperar evidencia y comprobar el nuevo estado.
10. Entregar cierres, asientos, referencias, documentos y diferencias al contador
    para el cierre mensual. No asumir que el balance disponible es utilidad.

## Circuito tributario y mensual pendiente de aceptación

Se conserva el contrato de [contabilidad existente](contabilidad-producto.md)
y sus reportes. La corrección de comisión identifica un ajuste real frente a
la estimación, pero no corrige automáticamente crédito fiscal IVA, emite
boletas/notas de crédito ni declara F29. El pago tributario registrado es un
hecho bancario; no acredita por sí solo que la declaración sea correcta.

Antes del piloto, el contador debe aprobar apertura, tratamiento de premios,
comisiones/impuestos por contrato y medio de pago, boleta/voucher y anulaciones.
Comparar documento recibido por el jugador, ventas/devoluciones, respaldos de
comisiones y contracargos, movimientos Flow/banco, RCV y F29. Documentar
explicación, responsable y resolución de cada diferencia; entregar un cierre
mensual firmado con obligaciones remanentes y reserva requerida. Las causas
que no corresponden a los movimientos/corrección disponibles requieren una
corrección contable revisada; no cambiar saldos directamente para cuadrar.

## Verificación y límites

**PASS local:** 3.714 pruebas web en 77 archivos; 118 verificaciones SQL
(99 anteriores + 19 de RM-10), TypeScript, lint de archivos cambiados y build
Next.js Webpack. Clúster propio detenido al finalizar. Hashes de las fuentes SQL
cargadas coinciden con la candidata.

Las pruebas incluyen permisos/roles actuales, doble operador, evidencia y
reintentos, rollback ante fallo de auditoría, diferencias y comisiones reales,
vencimiento, alertas/recuperación, concurrencia de checkouts, publicación sin
caja, banco retenido y libro Flow negativo. El recorrido adjudicación → crédito
→ reserva de retiro → pago conserva la exposición entre etapas y consume
obligación/caja una sola vez al confirmar el pago. Las pruebas HTTP impiden
llamar a Flow cuando el gate rechaza y distinguen respuestas inciertas de éxito.
SSR verifica estados incompletos y controles; no reemplaza aceptación de UI.

La verificación SQL usa un clúster PostgreSQL 17.11 desechable, solo loopback,
con roles reales y migraciones candidatas. La tabla `storage.objects` de esa
prueba es una fixture: no demuestra Storage API/RLS, JWT, credenciales reales,
ni instalación de todo el historial de migraciones en Supabase.

**NOT_RUN:** migración operativa/staging Supabase y sus advisors, Storage/Auth
integrados, MFA en navegador autenticado, recepción de alertas reales,
conciliación con cartolas/Flow reales, financiación, aceptación de propietario,
operador/contador, documentos fiscales reales y declaración tributaria.
No hubo cambios externos, despliegues, transferencias, cobros o emails reales.

Siguiente incremento: **RM-11, configuración efectiva y release reproducible**.
