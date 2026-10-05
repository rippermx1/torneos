# Plan de preparación para operar torneos con dinero real

Fecha del plan: **2026-10-04**. Actualización: **2026-10-05**. Estado: **en ejecución; acceso, recuperación financiera y retención de premios validados localmente**. Decisión vigente: **NO_GO para lanzamiento pagado** hasta demostrar los cierres definidos aquí.

Este plan convierte los doce hallazgos de la [auditoría operativa](AUDITORIA-OPERATIVA-DINERO-REAL-2026-10-04.md) en entregables técnicos, comerciales y operativos. No habilita cobros, modifica Supabase/Flow ni autoriza un despliegue. La viabilidad jurídica del modelo exacto puede cambiar el alcance antes de invertir en su preparación financiera.

## Avance del 2026-10-05

Primera candidata en `codex/real-money-access`, checkout `C:/Users/valde/.codex/worktrees/real-money-access/torneos`, base `299075d`. [Entrega de acceso comercial](RM01-RM03-ACCESO-COMERCIAL.md) y [evidencia](RM01-RM03-ACCESO-COMERCIAL-EVIDENCE.json): 3.562 pruebas del código versionado, 36 comprobaciones PostgreSQL con concurrencia/adaptadores contables, tipos y lint dirigidos PASS; Next 16.3.8 Webpack PASS. Turbopack falló por el enlace de dependencias fuera de la raíz del checkout aislado; ese build sigue pendiente en el entorno de release.

| Trabajo | Estado actual | Pendiente |
| --- | --- | --- |
| RM-01 | Base técnica identificada | Integración de release, responsables nominales y alcance operativo |
| RM-02 | Implementación y verificación local | Supabase staging/Auth/Data API y revisión de registros anteriores |
| RM-03 | Migración existente reutilizada y revalidada localmente | Aplicación seleccionada y permisos/vistas/exportaciones en staging |
| RM-04 | [Expediente comercial preparado](EXPEDIENTE-MODELO-COMERCIAL.md) | Antecedentes y respuestas de abogado, Flow y contador |
| RM-05 | Pagos tardíos/desconocidos recuperables, verificados localmente | Flow sandbox HTTPS, históricos y recorrido externo |
| RM-06 | Obligaciones durables y envío reclamado, verificados localmente | Conciliación manual auditada, alertas y devoluciones externas |
| RM-07 | Solicitud y débito atómicos con clave estable, verificados localmente | Integración staging y operación bancaria |
| RM-08 | Retención/revisión persistente, segundo operador y conciliación bancaria verificados localmente | Titularidad documentada, staging, ensayo humano/bancario y plazos/apelación aceptados |

El checkout compartido y los juegos en progreso se conservan. Sin cambios a Supabase operativo, Flow, despliegues, premios ni merge a main. La [segunda entrega](RM05-RM07-DINERO-RECUPERABLE.md) y su [evidencia](RM05-RM07-DINERO-RECUPERABLE-EVIDENCE.json) registran 3.591 pruebas web, 62 verificaciones SQL, tipos/lint y build Webpack PASS. La [tercera entrega RM-08](RM08-RETENCION-Y-REVISION-PREMIOS.md) y su [evidencia](RM08-RETENCION-Y-REVISION-PREMIOS-EVIDENCE.json) registran 3.628 pruebas web, 83 verificaciones SQL y controles de retención/doble operador validados localmente. Sigue RM-09; los hallazgos no se dan por cerrados operativamente por estas pruebas locales.

## 1. Base de trabajo y alcance comercial

La auditoría corresponde a `c46ae22c1f7d6a514391652c248458a27fca825f`. Al elaborar este plan, el checkout está en `codex/2048-clean-gameplay`, HEAD `92ae970103250fb094141316f0a001a3055c0b13`, con trabajo paralelo sin integrar. La [candidata adversarial de 2048](2048-ADVERSARIAL-IMPLEMENTATION.md) aporta correcciones reutilizables; sus pruebas y su SQL preparado no demuestran permisos corregidos en la base publicada. No se ha repetido la auditoría completa de ese HEAD.

Se conserva el monolito Next/Supabase/Flow y sus capacidades de cuentas, administración, contabilidad y torneos. Unity sigue siendo el cliente; el servidor determina movimientos válidos, tablero, resultado y premios. **2048 es el único candidato comercial de este plan**. Snake Arena mantiene torneos gratuitos; Ted Runner y Factory Empire mantienen práctica.

El piloto parte del formato existente en [la hoja de ruta comercial](roadmap-retencion-rentabilidad.md) y `lib/tournament/finance.ts`:

| Variable | Alcance inicial |
| --- | --- |
| Entrada | $5.000 CLP |
| Participantes | Mínimo 12, máximo 15; participantes reales elegibles |
| Premio fijo total | $33.000 CLP: $24.750 y $8.250 |
| Partida / ventana | 10 minutos / 24 horas, conforme a reglas publicadas |
| Capacidad inicial | Un torneo pagado activo a la vez; iniciar el siguiente tras conciliación y revisión del anterior |
| Ampliación | Sin aumentar premios ni cupos antes de tres cierres mensuales conciliados, conforme a la decisión comercial existente |

La propuesta de un torneo activo es un límite operativo inicial, no una capacidad medida. No se cambia el formato ni se incorporan depósitos, apuestas, recompensas adicionales o resultados confiados al cliente. Si el análisis jurídico exige cambios, se actualizan reglas, contratos y pruebas antes de continuar con dinero.

## 2. Estados, responsables y evidencia

Los identificadores `RM` son subentregables de lanzamiento. Se vinculan al [backlog existente del checkout compartido](C:/torneos/docs/BACKLOG.md); no añaden tickets base ni alteran sus recuentos o estados. Ese documento mantiene trabajo paralelo y no se incorpora a la candidata de acceso.

| Estado de un entregable | Significado |
| --- | --- |
| Planificado | Trabajo definido, todavía sin cierre demostrado |
| En ejecución | Responsable asignado y dependencia disponible |
| Verificado en staging | Comportamiento observado en la versión y base identificadas; evidencia reproducible |
| Pendiente externo | Falta decisión del abogado, contador, proveedor o propietario |
| Cerrado | Evidencia técnica y/o externa exigida aceptada por el responsable correspondiente |

Todos los RM comienzan **Planificados**. Los permisos de dinero real comienzan **Pendientes externos**. Una prueba unitaria, build o aprobación humana no reemplaza los otros tipos de evidencia cuando sean necesarios.

| Responsable | Decisión o trabajo a su cargo |
| --- | --- |
| Propietario | Designar personas, financiar reserva y costos, resolver alcance comercial y aprobar el paso a piloto/lanzamiento con evidencias concretas |
| Ingeniería | Implementación, permisos, estados financieros, pruebas, release y recuperación |
| Operador titular y suplente | KYC/revisión, incidencias, conciliación diaria, retiros, atención y continuidad |
| Revisor de pagos | Segunda persona que autoriza destinatario y monto antes de transferencia; identidad individual y trazabilidad |
| Abogado en Chile | Clasificación del modelo exacto, restricciones, bases, consumidores y privacidad |
| Contador | Tratamiento tributario, documentos, asientos, reservas y cierre mensual |
| Flow | Aceptación del rubro/modelo y condiciones reales de integración, reembolso, liquidación y contracargos |

Los roles no implican que esas personas estén contratadas o disponibles. Asignarlos es parte de RM-01. Para el piloto, operador y revisor deben ser personas distintas; cubrir el requisito no exige crear un área nueva.

## 3. Secuencia de ejecución

| Fase | Entregable observable | Trabajo | Condición para avanzar |
| --- | --- | --- | --- |
| A. Base y acceso | Jugador sin pago/elegibilidad no inicia partida pagada; semilla inaccesible | RM-01/02/03; iniciar RM-04 | Contratos y permisos probados contra DB; candidata identificada |
| B. Dinero recuperable | Cobros, devoluciones y retiros sobreviven concurrencia, reinicios y respuestas perdidas | RM-05/06/07 | Sin duplicación efectiva, débitos huérfanos ni obligaciones descartadas |
| C. Operación protegida | Revisiones retienen premios; alertas, caja, documentos y soporte funcionan | RM-08/09/10/14 | Operador puede detectar, decidir y recuperar una incidencia |
| D. Release y ensayo | Versión reproducible, staging completo y restauración/carga ensayadas | RM-11/12/13 | Evidencia en versión destinada al piloto; cierre RM-04 antes de usar dinero |
| E. Ciclo real privado | Cobro, devolución y retiro reales conciliados con banco y documentos | RM-15 | Cierre financiero observado y revisado; incidentes bloqueantes resueltos |
| F. Piloto y continuidad | Operación acotada con conciliación diaria y revisión de cada ganador | RM-16 | Resultados del piloto revisados antes de abrir captación o aumentar exposición |

A y la preparación externa de RM-04 pueden avanzar simultáneamente. B admite trabajo separado en pagos/devoluciones/retiros, pero comparte contratos contables y de autorización definidos en RM-01. C se construye sobre esos estados. RM-11 y la preparación de soporte pueden avanzar durante B/C. Los ensayos completos de D dependen de B/C; E depende de A–D y de permisos externos. F depende de E.

**Estimación de planificación, no compromiso de lanzamiento:** A 3–5 jornadas de ingeniería; B 10–15; C 7–10; D 7–10. Total orientativo: **27–40 jornadas**, más preparación externa, operación y piloto. Con una persona de ingeniería dedicada, QA/operación disponibles y sin cambios de modelo, prever aproximadamente **6–10 semanas de preparación**, más **7–14 días de piloto**. No hay fecha productiva comprometible sin resolver RM-04. Reestimar después de RM-01 y del primer ensayo financiero; los rangos no proceden de una medición de velocidad del equipo.

## 4. Entregables y criterios de cierre

| ID / hallazgos | Cambio concreto | Dependencias | Responsable / backlog | Evidencia mínima de cierre |
| --- | --- | --- | --- | --- |
| RM-01 / OP-10 | Fijar alcance, versión, contratos y matriz de permisos; separar cambios comerciales de WIP de juegos | Ninguna | Ingeniería + propietario / WEB-16 | Commit, runtime Unity y hashes, migraciones seleccionadas, responsables, invariantes y ambientes registrados |
| RM-02 / OP-01 | Quitar escritura directa de inscripciones monetarias al jugador; crear inscripción por flujo autorizado y transacción servidor/DB | RM-01 | Ingeniería / WEB-07, WEB-15 | Data API rechaza bypass; cierre de cupos concurrente correcto; elegibilidad y pago confirmados exigidos |
| RM-03 / OP-02 | Proteger semilla y cualquier información anticipada del RNG; validar la candidata SQL existente | RM-01 | Ingeniería / G2048-09.2, WEB-15 | Pruebas con JWT reales en DB: jugador no obtiene secreto mediante tablas, vistas ni RPC; juego/admin siguen operativos |
| RM-04 / OP-07, OP-12 | Preparar expediente y resolver clasificación jurídica, aceptación Flow, empresa y tratamiento tributario | RM-01; revisión antes de E | Propietario + abogado + contador / WEB-13, WEB-10 | Respuestas escritas sobre este modelo, condiciones implementables y documentos comerciales coherentes |
| RM-05 / OP-06 | Persistir intención de cobro y correlación; separar vencimiento comercial de resultado financiero; conciliar pagos tardíos/desconocidos | RM-01/02 | Ingeniería / WEB-08 | Callback duplicado/fuera de orden y respuesta perdida sin cobro/inscripción duplicados; todo pago confirmado se aplica o genera devolución durable |
| RM-06 / OP-03 | Registrar obligación de devolución antes de llamar a Flow; reclamar trabajo de forma atómica; recuperar incertidumbre | RM-01/05 | Ingeniería / WEB-08 | Reproducciones de doble refund y pérdida de registro pasan a verificar la corrección; ninguna cancelación queda sin obligación recuperable |
| RM-07 / OP-04 | Crear solicitud y reservar/debitar saldo en una transacción; reintentar por identificador estable | RM-01 | Ingeniería / WEB-08 | Falla de red/crash no deja débito huérfano; concurrencia no excede saldo/límites; reintento devuelve misma solicitud |
| RM-08 / OP-11 | Persistir revisión/retención y verificarla antes de liberar premio o transferir; validar titularidad bancaria y separar autorización/ejecución | RM-02/03/05/07 | Ingeniería + operador / G2048-09, WEB-08, WEB-15 | Caso adversarial retenido; liberación motivada; ban/revocación/disputa efectivos; doble operador no duplica transferencia |
| RM-09 / OP-05 | Propagar errores reales del reconciliador; mostrar obligaciones por edad/monto; alertar y probar atención del suplente | RM-05/06/07 | Ingeniería + operador / WEB-08, WEB-16 | Incidente falla la salud del proceso; alerta recibida y atendida; recuperación resuelve pendiente sin nueva obligación |
| RM-10 / OP-12 | Conciliación diaria, caja reservada y circuito tributario por medio de pago; incorporar comisiones y contracargos reales | RM-04/05/06/07 | Contador + operador / WEB-08, WEB-09 | Conciliación plataforma–Flow–banco; diferencias explicadas; documentos y pasivos trazables; caja disponible suficiente |
| RM-11 / OP-09, OP-10 | Corregir validación efectiva de ambiente; pipeline obligatorio y release reproducible; tratar lint y dependencias de desarrollo | RM-01; integrar B/C | Ingeniería / WEB-16 | Sandbox/simulador/missing env rechazados en prod; build y checks de candidata; artefactos, permisos y migraciones identificados |
| RM-12 / OP-08, OP-11 | E2E Flow sandbox HTTPS con DB real; recorrido humano y pruebas físicas de 2048; ensayo del operador | RM-02/03/05/06/07/08/09/10/11/14 | Ingeniería + operador + propietario / WEB-07/08/10, G2048-04.4/06.2/07.2/08.1/09 | Matriz de casos ejecutada, trazas financieras, ranking consistente y resultados físicos/humanos registrados |
| RM-13 / OP-10 | Restaurar copia en ambiente aislado; ensayar backlog, fallos prolongados y carga de torneo completo | RM-05/06/07/09/11 | Ingeniería + operador / WEB-16 | Restauración utilizable, secretos/accesos correctos, pendientes reconciliados y capacidad observada dentro de presupuesto |
| RM-14 / OP-12 | Acceso administrativo protegido, ciclo de cuenta, política de datos y soporte ejecutables | RM-01/04; integrar RM-08 | Ingeniería + operador + abogado / WEB-10/14/15 | Recuperación/revocación, acceso privado KYC/comprobantes, retención/eliminación con excepciones legales y atención de prueba |
| RM-15 / OP-08, OP-12 | Ejecutar ensayo privado autorizado con dinero real y montos identificados antes de la captación pública | RM-01 a RM-14 cerrados según su evidencia | Operador + revisor + contador + propietario / WEB-08/13 | Cobro liquidado, devolución confirmada y ganador pagado en banco; documentos/asientos conciliados; aceptación del recorrido |
| RM-16 / OP-08, OP-10, OP-11, OP-12 | Piloto acotado, revisión diaria y decisión de continuidad; abrir operación estable por evidencia | RM-15 | Propietario + operador + contador / WEB-07/08/09/16 | Informe de piloto, incidencias, caja, soporte, fraude, costos y decisión explícita; monitoreo y cierres continúan |

### Contratos de acceso: RM-02 y RM-03

La inscripción pagada requiere que el servidor compruebe usuario y rol permitidos, edad/KYC vigentes, términos aceptados/versionados, no suspensión, torneo y ventana válidos, capacidad y pago confirmado del monto correcto. Cupo, estado e inscripción se actualizan atómicamente y con unicidad adecuada. La reserva temporal de un checkout no otorga derecho a jugar. Para torneos gratuitos se conserva una ruta autorizada con reglas propias.

Revisar también UPDATE/DELETE, funciones privilegiadas, vistas y grants de todas las rutas que puedan alterar elegibilidad, saldo, premio o resultado. RLS por propietario no oculta una columna ni hace válido un pago. Probar actor anónimo, jugador A, jugador B y administrador; conservar el acceso necesario para operar.

RM-03 reutiliza [la migración preparada de permisos](../supabase/migrations/20261004184805_guard_2048_seed_visibility.sql). Durante esta planificación, trabajo paralelo trasladó allí el SQL candidato del commit `92ae970`; la migración está sin seguimiento en Git y no se ha verificado su aplicación. Debe pasar pruebas de roles contra Postgres/Data API y revisión de consumidores antes de integrarla o desplegarla. Comprobar que secreto y próximos eventos RNG tampoco aparecen en payloads, bundles, logs del cliente o exportaciones. No cerrar OP-02 por haber quitado el campo de un endpoint.

### Expediente de viabilidad: RM-04

Preparar un paquete revisable: identidad/RUT/giro de empresa; URL; reglas reales de 2048 y papel del azar; entrada; premios fijos; número mínimo/máximo; ranking/desempate; cancelaciones; saldo de premios/retiros; medios de pago; KYC/edad/geografía; controles antifraude; bases, privacidad y atención.

El abogado debe pronunciarse sobre la actividad exacta y sus condiciones de operación en Chile, incluyendo azar, pago de entrada y premios. Flow debe confirmar por escrito la aceptación de ese modelo y sus restricciones. Sus términos contemplan preaprobación para actividades restringidas, incluidos ciertos concursos con entrada y premios; la aprobación comercial no sustituye el análisis legal. Fuente: [términos de Flow](https://web.flow.cl/es-cl/legal), consultados el 2026-10-04. El propietario tramita el expediente; este plan no envía comunicaciones.

Confirmar además con Flow las capacidades de búsqueda por identificador comercial, comportamiento ante reintentos de creación/reembolso, estados terminales, consultas, comisiones, plazos de abono y reservas/contracargos. Registrar lo que el proveedor garantiza y lo que exige investigación manual. Si no permite resolver una respuesta perdida con seguridad, diseñar un bloqueo y conciliación manual para ese caso antes del piloto.

La cuenta sandbox o una cuenta comercial habilitada genéricamente no acreditan aceptación del rubro. Aunque WEB-13 figure P2 en el backlog general, **su parte de aceptación Flow es requisito previo de lanzamiento pagado**. Rechazo legal o contractual obliga a cambiar el modelo y revalidar; no se reemplaza al proveedor para eludir la restricción.

### Dinero durable: RM-05 a RM-07

Usar identificadores de operación estables y restricciones de unicidad para obligación comercial, solicitud externa y asientos. No crear un UUID nuevo para reintentar el mismo negocio. Persistir el intento antes de la llamada externa, guardar correlación/resultado y recuperar estados intermedios con reclamación atómica, vencimiento y protección contra un trabajador antiguo que vuelva a actuar.

La expiración del checkout no prueba rechazo financiero. Un pago tardío confirmado se aplica sólo si sigue cumpliendo el contrato de inscripción; en otro caso genera devolución durable. Timeouts, pérdida de respuesta y error de consulta quedan en **desconocido/pendiente de conciliación**, no en rechazado ni abandonado. El retorno del navegador no confirma pago; la verificación autenticada con Flow determina el resultado.

Registrar la obligación de devolución junto con la cancelación/transición que la origina. La consulta al proveedor y la conciliación determinan si se puede reintentar; un identificador local estable **no garantiza por sí solo** que Flow deduplique. Ningún reintento externo ciego de un resultado desconocido. El cierre exige un reembolso efectivo y un conjunto coherente de asientos, aunque haya varias consultas/intentos registrados.

La solicitud de retiro y el movimiento/reserva de saldo deben compartir una transacción. El rechazo devuelve saldo exactamente una vez; la confirmación bancaria liquida el pasivo exactamente una vez. Detectar débitos históricos sin solicitud y obligaciones sin asiento; resolverlos por un procedimiento trazable, sin borrar registros.

### Integridad, titularidad y transferencias: RM-08

Integrar las cuotas, reglas y desempates de la candidata existente. Medir automatización pausada y múltiples cuentas como amenazas abiertas: enviar direcciones válidas sólo acredita reglas del juego, no participación humana única. Para el piloto, todos los ganadores pasan por revisión antes de que su premio sea retirable.

Definir estados persistidos de revisión, retención, liberación y disputa; razón, actor y fecha; plazos publicados y apelación. La autorización financiera consulta estos estados y las suspensiones vigentes en cada transición relevante. Evitar que un ban nuevo sea ignorado por una sesión antigua o que una retención informativa permita retirar. Una señal heurística genera revisión, no una acusación automática de fraude.

Validar identidad y titularidad de la cuenta bancaria mediante un procedimiento/documento o proveedor aceptado; nombre escrito y RUT válido no prueban titularidad. Un cambio de destinatario invalida su aprobación previa. Proteger los permisos administrativos, exigir MFA para operaciones privilegiadas y conservar registro de decisiones.

Para transferencia manual: un operador reclama la solicitud; una segunda persona verifica monto/destinatario; se registra referencia bancaria única y comprobante privado. La autorización de pago debe volver a verificar retenciones inmediatamente antes de transferir. Si banco/navegador falla tras enviar, el retiro pasa a pendiente de conciliación y se comprueba el banco antes de repetir. Probar dos operadores, pérdida de respuesta y referencia duplicada.

### Observabilidad y caja: RM-09 y RM-10

Medir por separado ejecución del scheduler, resultado del procesamiento y edad/monto del trabajo pendiente. Un HTTP 200 del scheduler no significa que los pagos estén conciliados. Los errores de DB deben propagarse. Mostrar pagos desconocidos, devoluciones sin confirmar, premios retenidos, retiros por pagar y diferencias de caja.

Objetivos iniciales propuestos para el piloto: alerta crítica por duplicación, débito huérfano, acceso indebido o diferencia financiera al detectarla; alerta si dos ejecuciones consecutivas fallan o no hay procesamiento exitoso durante 15 minutos; obligación financiera desconocida por más de 30 minutos pasa a atención humana. El operador titular o suplente acusa recibo de alertas críticas en 30 minutos dentro de la cobertura publicada. Ajustar intervalos a la cadencia real del scheduler y demostrar recepción, escalamiento y recuperación. Si no se puede cubrir el período operativo, reducirlo antes de lanzar.

Conciliar diariamente pagos/confirmaciones, ventas/comisiones, devoluciones, premios, saldos, retiros y abonos Flow/banco. Cada diferencia tiene motivo, responsable y vencimiento; los asientos cuadran y los saldos derivan de movimientos. Saldo wallet, solicitud de retiro y transferencia bancaria son etapas distintas de una misma obligación y no deben contarse dos veces.

El contador valida el esquema de [contabilidad existente](contabilidad-producto.md), IVA, documentos por cada medio habilitado, anulaciones/notas de crédito, premios y declaraciones. No asumir que cualquier recibo de Flow sustituye boleta: depende del medio y del modelo de emisión; el SII distingue transferencias bancarias de pagos con tarjeta. Fuentes: [modelo de emisión y voucher](https://www.sii.cl/destacados/boleta_electronica_voucher/) y [boleta por transferencia](https://www.sii.cl/preguntas_frecuentes/bol_electr_vtas_serv/001_380_7869.htm). Probar el documento que recibe el cliente y la conciliación RCV/Flow/F29 del circuito elegido.

Presupuestar reserva con dinero disponible para premios prometidos, premios/saldos y retiros aún no liquidados, devoluciones, impuestos/comisiones y contracargos; evitar duplicaciones entre esas partidas. Descontar fondos retenidos o aún no disponibles en Flow. El propietario financia el desfase hasta el abono. Fijar reserva y máximo de exposición antes de publicar; con déficit de cobertura se suspenden nuevos cobros.

Los márgenes de la auditoría son escenarios, no utilidad observada. Sustituir tasas supuestas por contrato y liquidaciones; medir cancelaciones, soporte, verificación, infraestructura y adquisición. Preparar procedimiento mensual con contador antes del piloto; el primer cierre mensual real se revisa durante la continuidad, sin exigir tres meses para iniciar un ensayo acotado.

### Release, staging y recuperación: RM-11 a RM-13

RM-11 valida la configuración **efectiva del runtime/build**: `FLOW_API_BASE` ausente/vacío no puede aprobar prod mientras el runtime cae a sandbox; URLs HTTPS y callback correctos; proyecto Supabase y credenciales correspondientes; simuladores/test fixtures deshabilitados; identidad comercial completa. Probar casos negativos sin imprimir secretos. Revisar configuración publicada, no inferirla de `.env` local.

Crear una candidata con commit, lockfile, hash del cliente Unity y procedencia de artefactos ignorados. Seleccionar las migraciones comerciales necesarias y comparar con la DB destino; las diferencias 52 cloud/60 locales de la auditoría son un snapshot. No aplicar automáticamente migraciones de juegos gratuitos. Verificar permisos después de migrar y ensayar compatibilidad/recuperación sin destruir datos. Conservar builds/assets locales necesarios y trabajo ajeno.

Pipeline mínimo obligatorio: tests pertinentes, tipos, lint con alcance válido, build productivo, verificación de configuración y pruebas de DB/permisos/E2E sobre staging. Excluir salidas generadas del lint y corregir errores reales; no cerrar el fallo global con una exclusión masiva de código. Revisar los ocho avisos HIGH de dependencias de desarrollo del snapshot y corregir o justificar exposición/mitigación en build/CI; repetir auditoría de dependencias sobre la candidata. No forzar downgrades por `npm audit fix --force`.

Staging usa base aislada, Flow sandbox con callback HTTPS y artefacto destinado a producción. Ejecutar el flujo con cuentas reales de prueba y roles separados. No subir KYC personal a Git ni a logs. Además de pruebas automáticas, registrar aceptación humana de costo/premio/reglas, pantalla móvil, suspensión/reanudación, ranking, teclado/lector y errores. Incorporar los pendientes del Xiaomi 12 Pro y G2048-04.4/06.2/07.2/08.1; repetir lo afectado por cambios posteriores.

Ensayar carga de 15 jugadores y backlog superior a un lote de cada procesador —actualmente lotes auditados de 25 torneos/50 pagos—, reinicios y al menos 24 horas simuladas de indisponibilidad. Todos los pendientes deben avanzar sin inanición, agotamiento del tiempo de función ni duplicación. Medir p95 de movimientos y recepción de acciones bajo mala red; conservar los presupuestos vigentes de 2048 y acordar el umbral antes del ensayo, sin presentar un objetivo inventado como capacidad comprobada.

Restaurar copia en ambiente aislado incluyendo esquema/grants, Auth y archivos privados necesarios: un backup de DB no demuestra recuperación de Storage. Probar acceso restringido tras restauración. Objetivos de diseño iniciales: RTO 4 horas y RPO 15 minutos para datos de plataforma, sujetos a capacidades y costo del hosting/backup verificados. Para dinero, cualquier operación reconocida debe poder reconstruirse sin pérdida efectiva mediante registros durables y conciliación externa. Si la infraestructura no alcanza esos objetivos, ajustar presupuesto o alcance y documentar el valor alcanzable antes de lanzar.

Tras una restauración/rollback, reconciliar operaciones externas antes de reactivar envíos: volver el código o DB atrás no revierte cobros ni transferencias. Practicar el procedimiento con operador y suplente y conservar tiempos, diferencias y pendientes recuperados.

### Cuenta, datos y atención: RM-14

Cerrar recuperación de contraseña, verificación de email, expiración/revocación de sesión y acciones bloqueadas para cuentas suspendidas. Resolver la advertencia de protección de contraseñas comprometidas de Supabase y comprobar su configuración efectiva. OAuth sólo es requisito si se ofrece en el alcance de lanzamiento.

KYC y comprobantes permanecen privados, con permisos mínimos, accesos auditados y URLs temporales. Definir finalidad, plazo de retención, solicitud de acceso/eliminación, excepciones legales para datos financieros y eliminación de copias/archivos según el circuito acordado con abogado. Revisar normativa aplicable en la fecha prevista de lanzamiento; no prometer borrar obligaciones contables vigentes.

Publicar identidad comercial, términos/base versionados, costos, devolución, plazo de pago, revisión/apelación y canal de atención. Designar titular/suplente y probar una consulta, una disputa y un incidente. El plazo comercial existente de tres días hábiles debe poder cumplirse; incidencias de dinero siguen el escalamiento crítico de RM-09. Mantener acceso a históricos y atención durante una pausa comercial.

## 5. Matriz de ensayos de dinero y operación

Cada caso conserva versión/ambiente, actor, identificador comercial y externo, resultado esperado/observado, asientos y referencia al registro restringido. Los artefactos compartibles van redactados. Los cuatro tests de fallos de la auditoría se convierten en pruebas de la corrección; su PASS anterior sólo reprodujo defectos.

| Caso | Resultado exigido | Ensayo |
| --- | --- | --- |
| INSERT directo, pago ausente/monto incorrecto, menor o KYC/terms pendientes | Sin inscripción/juego pagado ni bypass financiero | DB/Data API + aplicación |
| Último cupo solicitado concurrentemente; reintento mismo checkout | Capacidad respetada; inscripción única | DB real concurrente |
| Jugador lee tabla/vista/RPC; jugador B consulta sesión A | Sin semilla ni acceso cruzado | JWT/Data API y endpoints |
| Confirmación válida, repetida y fuera de orden | Un pago aplicado; un conjunto correcto de asientos | Sandbox HTTPS + DB |
| Respuesta de creación perdida; callback antes del retorno | Intención recuperada sin segundo cobro ciego | Inyección local/staging + consulta proveedor |
| Pago tras vencimiento/cierre o con torneo cancelado | Inscripción sólo si válida; en otro caso devolución durable | Sandbox + DB |
| Dos workers y cancelación/crash entre pasos | Una obligación y una devolución efectiva | Concurrencia/fallas + sandbox |
| Flow acepta refund pero respuesta o escritura DB falla | Estado desconocido recuperable; sin refund duplicado | Inyección + conciliación proveedor |
| DB falla tras débito; dos solicitudes de retiro | Sin saldo perdido ni gasto superior al disponible | DB real + fallas/reintentos |
| Premio sospechoso, ban posterior, cambio de banco, disputa | Retención exigible y decisión trazable antes de transferir | Roles/cuentas separadas |
| Dos operadores pagan; banco queda con resultado incierto | Un pago bancario; bloqueo de repetición hasta comprobar | Ensayo operativo y banco en RM-15 |
| Reconciliador falla parcialmente | Salud fallida y alerta atendida; obligaciones visibles | Inyección + recepción real de alerta |
| Backlog, caída prolongada y restauración | Trabajo recuperado, sin doble envío ni pérdida de obligaciones | Ambiente aislado |
| Config vacía/sandbox/proyecto equivocado/simulador en prod | Release rechazado antes de habilitar cobros | CI/configuración efectiva |
| Recorrido móvil, suspensión, cierre y ranking | Reglas, reloj y posiciones coherentes; usuario comprende costos/premios | Dispositivo físico + revisión humana |
| Venta, cancelación, premio y retiro | Documentos y libro diario coherentes con Flow/banco | Contador + operador |

No provocar deliberadamente cargos duplicados ni fallas destructivas en producción. Los fallos se inyectan en local/staging; el ciclo real privado demuestra el circuito externo normal, con una devolución legítima identificada.

## 6. Ensayo real, piloto y continuidad

### Paso a dinero real privado: RM-15

Requiere cierre de acceso/integridad, dinero durable, configuración/release, soporte/caja, staging/restauración y decisiones legales/Flow/tributarias. El propietario aprueba un expediente concreto: versión, condiciones externas, evidencia, responsables, exposición y reserva. Esta decisión futura es parte del plan; no requiere una aprobación adicional para redactarlo.

Con participantes elegibles y consentimiento, ejecutar un cobro real correctamente documentado y liquidado, una devolución real legítima confirmada y un premio/retiro transferido al titular. Respetar el mínimo de participantes para torneos del formato comercial; no fabricar inscripciones ni saldos de ganador para aparentar cierre. Si se requiere un formato de ensayo distinto, abogado, Flow y propietario deben aprobar ese alcance antes del cobro.

El operador y contador verifican correlación, documentos, asiento, comisiones/abono, devolución y comprobante/estado de cuenta del ganador. Los plazos de Flow y banco pueden exceder la jornada del ensayo: esperar confirmación, no cerrar por timeout ni por saldo wallet. Conservar evidencia privada y una síntesis redactada.

### Piloto de operación: RM-16

Propuesta: invitación acotada, **7–14 días y al menos cinco torneos completados**, un torneo pagado activo, 12–15 participantes reales por torneo, formato de $5.000 y $33.000 de premio fijo. Si no hay ocupación mínima, se cancela/devuelve conforme a reglas; extender observación o revisar demanda, sin agregar cuentas ficticias ni declarar validación por tiempo transcurrido. Fijar antes el presupuesto total y tope de exposición diario según caja disponible.

Revisar cada ganador y conciliar cada día. Medir ocupación/cancelación, consultas y tiempo de resolución, errores/pagos desconocidos, demora de devolución/retiro, alertas, costo real por torneo y repetición de participantes. D7/D30 se observan conforme maduren las cohortes; un piloto corto no acredita retención D30 ni ausencia de fraude.

Para pasar a operación estable limitada: todos los casos críticos de staging aprobados, ciclo real cerrado, cinco torneos conciliados, cero duplicaciones/pérdidas/diferencias monetarias inexplicadas, cero hallazgos P0/P1 abiertos de este informe, pendientes dentro de plazos y capacidad del operador demostrada. Revisar señales antifraude y exposición residual explícitamente; no certificar que la automatización o multicuenta sean imposibles. El propietario toma la decisión sobre ese informe, no sobre un conteo de tests.

**Parada operativa:** acceso indebido a inscripción/secreto, posible doble cobro/reembolso/transferencia, débito sin solicitud, diferencia financiera inexplicada, déficit de caja, aprobación externa retirada o falta de capacidad para atender una incidencia crítica. Suspender nuevas publicaciones/cobros, alertar y atender. Mantener consulta de pagos, webhooks, conciliación, devolución, atención y liquidación de obligaciones existentes. Tratar partidas en curso según el procedimiento publicado; no perder evidencia ni derechos del participante por apagar indiscriminadamente el sistema.

Reanudar sólo con causa y afectados identificados, obligaciones conciliadas, reparación probada y responsable que acepte el resultado. La operación estable continúa con control diario, revisión semanal y cierre mensual. Ampliar captación únicamente dentro de la capacidad/caja observada; un segundo formato o aumento de premios/cupos espera los tres cierres mensuales de la hoja de ruta y una decisión comercial sustentada.

## 7. Cobertura completa del informe

| Hallazgo | Entregables que lo cierran |
| --- | --- |
| OP-01 — inscripción sin elegibilidad/pago | RM-02, RM-05, RM-12 |
| OP-02 — semilla accesible | RM-03, RM-12 |
| OP-03 — devolución duplicada/no durable | RM-06, RM-09, RM-12 |
| OP-04 — débito de retiro huérfano | RM-07, RM-12 |
| OP-05 — salud falsa | RM-09, RM-12/13 |
| OP-06 — pago tardío/desconocido | RM-05/06, RM-12 |
| OP-07 — viabilidad legal/Flow | RM-04, condición previa de RM-15 |
| OP-08 — ciclo externo no observado | RM-12, RM-15/16 |
| OP-09 — configuración productiva | RM-11, RM-12 |
| OP-10 — release/migraciones/carga/recuperación | RM-01/11/13, RM-16 |
| OP-11 — fraude sin retención exigible | RM-08, RM-12/16 |
| OP-12 — tributación/caja/soporte/privacidad | RM-04/10/14, RM-15/16 |

## 8. Primer incremento y seguimiento

El primer incremento de ingeniería es **RM-01 + RM-02 + RM-03**: fijar la candidata comercial, restringir inscripciones y secretos, y entregar pruebas reales de acceso que preserven el flujo legítimo. Reutilizar `92ae970` y su SQL revisable; registrar lo que necesita corrección adicional. Validar primero en una base de pruebas; Docker no disponible en la entrega adversarial es una limitación a resolver, no evidencia de PASS ni motivo para probar escrituras en producción.

En paralelo, preparar RM-04 para que el propietario gestione la revisión del modelo. RM-05/06/07 están implementados y verificados localmente. RM-08 incorpora revisión obligatoria, retenciones, separación de operadores y conciliación del pago. Continuar con RM-09; la integración operativa y su matriz de fallos externos siguen pendientes. Al finalizar cada incremento, actualizar sus estados/evidencias y los tickets WEB/G2048 correspondientes sólo según lo demostrado. Mantener el dictamen NO_GO hasta reunir el expediente para RM-15; no cerrar gaps por publicar este plan.

La revisión semanal utiliza una tabla simple: ID RM, responsable nominal, estado, dependencia pendiente, evidencia, costo/plazo actualizado y siguiente acción. Si una decisión externa cambia el modelo, actualizar este documento y el alcance de los tickets afectados antes de continuar con los trabajos dependientes.
