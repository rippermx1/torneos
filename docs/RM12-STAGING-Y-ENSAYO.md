# RM-12 — staging y ensayo operativo

2026-10-05. **IN_PROGRESS; NO_GO para lanzamiento con dinero real.**

Destino elegido por el propietario: `https://torneos-dev.vercel.app`, Supabase
`jnoyjewsqbooqaiighcs`; producción protegida `baeylvoipmazcthnwxmz`.
El ambiente dev comparte avances de contabilidad y juegos. No constituye una
base descartable. El propietario indicó que su cuenta Flow sólo dispone del
ambiente productivo: el ensayo financiero será real, con monto y pagador por
definir antes del cobro. No se infiere disponibilidad de sandbox para esta cuenta.

## Incremento implementado

- Preflight de catálogo de sólo lectura: genera SQL, consume inventario reciente,
  compara siete migraciones comerciales, grants de tabla **y columna**, RLS,
  dieciocho firmas RPC, siete triggers, tres buckets privados y permisos de semilla.
  No conecta a DB, aplica SQL ni llama a Flow. Rechaza evidencia incompleta con
  salida distinta de cero y conserva `NO_GO`.
- Comparación del destino y fuentes con el manifiesto RM-11; detecta artefactos
  congelados para otro origen/proyecto y huellas inconsistentes. La comprobación
  de bytes compilados y la identidad del despliegue publicado permanecen separadas.
- Sonda Auth sobre cuentas existentes: contraseña, `getUser` contra el servidor,
  roles desde `profile_roles`, AAL/factores y GET con cero filas a la Data API.
  No consulta documentos privados, no cambia roles ni factores MFA; cierra sólo
  su nueva sesión. Informes sin emails, UUID de personas, tokens o errores remotos.
- El historial acepta los identificadores legacy `001..009` presentes en dev sin
  confundirlos con las migraciones timestamp de la candidata.
- La configuración staging admite `https://www.flow.cl/api` explícito y advierte
  que cobra/devuelve dinero real. Conserva el aislamiento Supabase, la exigencia
  de credenciales y las barreras comerciales, revisión y reserva existentes.
  Validar la configuración no aprueba ni ejecuta una operación financiera.

El requisito de sandbox descrito en el informe histórico RM-11 corresponde a
esa revisión; esta entrega lo adapta al ambiente disponible para el comercio.

## Observación real de torneos-dev

| Comprobación | Resultado y alcance |
| --- | --- |
| PostgreSQL / historial | 17.11, 63 versiones; una de siete migraciones de la candidata presente |
| Migraciones pendientes | Semilla, entrada comercial, operaciones durables, retención/revisión, obligaciones/alertas y caja/reserva |
| Grants | Escritura concedida a roles de navegador en registrations, flow_payment_attempts, flow_refund_attempts y withdrawal_requests; no demuestra por sí sola un bypass de RLS |
| Controles nuevos | Faltan 11 tablas requeridas, 17 de 18 RPC y los siete triggers seleccionados |
| RPC existente | settle_tournament_registration tiene firma antigua coincidente en tipos, pero search_path=public; no coincide con el endurecimiento de la candidata |
| Storage | kyc-documents y payout-proofs privados; falta cash-proofs. Acceso a objetos privados: NOT_RUN |
| 2048 | SELECT(seed) concedido a anon/authenticated; GET autenticado de cero filas acepta la columna. No se extrajeron semillas de partidas |
| Auth / roles | Jugador y operador autentican; getUser y roles esperados PASS; cierre de sus sesiones PASS |
| MFA operador | AAL1, ningún factor verificado; desafío AAL2 NOT_RUN |
| Data API privada | cron_heartbeats deniega SELECT; diez tablas privadas nuevas ausentes, por lo tanto BLOCKED, sin darles crédito por acceso denegado |
| HTTPS | / y /sign-in 200; GET de ambos callbacks 405. Sólo disponibilidad, no entrega ni liquidación por Flow |
| Vercel / artefacto publicado | NOT_RUN: el conector requiere reautenticación; la respuesta de una página no identifica su artefacto |
| Credenciales Flow dev | No configuradas en el archivo dev inspeccionado; no se usaron credenciales de .env.local, que apunta a DB productiva |

Los hashes de definición SQL del catálogo sólo identifican ese snapshot; no
demuestran equivalencia con las migraciones locales, sus parámetros nombrados,
dependencias históricas, políticas de filas o recuperación. No se aplicaron
migraciones ni se desplegó sobre el ambiente compartido. Antes de aplicarlas se
debe ensayar su compatibilidad y recuperación con el esquema real y coordinar
los avances que utilizan dev. La fixture nativa RM-11 no sustituye ese ensayo.

Las primeras sondas HEAD se descartaron para permisos: el cliente PostgREST
instalado convierte ciertos 404 sin cuerpo en 200. La sonda definitiva usa GET
con `limit(0)` y distingue denegación, objeto ausente y permiso inesperado.

## Ejecución reproducible del preflight

Desde el checkout de la candidata, sin cargar `.env.local`:

```powershell
npm run staging:catalog
# Ejecutar artifacts/staging/catalog.sql mediante conexión READ ONLY/MCP
# en jnoyjewsqbooqaiighcs; guardar el objeto inventory junto con project_ref.
node scripts/staging-preflight.mjs --inventory artifacts/staging/dev-catalog.json --manifest artifacts/staging/dev-manifest.json --project-ref jnoyjewsqbooqaiighcs --production-ref baeylvoipmazcthnwxmz --app-url https://torneos-dev.vercel.app --output artifacts/staging/dev-preflight.json
node --env-file=C:/torneos/.env.cloud-development.local --env-file=C:/torneos/.env.cloud-test-users.local scripts/staging-auth-preflight.mjs --project-ref jnoyjewsqbooqaiighcs --production-ref baeylvoipmazcthnwxmz --app-url https://torneos-dev.vercel.app --output artifacts/staging/dev-auth.json
```

Los archivos de credenciales y `artifacts/` permanecen ignorados. Los códigos de
salida 1 de estas sondas son el resultado esperado mientras dev está incompleto.
La sonda requiere PLAYER_EMAIL/OPERATOR_EMAIL distintos y sus credenciales
existentes; no crea cuentas ni toma el rol desde metadata editable.

Validación local: **3.803 tests / 80 archivos, tipos, lint global y build Webpack
PASS**. El artefacto local se reconstruyó con el origen y clave pública reales
de torneos-dev, sin inyectar claves privadas del archivo dev al build. El launcher
rechazó antes de `Ready` ese build con credenciales runtime incompletas; no llamó
a proveedores. Este resultado demuestra rechazo seguro, no arranque operativo.
El artefacto permanece local y contiene las builds ignoradas de RM-11, incluidas
las de uso local de Ted Runner: **no está autorizado para subir ese bundle**.
No se repitió la fixture SQL de 118 checks de RM-11 porque no cambió ninguna
migración. La compatibilidad con la DB real sigue pendiente.

## Protocolo de prueba con Flow productivo — pendiente de autorizar

El ensayo requiere un acta privada con `run_id`, candidata/artefacto y despliegue
identificados, operador y suplente, cuentas de prueba elegibles separadas,
torneos asignados y ventana de ejecución. Los siguientes campos siguen pendientes:

| Campo | Estado |
| --- | --- |
| Pagador y consentimiento | PENDIENTE |
| Monto exacto de cada inscripción y comisión mostrada, en CLP | PENDIENTE |
| Límite total autorizado, incluyendo comisiones y reserva/premio | PENDIENTE |
| Receptor/cuenta bancaria de prueba y consentimiento | PENDIENTE |
| Comercio Flow y ubicación segura de credenciales productivas | PENDIENTE |
| Operador titular y suplente con MFA | PENDIENTE |
| Aprobación del modelo comercial y condiciones de esta prueba | PENDIENTE; no se fabrica para destrabar tests |

Secuencia propuesta, **máximo dos cobros** y una devolución; el monto final aún
no está autorizado. No descontar una devolución futura del presupuesto inicial.

1. Preparar DB compatible, permisos, buckets, MFA y caja conciliada con evidencia
   privada. Reconstruir para las variables públicas reales y verificar las nueve
   evidencias RM-11 sobre el artefacto efectivamente publicado. Excluir del upload
   cualquier asset local sin licencia pública; el bundle local de Ted Runner no
   autoriza su publicación. Mantener suspendida la oferta pública del ensayo.
2. Confirmar comercio, credenciales, callbacks HTTPS de confirmación y devolución,
   forma de conciliación y comisión contractual observada. Registrar los montos
   exactos y presentar el acta al propietario; sólo entonces autorizar el ensayo.
3. Cobro A por el checkout comercial habitual, con intento durable previo al envío.
   El pagador revisa costo/reglas y completa el pago. Verificar estado consultando
   Flow: callback por sí solo no prueba pago. Comprobar una inscripción y crédito
   único; un doble click/callback no genera otro cobro o inscripción.
4. Cancelar el torneo A por la operación de administración y procesar la devolución
   durable. Observar callback y estado externo; registrar monto/comisión realmente
   devueltos. No marcar finalizado por enviar la solicitud. Ante timeout o resultado
   incierto, conservar UNKNOWN y conciliar antes de otro envío.
5. Cobro B, en un torneo separado: completar juego autoritativo, ranking y cierre.
   Verificar premio retenido, revisión documentada por operador distinto y saldo
   retirable sólo después de aprobar. El jugador solicita retiro; el segundo
   operador revisa y registra la transferencia/comprobante privado. Una devolución
   no sustituye esta prueba de premio/retiro.
6. Probar pausa, obligación pendiente y alerta a titular/suplente. Inyectar duplicados
   y pérdida de respuesta en pruebas controladas; no fabricar indisponibilidad de
   Flow productivo ni repetir POST externos para simular fallos. Registrar lo que
   realmente ocurrió y mantener NOT_RUN para fallos externos no observados.
7. Conciliar banco, Flow, comisiones, wallet, premios, retiros y reservas; asignar
   cualquier diferencia. Mantener suspendidos nuevos cobros si hay estados inciertos,
   insuficiencia de cobertura, incidente de privacidad o monto fuera del acta.
   Un rollback de código/DB no revierte dinero externo: recuperar y conciliar antes
   de reabrir, sin borrar los registros del ensayo.

No utilizar `smoke:flow` como prueba productiva: ese script heredado está orientado
a sandbox y no cubre el protocolo durable completo. Aceptación humana y teléfono
físico, suplente, soporte y recuperación permanecen pendientes aunque los tests
locales aprueben. RM-12 no cierra RM-04/14/15/16 ni habilita dinero mediante un flag.

Referencias de API para las sondas: [getUser](https://supabase.com/docs/reference/javascript/auth-getuser),
[AAL](https://supabase.com/docs/reference/javascript/auth-mfa-getauthenticatorassurancelevel)
y [Flow](https://www.flow.cl/docs/api.html). La disponibilidad de ambientes para
el comercio concreto proviene de la declaración del propietario.
