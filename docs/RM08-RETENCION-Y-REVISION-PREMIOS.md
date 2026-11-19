# RM-08: retención y revisión antes de pagar premios

2026-10-05. **Implementado y validado localmente; NO_GO productivo vigente.**
Candidata `codex/real-money-access`, base `d3280513216b8e5eec84eafef717b696482770b8`,
checkout `C:/Users/valde/.codex/worktrees/real-money-access/torneos`.
[Evidencia verificable](RM08-RETENCION-Y-REVISION-PREMIOS-EVIDENCE.json).

La liquidación conserva ranking, desempates, premios fijos y obligación contable.
Todos los premios reales nacen pendientes de revisión y no generan crédito
cobrable hasta aprobarlos. Un ganador sin señales heurísticas también pasa por
revisión humana. Los premios de prueba conservan su funcionamiento simulado y
quedan fuera del importe retirable.

## Decisiones persistentes

La migración `20261005145934_prize_review_and_payout_holds.sql` crea:

- `prize_reviews`: un expediente por torneo/ganador, importe adjudicado,
  pendiente/retenido/aprobado, motivo, operador, fecha y evidencia revisada.
- `financial_holds`: retenciones de pagos de premios por usuario, con motivo,
  autor y liberación motivada. Sus UUID permanecen estables al reintentar.
- `financial_review_events`: decisiones y cambios automáticos registrados en la
  misma transacción que la transición financiera. Si falla este registro, falla
  la operación completa.

La aprobación acredita el premio una vez. Retenerlo posteriormente no borra el
crédito ni la adjudicación; lo excluye del importe retirable. Volver a aprobarlo
no genera otro premio. Los créditos históricos vinculados a resultados pasan
por revisión sin duplicarlos; los créditos huérfanos o inconsistentes requieren
conciliación. Se preservan las fechas originales para no trasladar el gasto al
mes de esta migración.

Ban, cambio de KYC/nombre/RUT y disputas abiertas retienen los premios afectados.
Una disputa de resultado presentada por un participante afecta a los ganadores
del mismo torneo. La base rechaza disputas sobre torneos ajenos. Resolver una
disputa, levantar un ban o liberar una retención no vuelve a aprobar premios.
El retiro consulta roles y estado actual del usuario y operadores, sin confiar
en las comprobaciones hechas anteriormente por el navegador.

Para este piloto, una revisión pendiente, una retención activa o una disputa
abierta bloquea los nuevos cobros del usuario, aunque tenga otros premios
aprobados. Estas retenciones no bloquean las devoluciones Flow de inscripciones.
Las heurísticas orientan al revisor: no demuestran participación humana única ni
resuelven automatización pausada o multicuenta.

## Circuito de operadores

1. Revisar `/admin/prize-reviews`: identidad, partida, movimientos completos,
   señales y disputas. Registrar una decisión y justificación de 10–2000
   caracteres. Si falta evidencia o su cantidad no coincide con la partida,
   la API no permite aprobar. Puede retenerse el premio aun sin esa evidencia.
2. El usuario ve los premios pendientes en **Mis premios**. La solicitud de
   cobro reserva el importe y conserva la clave estable de RM-07. Importe,
   destinatario y transacción asociada quedan inmutables.
3. En `/admin/payouts`, operador A reclama el cobro; sólo uno puede reclamarlo.
   Operador B, distinto de A y del beneficiario, verifica importe/destino y
   documenta la comprobación. Cada mutación requiere MFA y roles vigentes.
4. A obtiene la autorización de inicio inmediatamente antes de transferir. SQL
   vuelve a verificar identidad, KYC, roles, retenciones y disputas. El destino
   debe conservar la identidad capturada al reclamar; el nombre completo debe
   coincidir, admitiendo sólo variación de mayúsculas y espacios. Una variación
   adicional se revisa mediante una nueva solicitud, sin editar la ya aprobada.
5. Sólo tras recibir la autorización, A realiza una transferencia y registra
   referencia bancaria y comprobante privado. La referencia se compara sin
   espacios exteriores y sin distinguir mayúsculas: no se reutiliza entre pagos.
   Definir con el banco un identificador que sea único, incluyendo banco/folio
   cuando corresponda. Repetir la confirmación del mismo pago y comprobante
   devuelve el recibo existente, sin otro asiento de salida bancaria.
6. Si se pierde la respuesta, se recarga la página o el banco deja dudas, no se
   vuelve a autorizar el inicio ni se devuelve automáticamente la reserva.
   A/B registra **incierto**; B verifica el banco y documenta **pagado** o
   **no enviado** con evidencia. Sólo la segunda opción devuelve la reserva.
   La conciliación puede registrar un pago ya realizado después de un ban,
   porque documenta un hecho bancario y no autoriza otra transferencia.

Estados: `pending → claimed → approved → transferring → paid`;
`transferring/reconciling` exigen conciliación si hay incertidumbre.
Sólo `pending/claimed/approved` pueden rechazarse directamente. El rechazo es
atómico e idempotente y no borra el premio retenido.

El archivo se guarda con una ruta derivada de SHA-256, sin sobrescritura. Ante
fallo o pérdida de respuesta del commit se conserva el comprobante; no se
elimina un objeto que podría respaldar un pago ya confirmado. La cola separa
cobros abiertos de historial y pagina por antigüedad para que pagos nuevos no
oculten incidencias anteriores. La cola de premios también tiene paginación y
una vista de aprobados para poder retenerlos posteriormente.

## Contabilidad y permisos

El journal reconoce gasto/pasivo al adjudicar el premio, aunque continúe
retenido. El reporte separa premios acreditados y devengados; incorpora la
obligación aún no acreditada y evita volver a reconocer el gasto al liberarla en
otro periodo. Transferencias iniciadas o en conciliación siguen como reservas
pendientes, sin presentarlas como dinero pagado.

Las nuevas tablas usan RLS y grants explícitos: el jugador sólo consulta su
estado/importe, sin notas ni señales internas. `service_role` sólo lee los
expedientes; las decisiones y cambios de retiros/disputas resueltas pasan por
RPC. Los helpers privados y versiones anteriores de RPC no quedan ejecutables
por clientes de servicio. Funciones privilegiadas usan `search_path` vacío y
revocan ejecución pública, siguiendo la [documentación de funciones de
Supabase](https://supabase.com/docs/guides/database/functions).

El piloto serializa las decisiones mediante un bloqueo transaccional compartido
con los cambios relevantes de perfiles, roles y disputas. La validación es
local; medir su capacidad y tiempos de espera en RM-13 antes de escalar.

## Verificación

- **3.628 pruebas web / 68 archivos: PASS.** Incluyen paginación de evidencia,
  fallo de lectura, guardas MFA, respuestas perdidas, conservación del archivo,
  vistas de operador y devengo/pasivo entre periodos. Correos/Storage son mocks.
- **83 comprobaciones PostgreSQL 17.11: PASS**: 62 de incrementos previos y 21
  de RM-08. Roles reales, grants por defecto simulados de Supabase, RLS,
  sesiones concurrentes, retenciones, cambio de identidad, segundo operador,
  pérdida de autorización, referencias duplicadas, conciliación, rollback del
  audit y adaptadores originales del journal. Cluster propio detenido: PASS.
- TypeScript completo, lint dirigido sin warnings, `git diff --check` y
  compilación Next 16.3.8 Webpack: PASS. Build con claves sintéticas.

Reproducción desde el checkout de la candidata:

```powershell
node_modules/.bin/vitest.cmd run
node_modules/.bin/tsc.cmd --noEmit --incremental false
node scripts/verify-commercial-entry-sql.mjs --prize-review --pg-bin C:/torneos/artifacts/2048-adversarial/postgres-portable/pgsql/bin
```

Logs ignorados: `artifacts/prize-review/{sql.json,web.json,lint.log,build-webpack.log}`.
El fixture aplica funciones/migración reales a un esquema mínimo; no sustituye
el historial completo, Auth/JWT, Data API ni Storage de Supabase.

## Integración y aceptación pendientes

**No se aplicó la migración a Supabase operativo, no se desplegó, no se activó
dinero real y no se hicieron transferencias, llamadas Flow ni envíos de correo.**
Turbopack no se repitió: la junction de dependencias fuera del checkout mantiene
la limitación de release documentada. Staging completo, permisos de buckets,
ensayo humano con dos operadores, móvil y banco real: **NOT_RUN**.

Antes de integrar: conciliar históricos, créditos sin resultado, duplicados de
referencia bancaria y solicitudes ya aprobadas. La migración deja aprobaciones
anteriores pendientes para que atraviesen el nuevo circuito. Debe confirmarse
con el banco que no había una transferencia en curso; si la había, detener y
conciliar antes de migrar. Una referencia histórica duplicada hace fallar la
migración completa sin borrar datos. Coordinar código y SQL con operación y
workers detenidos; no ejecutar versiones antiguas con estos estados. No revertir
el esquema borrando retenciones, obligaciones o comprobantes. Ensayar RM-11/12.

La aplicación controla autorizaciones internas; no controla una orden ejecutada
directamente en la banca. Una retención posterior al inicio no puede deshacer
esa orden: exige conciliación. RUT/nombre y formato de archivo no demuestran
titularidad ni autenticidad bancaria. Operador, banco/proveedor, abogado y Flow
deben aceptar el procedimiento y las condiciones comerciales de revisión,
plazos y apelación. El email alojado de premio no se envía al liquidar premios
reales mientras permanezcan pendientes; su comunicación definitiva debe
revisarse en la integración de release. La pantalla conserva el estado visible.

El siguiente incremento es **RM-09**: obligaciones por edad/monto, alertas
accionables, atención del suplente y recuperación comprobada. RM-04 y los ensayos
externos siguen pendientes; RM-08 no se declara cerrado operativamente.
