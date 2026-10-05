# RM-09: seguimiento de obligaciones y alertas operativas

2026-10-05. **Implementado y verificado localmente; NO_GO productivo vigente.**
Candidata `codex/real-money-access`, base `e9db9186526af006b0be24814a845acd8392ff4f`,
checkout `C:/Users/valde/.codex/worktrees/real-money-access/torneos`.
[Evidencia verificable](RM09-OBLIGACIONES-Y-ALERTAS-EVIDENCE.json).

En `/admin/operations`, protegido por la sesión administrativa con MFA, se
consultan cantidad, monto y fecha más antigua de las obligaciones. El centro
administrativo enlaza esta pantalla e incorpora incidentes persistentes y
comprobaciones contables. Una lectura incompleta se muestra como fallo de
comprobación; no equivale a cero pendientes.

## Qué se sigue

| Cola | Fuente y alcance |
| --- | --- |
| Pagos desconocidos | Intentos Flow `unknown`, importe cobrado previsto y fecha original |
| Pagos en espera | Intentos Flow `pending`; los checkouts `expired` no se presentan como pagos desconocidos |
| Devoluciones sin confirmar | `queued`, `dispatching`, `pending`; sólo `completed` prueba el cierre financiero |
| Devoluciones con incertidumbre o fallo | `unknown`, `manual`, `rejected`, `cancelled`; no reenviar sin conciliación |
| Premios retenidos | Revisiones `pending` o `held`; obligación adjudicada conservada antes de acreditar |
| Retiros por pagar | `pending`, `claimed`, `approved`; reserva existente, sin afirmar transferencia |
| Transferencias por confirmar | `transferring`, `reconciling`; edad desde el inicio del envío, sin autorizar otro |

Los agregados se calculan dentro de PostgreSQL sobre todas las filas, sin tomar
una primera página como total. Sus montos corresponden a cada cola y no deben
sumarse como exposición consolidada: pueden representar etapas relacionadas.
La foto consultada contiene su fecha de lectura; la fecha de última detección
del incidente pertenece al último recorrido del monitor, no a esa lectura.

Las comprobaciones detectan asientos incompletos/descuadrados, reservas de
retiro ausentes o inconsistentes, débitos de retiro sin solicitud, créditos de
premio repetidos y retiros sin separación de operador/aprobador. Para los pagos
históricos, la última comprobación se aplica al protocolo nuevo con inicio de
transferencia registrado; no inventa una segunda aprobación del pasado.
Los históricos siguen requiriendo el preflight y conciliación de RM-08/RM-10.
Esto no constituye detección general de intrusiones o multicuenta.

**Caja bancaria no verificada.** Los asientos equilibrados, saldo wallet y
recaudación registrada no prueban fondos disponibles. El resumen antiguo se
describe ahora como relación de cobros/premios de torneos en curso, incluyendo
su alcance; no representa todo el pasivo de torneos finalizados. RM-10 conserva
la conciliación con Flow/banco y el cálculo de reserva sin doble conteo.

## Umbrales y atención

| Condición | Acción automática |
| --- | --- |
| Diferencia contable, duplicación o reserva/autorización inconsistente | Incidente crítico al comprobarlo |
| Devolución `unknown/manual/rejected/cancelled` | Incidente crítico al comprobarlo |
| Pago desconocido, devolución pendiente o transferencia incierta de al menos 30 minutos | Incidente crítico |
| Pago pendiente, premio retenido o retiro aún no iniciado de al menos 30 minutos | Incidente de atención |
| Dos fallos consecutivos del procesamiento o del respaldo, o sin éxito en 15 minutos | Incidente crítico del proceso |
| Crítico sin acuse durante 30 minutos | Escalamiento persistente al suplente, una vez por episodio |
| Aviso bloqueado o pendiente durante 30 minutos | Incidente crítico del canal de avisos |

La configuración fuente programa watchdog cada cinco minutos; los procesos de
pagos/devoluciones continúan cada diez y torneos cada cinco. Los umbrales son
evaluados al ejecutar, no por un temporizador permanente: la detección y el
escalamiento pueden demorarse hasta la siguiente corrida. GitHub también puede
demorar corridas; estas cadencias propuestas no son un SLA demostrado.

Un incidente activo por condición evita multiplicar correos cada cinco minutos.
Conserva apertura, comprobaciones, acuse, escalamiento y recuperación. Si vuelve
la causa después de recuperarse, nace otro episodio. El acuse exige operador
vigente, MFA en API y plan de atención de 10–2000 caracteres; registra actor,
fecha y nota. No acredita premios, cambia retiros ni cierra la causa. Una nueva
comprobación completa debe confirmar recuperación. Si falla la fuente o la
auditoría, el recorrido falla y no cierra incidentes por ausencia de datos.

## Evidencia del scheduler y del correo

Se distinguen último inicio, término, éxito del procesamiento, fallos
consecutivos y fallo de la llamada del respaldo externo. Un inicio o reporte de
fallo no avanza el último éxito. Los fallos del respaldo no incrementan otra vez
el contador del procesador. Un error al guardar evidencia no devuelve éxito.
Los procesadores conservan sus estados financieros y mecanismos de recuperación.

El watchdog puede completar una observación y devolver HTTP 503 porque sigue
habiendo incidentes o avisos sin atender. Ese 503 no significa que un pago se
haya rechazado ni que deba repetirse. Su latido de éxito prueba procesamiento del
monitor, separado del estado de las obligaciones que observó.

La migración `20261005160247_operational_obligations_and_alerts.sql` añade
`ops_incidents`, `ops_incident_events` y `ops_notifications`, RLS, permisos
explícitos y RPCs con `search_path` vacío. El servicio puede leer esas tablas;
las mutaciones se realizan mediante RPCs. Los clientes no pueden leerlas ni
modificarlas. Observación/acuse se serializan y la auditoría es transaccional.

Cada aviso congela destinatario, asunto y contenido, conserva una clave estable
y reclama un arrendamiento antes de enviar. Se procesan dos avisos por corrida,
priorizando escalamiento; timeouts tienen diez segundos por llamada y los
reintentos durables se espacian de cinco a sesenta minutos. Un arrendamiento
vencido conserva la clave y contenido ante pérdida de respuesta. Una respuesta
aceptada conserva la referencia del proveedor. **Aceptado no significa entregado
ni leído ni atendido.** Los errores HTTP permanentes quedan bloqueados; errores
transitorios quedan pendientes. La ausencia de destinatario/credencial no se
considera envío exitoso.

Se bloquea el reintento incierto tras 23 horas desde el primer intento, antes
del vencimiento documentado de las [claves de Resend](https://resend.com/docs/dashboard/emails/idempotency-keys).
El operador puede corregir la causa y solicitar reintento dentro de ese límite,
con el mismo destinatario/contenido. Después, concilia con el proveedor y
registra recepción por canal alternativo con evidencia y actor. Esa recepción
se distingue de aceptación del proveedor; no prueba entrega de correo ni
resuelve el incidente financiero. Un destinatario ausente puede completarse
cuando se configure, porque no pudo existir una solicitud al proveedor.

`ALERT_EMAIL` designa al titular; la resolución owner/admin existente queda
como respaldo. `OPS_ESCALATION_EMAIL` debe designar un suplente distinto. Si
falta o coincide con el titular, el escalamiento queda visible como aviso sin
destinatario. El remitente OPS se fija en `system@torneosplay.cl` para conservar
el contenido ante reintentos; hay que comprobar el dominio autorizado.

## Respaldo independiente y activación pendiente

`/api/cron/monitor-status`, autenticado con `CRON_SECRET`, informa si el monitor
tiene éxito reciente y el canal no está bloqueado/vencido. El script
`scripts/ops-deadman.mjs`, ejecutable desde GitHub con Node 22, comprueba esa
señal y avisa al suplente directamente con el proveedor si la app/DB/monitor
falla. Su envío no depende de la cola ni del scheduler de la app. Usa una clave
y contenido estable por ventana de media hora, y falla visiblemente si no puede
comprobar o notificar. Un fallo del proveedor compartido sigue dependiendo de
las notificaciones del runner y de un canal alternativo atendido.

Se preparó `.github/workflows/operations-deadman.yml`; **no se publicó ni se
activó**. Requiere variable `PRODUCTION_APP_URL` y secretos `CRON_SECRET`,
`OPS_ESCALATION_EMAIL`, `RESEND_API_KEY` en el runner. No carga `.env`. Los
respaldos diarios de Vercel se conservan y no se presentan como cobertura de
quince minutos. Deben comprobarse permisos, secretos, recepción y logs del
runner antes de contar ese respaldo como operativo.

Procedimiento previo al piloto, pendiente de ejecución:

1. Integrar la candidata en una versión de staging identificada y aplicar las
   migraciones en orden, tras preflight de históricos. Validar JWT/Data API,
   grants y MFA; la fixture PostgreSQL no sustituye Supabase completo.
2. Configurar titular y suplente distintos y su cobertura nominal. Comprobar
   remitente/dominio, secretos y permisos. Actualizar el scheduler existente con
   su proyecto expresamente seleccionado; instalar el watchdog de cinco minutos
   y publicar el monitor independiente con configuración de ese ambiente.
3. Crear una obligación desconocida de prueba, provocar dos fallos y detener un
   procesador. Conservar tiempos de detección, proveedor, recepción real, acuse
   del titular y escalamiento al suplente. Probar pérdida de respuesta y correo
   rechazado; no convertir aceptación en entrega comprobada.
4. Detener watchdog/app/DB y comprobar el aviso desde el runner independiente,
   incluyendo el fallo de credenciales/proveedor y el canal alternativo.
5. Recuperar la causa y comprobar cierre del episodio y aviso de recuperación.
   Mantener un pendiente distinto para demostrar que no se liquida por un acuse.
6. Ensayar backlog superior al lote de dos avisos y mala red; acordar cobertura,
   latencia, capacidad y plazos aceptados con titular/suplente. Registrar
   aceptación humana del panel en escritorio y móvil.

## Verificación local

- **3.673 pruebas web en 74 archivos PASS**: contratos de API/MFA, propagación de
  fallos, cola, proveedor simulado, monitor independiente y representación SSR.
- **99 checks PostgreSQL 17.11 PASS**, 83 previos y 16 RM-09: permisos, umbrales,
  concurrencia, auditoría, escalamiento, incertidumbre/reintentos, acuse,
  recuperación y anomalías financieras. Cluster nuevo exclusivamente loopback,
  detenido por el runner; sin Supabase operativo ni secretos externos.
- TypeScript, lint dirigido y build Next 16.3.8 Webpack PASS. La comprobación de
  tipos se ejecuta después del build, que regenera `.next/types`.

Los correos y llamadas del monitor externo se verificaron con mocks, sin enviar
mensajes reales. SSR no es una prueba de navegador ni aceptación humana. No se
ejecutaron migraciones operativas, Flow/banco, despliegues, activación de cron o
workflows, recepción humana ni simulacro de cobertura real. Los hashes y
artefactos quedan en la evidencia local. Continúa **RM-10: conciliación y reserva
de caja**; el lanzamiento pagado sigue en **NO_GO**.
