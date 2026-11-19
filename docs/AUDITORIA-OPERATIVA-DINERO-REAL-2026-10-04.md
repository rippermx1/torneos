# Auditoría operativa: torneos con dinero real

Fecha: 4 de octubre de 2026, America/Santiago. Dictamen: **NO LANZAR dinero real**.

La plataforma tiene una base comercial aprovechable. Hoy no ofrece garantías suficientes para cobrar inscripciones y pagar premios: existen dos vulnerabilidades verificadas en los permisos de la base cloud, fallos reproducidos en devoluciones/retiros y condiciones legales y contractuales pendientes. El formato comercial es viable en el modelo financiero del repositorio, pero su rentabilidad y operación reales no están demostradas.

## Alcance y evidencia

- Checkout auditado: `C:/torneos`, rama `codex/2048-clean-gameplay`, HEAD `c46ae22c1f7d6a514391652c248458a27fca825f`, con WIP ajeno abundante. El dictamen cubre esta copia y las observaciones cloud indicadas; no certifica que el deploy tenga exactamente este código.
- Lectura de README, STATUS, backlog, rutas, lógica comercial, migraciones, pruebas y scheduler. Guías locales Next.js sobre Vitest y variables de entorno; guía Supabase sobre Auth/RLS/permisos.
- GET públicos: dominio canónico, catálogo, términos y portada de desarrollo respondieron HTTP 200, con HSTS, CSP y X-Frame-Options DENY.
- Supabase `torneos` (`baeylvoipmazcthnwxmz`): consultas exclusivamente de lectura a metadatos y agregados. No se extrajeron documentos KYC, semillas de partidas, datos bancarios ni credenciales. Existe también `torneos-dev`, activo y separado.
- **3.617 pruebas / 75 archivos PASS**, TypeScript sin emisión PASS y lint dirigido a las áreas financieras, seguridad, identidad, Auth y cron PASS. Cuatro reproducciones adicionales PASS porque detectan los defectos, no porque los corrijan.
- `npm run lint` global **FAIL**: 5.351 errores y 46.647 advertencias. Incluye salidas generadas como `.next-factory-verify` y scripts auxiliares con reglas incumplidas; sus exclusiones actuales no cubren todos los derivados. No presentar el lint dirigido como un PASS de todo el repositorio. El pipeline debe distinguir fuentes y derivados, corregir los errores aplicables y obtener un resultado global útil antes de promover el release.
- `npm audit`: ocho paquetes con severidad alta en dependencias de desarrollo; `npm audit --omit=dev`: cero vulnerabilidades reportadas. Son resultados del registro en esta fecha, no garantía de ausencia de vulnerabilidades.
- No se ejecutaron cobros, reembolsos, transferencias, migraciones, activación de scheduler ni despliegues. Build Next/Unity y pruebas de navegador autenticadas completas: **NOT_RUN** en esta auditoría. Las entregas anteriores son evidencia histórica, no comprobaciones repetidas aquí.

Evidencia local y reproducciones: `C:/torneos/artifacts/operational-audit-2026-10-04/`. Es una carpeta ignorada por Git. El informe conserva los resultados esenciales para que la decisión no dependa de esos archivos.

## Estado por frente

| Frente | Lo comprobado | Estado para dinero real |
| --- | --- | --- |
| Disponibilidad | HTTP 200, headers defensivos; dos proyectos Supabase activos | Parcial: falta release identificable y recuperación ensayada |
| Identidad y operador | KYC documental manual, mayoría de edad en checkout, roles servidor, MFA admin | Parcial: titularidad bancaria y capacidad de revisión deben demostrarse |
| Inscripción | Checkout valida KYC, edad, términos, ventana y capacidad | **Bloqueado: INSERT directo omite esos controles** |
| Integridad 2048 | Motor servidor acepta direcciones, score calculado en servidor, reglas automatizadas | **Bloqueado: semilla legible y bots pausados pasan heurísticas** |
| Cobros | Firma, consulta autoritativa a Flow y settlement transaccional | Parcial: Flow externo/callback público y errores desconocidos pendientes |
| Reembolsos | Cancelación, registros, webhook y conciliación implementados | **Bloqueado: concurrencia, persistencia y resultado desconocido** |
| Retiros | Saldo retirable, límites, autorización y comprobante de transferencia | **Bloqueado: débito y solicitud separados; falta ciclo bancario probado** |
| Contabilidad | Partida doble, IVA, pasivos y notas de crédito implementados | Parcial: sin movimientos cloud ni conciliación bancaria observada |
| Operación | Cron principal y respaldos; latidos vigentes | Parcial: errores de devolución pueden aparecer como saludables |
| Legal y Flow | Textos legales publicados | **Bloqueado: clasificación del modelo y preaprobación contractual sin evidencia** |

## Hallazgos que impiden o condicionan el lanzamiento

P0: bloqueo directo para dinero real. P1: debe resolverse antes del primer piloto pagado. Las prioridades expresan impacto operativo, no una certificación jurídica ni un CVSS.

### OP-01 — P0: inscripción directa sin pago ni elegibilidad

**Verificado en cloud por metadatos.** `authenticated` tiene INSERT en `public.registrations`. La política INSERT sólo exige `user_id = auth.uid()` y rol `user`. No hay triggers de negocio en esa tabla. Las constraints verifican referencias/duplicados y valores no negativos, permiten montos NULL y no exigen un pago, KYC, edad, términos, ventana o cupo.

Por tanto, la política permite crear una inscripción propia mediante la Data API sin pasar por el checkout. `game/start` comprueba la existencia de la inscripción, no un pago asociado. El conteo de inscripciones también decide si se alcanza el mínimo de participantes. Esto compromete recaudación, elegibilidad y solvencia. No se insertó una inscripción ni se explotó un torneo cloud durante la auditoría.

Fuente: `supabase/migrations/20260805163009_fixed_prize_business_model.sql:63`, política creada en `20260506001000_profile_roles_and_access_hardening.sql:213`, `app/api/tournaments/[id]/game/start/route.ts`.

Corrección: retirar INSERT directo de clientes y concentrar inscripción gratuita/pagada en operaciones servidor que validen el negocio. Cierre: un usuario por Data API no puede crear inscripciones; endpoints y RPC conservan pruebas de cupo, pago, edad, KYC, términos y bloqueo de cuenta, incluyendo llamadas concurrentes.

### OP-02 — P0: semilla competitiva accesible por la API de datos

**Verificado en cloud por permisos.** `has_column_privilege('authenticated','public.games','seed','SELECT') = true`. La política SELECT permite al jugador leer su propia partida y no oculta columnas. Las rutas Next locales omiten la semilla de la respuesta y ya no entregan estados RNG futuros, pero ese esfuerzo no protege el acceso directo a la tabla.

El algoritmo TS genera cada estado con SHA-256 de semilla/número de movimiento; conocer la semilla permite calcular las apariciones futuras. Se rompe el supuesto de impredecibilidad. No se leyó una semilla real ni se ejecutó un bot cloud.

Fuente: grant SELECT de `20260805163009_fixed_prize_business_model.sql:54`, política de partidas, `lib/game/rng.ts:16`.

Corrección: guardar el secreto fuera de la superficie de lectura del jugador, o revocar SELECT de tabla y ofrecer sólo campos seguros con permisos efectivos. Cierre: el jugador puede recuperar su tablero, pero ninguna consulta Data API/vista/RPC le entrega el secreto o secuencias futuras. Comprobar con una sesión real de staging, no sólo con el shape del JSON Next.

### OP-03 — P0: doble orden de devolución y operaciones externas sin registro durable

**Reproducido contra la función real con DB/Flow simulados.** `issueFlowRefunds` consulta si existe una devolución, llama Flow con un UUID nuevo y después inserta el registro. Dos ejecuciones concurrentes leen ausencia y emiten dos órdenes distintas para el mismo pago. La DB cloud sólo tiene unicidad para el UUID de la orden de devolución, no un reclamo atómico por pago que proteja esta emisión.

Además, el resultado de INSERT se ignora. Una respuesta de error de Supabase después de aceptar Flow devuelve éxito al caller; la siguiente pasada vuelve a emitir. Un timeout de red tampoco prueba que Flow rechazó la operación: clasificarlo como `rejected` y reintentar con otro UUID puede duplicar la orden externa. Esto es riesgo de duplicar devoluciones; la auditoría no realizó dos abonos bancarios reales.

`refundUnsettleablePayment` tiene una protección parcial distinta: reclama `pending → cancelled`, pero el reclamo y la creación del registro de devolución no son atómicos. Si el proceso termina entre ambos, el cobro cancelado puede quedarse sin devolución rastreable.

Fuentes: `lib/tournament/refunds.ts:90`, `:98`, `:232`, `:239`; `lib/flow/settlement.ts:205`, `:230`; índices cloud de `flow_refund_attempts`.

Corrección: persistir primero una obligación de devolución y una clave estable; reclamarla atómicamente; registrar respuesta/error y conciliar resultados desconocidos antes de reemitir. Se puede hacer en el monolito/DB existente. Cierre: concurrencia de scheduler/admin/webhook, caída tras cada paso y pérdida de respuesta generan una sola devolución efectiva y una obligación durable recuperable.

### OP-04 — P1: débito de retiro sin solicitud durable

**Reproducido con pérdida de conexión inyectada.** La ruta confirma `wallet_insert_transaction` y después crea `withdrawal_requests`. Si esta segunda operación lanza una excepción, se propaga sin compensación. La compensación actual sólo cubre un error devuelto por la inserción; una terminación de proceso tampoco la ejecuta. Hay índice único para una solicitud abierta por usuario, pero no hace atómicas ambas operaciones.

Fuente: `app/api/wallet/withdraw/request/route.ts:188`, `:203`, `:219`. La lectura cloud encontró cero débitos huérfanos, sobre cero retiros: no demuestra que el escenario esté protegido.

Corrección: crear solicitud y débito en la misma transacción, con límites/saldo verificados bajo bloqueo; agregar detección operativa de huérfanos históricos. Cierre: timeout, doble clic y caída del proceso no producen dinero debitado sin solicitud ni doble gasto.

### OP-05 — P1: errores financieros reportados como éxito

**Reproducido contra la ruta real.** `reconcile-refunds` devuelve HTTP 200, `ok:true` y latido `ok` aunque `refundsFailed` y los contadores `errors` sean positivos. También varias consultas/escrituras de los helpers ignoran errores devueltos por Supabase. Los respaldos con `curl --fail` y el watchdog no reciben una señal fiable.

Fuente: `app/api/cron/reconcile-refunds/route.ts:43`; helpers de `lib/tournament/refunds.ts`. El lifecycle puede cancelar con `refunds_failed` en detalle sin elevarlo a error de transición.

Corrección: consolidar fallos parciales, responder error operativo y alertar por antigüedad/monto de obligaciones impagas; mantener reintentos idempotentes. Cierre: caída de DB/Flow y una devolución fallida son visibles y llegan al operador, aunque otras filas se procesen bien.

### OP-06 — P1: pago tardío o desconocido puede quedar fuera de recuperación

**Inspección de código/SQL.** El cron expira todo pendiente con más de una hora, incluso si falló su consulta a Flow. El checkout también expira intentos antiguos. `settle_tournament_registration` acepta sólo `pending` o el caso idempotente `paid`; un callback pagado de un intento `expired` queda en error no terminal para el helper de reversa. El caso de cobro exitoso con pérdida de respuesta de creación se marca `rejected`, sin estado explícito desconocido.

Fuentes: `app/api/cron/flow-reconcile/route.ts:86`, `app/api/tournaments/[id]/checkout/flow/create/route.ts`, `20260506200000_route1_direct_checkout.sql:258`, `lib/flow/settlement.ts`.

Corrección: distinguir expiración local de confirmación financiera; conciliar pagos desconocidos/tardíos por identificadores estables y decidir inscripción o devolución durable. Cierre: callback retrasado más de una hora, proveedor caído y respuesta perdida nunca dejan un cobro sin inscripción ni obligación de devolución. Esta auditoría no simuló esas escrituras en cloud.

### OP-07 — P0: clasificación jurídica y preaprobación de Flow pendientes

Los términos de la plataforma describen competencias de habilidad. Esa descripción no acredita habilitación legal. El 2048 actual incorpora azar en posición/valor de fichas; debe analizarse el formato preciso de cuota, premios fijos, comisión y aleatoriedad con asesoría chilena antes de cobrar.

La [SCJ](https://www.scj.gob.cl/preguntas-frecuentes-p/) mantiene que la explotación de plataformas de apuestas en línea es ilegal mientras se tramita su regulación. Esto no clasifica automáticamente TorneosPlay como una casa de apuestas: exige resolver el caso concreto. La [definición SCJ de juegos de azar](https://www.scj.gob.cl/juegos-de-azar/) es relevante para esa evaluación. La fiscalización tiene efectos reales: [Subtel informó nuevos bloqueos el 21 de septiembre de 2026](https://www.subtel.gob.cl/subtel-ordena-bloqueo-de-37-nuevos-dominios-de-apuestas-online/).

Además, los [términos de Flow](https://web.flow.cl/es-cl/legal), apartado de actividades restringidas o con preaprobación, incluyen competencias con cuota de entrada y premio y juegos de habilidad. Hace falta aceptación expresa del modelo por Flow; tener API keys o pasar sandbox no la sustituye. El contenido fue confirmado en el HTML público; el extractor web no mostraba ese apartado completo.

Cierre: evidencia escrita de la clasificación/habilitación aplicable, autorización comercial del proveedor para el modelo exacto y validación tributaria de inscripciones/premios. Si no existe una vía admisible, debe cambiarse el modelo antes de continuar con lanzamiento pagado.

### OP-08 — P1: no hay evidencia del ciclo financiero externo completo

La base cloud auditada tiene 14 perfiles, dos torneos y **cero pagos, reembolsos, retiros, asientos y partidas contables** en el snapshot. Los checks de balance dan cero anomalías porque no tienen movimientos financieros sobre los cuales trabajar. El backlog deja WEB-08 y WEB-13 abiertos. Desarrollo cloud carece de credenciales Flow según su documentación.

Falta observar inscripción/cobro/callback, juego, cierre, premio, solicitud, revisión, transferencia y conciliación; también cancelación/devolución/nota de crédito. El flujo de retiro actual registra evidencia de una transferencia manual, no envía dinero por sí mismo.

Cierre: ejecutar primero E2E en staging con Flow sandbox y callback HTTPS real, incluidos errores y reinicio; después, sólo con OP-07 resuelto, validar un ciclo productivo controlado con comprobante y conciliación bancaria. No confundir simulador, unit tests o premio acreditado en wallet con dinero pagado al ganador.

### OP-09 — P1: chequeo productivo incompleto y configuración local no lista

`npm run check:production-env` falla en esta copia por APP_URL local/http, Flow sandbox, referencia productiva protegida y datos de empresa ausentes. Esto describe la configuración local cargada por el script, **no los secretos del deploy Vercel**, que no se inspeccionaron.

Una reproducción aislada con valores ficticios demuestra otro defecto: `FLOW_API_BASE=''` produce exit 0 y mensaje de PASS; `getFlowApiBase()` usa sandbox cuando falta ese valor. El script sólo rechaza si encuentra la cadena de sandbox. No vi un pipeline de release que obligue a ejecutar ese check y las pruebas: `.github/workflows` contiene tres schedulers.

Fuentes: `scripts/check-production-env.mjs:63`, `:110`; `lib/env.ts:84`; package scripts y Dockerfile.

Corrección: validar explícitamente proveedor/base productivos, coherencia de ambiente y identidad de empresa; comprobar la configuración efectiva del release sin exponer secretos y hacer obligatorios los checks útiles de promoción. Cierre: ausencia/base errónea nunca pasan como configuración de dinero real.

### OP-10 — P1: diferencias de versiones y capacidad operativa no ensayada

La base `torneos` tiene 52 migraciones hasta `20260805181748`. La copia contiene 60. Faltan ocho en ese cloud: siete del 2 de octubre, incluida `20261002202731_guard_2048_move_commit`, y `20261004180617_factory_3d_authoritative_persistence`. No se propone aplicar todas indiscriminadamente: identificar primero el release comercial y sus dependencias.

Cron tiene cuatro jobs activos, 600 ejecuciones `succeeded` en 24 horas y 50 respuestas HTTP 200 en las dos horas observadas. Los tres latidos de procesamiento estaban frescos. Esto confirma ejecución con carga financiera vacía; no neutraliza OP-05. Los procesadores tienen lotes de 25 torneos/50 pagos y recorridos secuenciales de devoluciones: faltan ensayos de backlog, caída prolongada y tiempo máximo. No se verificaron ejecuciones reales del respaldo GitHub ni capacidad de restauración.

Cierre: release identificable (commit/build/migraciones), promoción desde staging, retorno compatible y restauración de DB ensayada con objetivos de recuperación acordados. Prueba de carga según el máximo de torneos/participantes del piloto, sin starvation ni pérdida de obligaciones.

### OP-11 — P1: revisión antifraude sin retención exigible del premio

La prueba adversarial vigente demuestra que automatización con pausas de 500 ms puede pasar detector y revisión de ganadores. La revisión del lifecycle manda señales después de acreditar premios, pero no crea una retención financiera verificable. Las rutas de solicitud/aprobación/completado de retiro no consultan una revisión de partida pendiente o disputas; solicitud/aprobación tampoco comprueban `is_banned` del beneficiario.

MFA y un operador cuidadoso ayudan, pero no constituyen un bloqueo de pago ante una alerta. Validar RUT/nombre por igualdad tampoco demuestra titularidad de la cuenta bancaria escrita por el usuario. El mismo rol admin puede autorizar y registrar la transferencia; falta procedimiento operativo de revisión de beneficiario, comprobante y conciliación para evitar doble transferencia manual.

Fuentes: `__tests__/2048-anticheat-adversarial.test.ts`, `lib/anticheat/winner-review.ts`, `lib/tournament/lifecycle.ts`, `app/api/admin/payouts/[id]/*`, `lib/identity/verification.ts`.

Cierre: evidencia de revisión de ganadores, retención verificable ante fraude/disputa/bloqueo, liberación trazable y pruebas de evasión/multicuenta. Definir comprobación real de identidad y cuenta bancaria; procedimiento de transferencias que evite pagar dos veces antes de registrar la primera.

### OP-12 — P1: obligaciones tributarias, soporte y privacidad sin operación demostrada

El código asume voucher para documentar la venta y registra notas de crédito manualmente. El [SII explica cuándo voucher reemplaza boleta y la importancia del modelo de emisión](https://www.sii.cl/destacados/operacion_iva/). El checkout usa por defecto todos los medios Flow: se debe verificar el documento que corresponde a cada medio contratado, además de devolución, comisión real y tratamiento del premio. No se verificó inicio de actividades, giro, modelo SII, aceptación bancaria o reservas efectivas.

Las políticas prometen retiro hasta tres días hábiles, soporte de disputas y tratamiento de KYC/datos bancarios. Faltan evidencia de operador responsable/suplente, atención real, gestión de contracargos y procedimiento de incidente. Los reintentos de devolución omiten referencias de transacción original y las políticas prometen restitución al medio original; validar esa promesa con Flow. La [API de reembolsos Flow](https://developers.sandbox.flow.cl/api) documenta intervención del receptor y campos para referenciar el cobro original.

Los buckets KYC y comprobantes están privados, y el advisor sólo informa protección de contraseñas filtradas deshabilitada más siete tablas con RLS sin políticas. Estas últimas son tablas de acceso interno y no prueban exposición; hay que conservar su denegación a clientes. La advertencia Auth debe resolverse o justificarse con mitigaciones. Referencias: [seguridad de contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) y [RLS sin políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

La [Ley 21.719](https://www.bcn.cl/leychile/navegar?idNorma=1209272) modifica el régimen de datos personales desde el **1 de diciembre de 2026**. Preparar finalidades, retención/borrado, derechos, proveedores y respuesta a incidentes para KYC/banca; el texto publicado por sí solo no prueba cumplimiento. Cierre: validar tributación con contador, capacidad de soporte y procedimientos de privacidad/recuperación con evidencia ejecutada.

## Factibilidad económica del formato actual

Supuestos del código, no tarifas contratadas verificadas: inscripción $5.000 CLP IVA incluido, 12–15 participantes, premios fijos $24.750 + $8.250, Flow neto 3,19%, objetivo de costos fijos $250.000/mes. Reglas: `lib/business/rules.ts` y `lib/tournament/finance.ts`.

| Concepto CLP | 12 participantes | 15 participantes |
| --- | ---: | ---: |
| Recaudación | $60.000 | $75.000 |
| IVA incluido en ventas | $9.580 | $11.975 |
| Comisión Flow neta asumida | $1.914 | $2.393 |
| Premios | $33.000 | $33.000 |
| Contribución antes de otros costos | **$15.506** | **$27.633** |
| Margen sobre recaudación | 25,84% | 36,84% |
| Torneos completados/mes para cubrir $250.000 | 17 | 10 |

Hay contribución positiva bajo esos supuestos. No incorpora adquisición de jugadores, KYC/soporte humano, asesoría legal, fraude, contracargos, remuneraciones, cancelaciones ni impuesto a la renta. Tampoco prueba que haya 12 jugadores pagadores por torneo. Cancelar devuelve la recaudación pero puede conservar comisiones de cobro y generar costo de reembolso: presupuestar reservas, no gastar la recaudación prometida a ganadores/usuarios.

La liquidez debe cubrir premios acreditados pendientes, retiros debitados aún no transferidos, devoluciones y contracargos, considerando los plazos de abono de Flow. No contar dos veces el mismo premio retirado al calcular el pasivo. El saldo contable interno y el dinero disponible en banco requieren conciliación diaria.

## Ruta de cierre con entregables verificables

| Orden | Trabajo | Responsable funcional | Evidencia para avanzar |
| --- | --- | --- | --- |
| 1 | Corregir INSERT de inscripciones y lectura del secreto RNG (OP-01/02) | Ingeniería | Pruebas reales Data API con jugador en staging; recuperación segura y controles intactos |
| 2, en paralelo | Resolver clasificación jurídica, preaprobación Flow y tributación (OP-07/12) | Propietario, abogado, contador, Flow | Respuesta escrita sobre modelo exacto, documentos de comercio y política tributaria |
| 3 | Hacer durables devolución/retiro y conciliar estados desconocidos (OP-03/04/06) | Ingeniería | Concurrencia, respuesta perdida y caída en cada paso sin duplicación ni débito huérfano |
| 4 | Alertas por fallos/obligaciones, revisión antifraude y retenciones (OP-05/11) | Ingeniería y operador | Incidente visible, recepción de alerta, premio retenido/liberado con trazabilidad |
| 5 | Fijar release y probar ciclo completo en staging (OP-08/09/10) | Ingeniería y operador | Flow sandbox HTTPS, KYC, juego, premio, retiro y devolución; restore/carga con límites del piloto |
| 6 | Preparar caja, soporte, identidad bancaria y controles tributarios (OP-12) | Operación/contabilidad | Conciliación, cobertura de pasivos, atención y suplente, documentación por medio de pago |
| 7 | Piloto pagado acotado sólo tras cerrar anteriores | Propietario y operación | Un cobro/retiro/devolución reales autorizados, documentos y banco conciliados; aceptación humana separada |

No hace falta reconstruir el producto ni pasar a microservicios. El siguiente incremento técnico concreto es cerrar **OP-01 y OP-02** con un contrato de acceso servidor/DB, mientras el propietario resuelve **OP-07**. No se debe estimar una fecha de lanzamiento pagado hasta conocer la respuesta legal/comercial.

2048 es el único candidato comercial actual y necesita los cierres anteriores. Snake Arena tiene torneos gratuitos; Ted Runner y Factory Empire son práctica. Ninguno debe recibir premios monetarios por activar una bandera. Un freeroll con premio monetario sigue teniendo obligaciones de pago e integridad; la gratuidad de entrada no lo convierte en una prueba sin riesgo financiero.

## Reproducción local y límites

```powershell
npm test
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run lint
npm audit --json
npm audit --omit=dev --json
npm run check:production-env
npx vitest run --config artifacts/operational-audit-2026-10-04/vitest.config.mts
node artifacts/operational-audit-2026-10-04/reproduce-environment.mjs
```

La última orden ejecuta cuatro casos que afirman la presencia de defectos en las funciones reales con dependencias simuladas. `environment-reproduction.json` documenta el PASS incorrecto con `FLOW_API_BASE` vacío; `reproductions.json` conserva las cuatro pruebas. Los comandos de smoke, simulación y scheduler no se ejecutaron contra recursos externos.

Las observaciones cloud son un snapshot, no una penetración activa ni prueba de abuso ocurrido. No se revisaron documentos legales privados, contrato particular Flow, estados bancarios ni variables privadas de Vercel. La ausencia de evidencia se reporta como pendiente; no se presenta como incumplimiento jurídico demostrado. La conclusión operativa de no lanzamiento ya se sostiene en los defectos técnicos verificados.

## Plan de preparación

El [plan de operación con dinero real](PLAN-OPERACION-DINERO-REAL.md) desarrolla los doce hallazgos en entregables con dependencias, responsables, evidencia de cierre, ensayo financiero privado y piloto acotado. Su elaboración no cierra hallazgos ni cambia el dictamen NO_GO; incorpora la candidata de 2048 posterior al snapshot como trabajo pendiente de validar.
