# RM-12: scheduler, monitor y callbacks en develop

Entrega del **2026-10-07**. Incremento técnico verificado en desarrollo; **NO_GO financiero**.

Aplicación publicada en https://rm12-torneos-dev.vercel.app, proyecto Vercel
`prj_QHiZYuYkztFToMGmwhPsyOx9nVdG`, Supabase `jnoyjewsqbooqaiighcs`.
Código de aplicación `e5e1c78fdd1ee6e4182318d2c183ea1e5505b070`, despliegue
`dpl_9e2H3R5xVv49qaJVLgVo73wKPjWi`, **READY**. Canal production del proyecto
dev para publicar el alias del ensayo; no despliegue de la plataforma productiva.
287 archivos publicados comprobados por SHA1 contra Vercel; inventario SHA256
`4c07547fc91e96bf1202093e3853c94f5944d5c9b01f44be6fdbe83efc5d7ba0`.
2048 `007` conservado; sin assets licenciados de Ted Runner ni WIP de Factory Empire.

## Implementación y comprobación

| Control | Resultado | Evidencia |
| --- | --- | --- |
| Scheduler propio | PASS | `rm12-process-tournaments` y `rm12-watchdog` cada cinco minutos; `rm12-flow-reconcile` y `rm12-reconcile-refunds` cada diez; captura HTTP cada minuto |
| Ejecución real | PASS | Invocación inicial de tres workers y ejecución automática de los cuatro a las 15:00 UTC; request ID, respuesta HTTP y heartbeat correlacionados |
| Salud del procesamiento | PASS | Workers HTTP 200; watchdog HTTP 503 con `schedulerHealthy=true`, `operationalReady=false`, avisos diferidos |
| Acceso externo Flow | PASS de alcance HTTP | Excepción de protección exclusivamente sobre el alias RM-12; sin cookie Vercel: POST sin token 400, cuerpo excesivo 413, método incorrecto 405 |
| Monitor independiente de desarrollo | PASS local | Tarea Windows `Torneos-RM12-Develop-Monitor` cada cinco minutos; lectura externa autenticada, sin llamadas a proveedores; ejecución periódica observada |
| Autorización | PASS | Cron anónimo y credencial incorrecta 401 antes del trabajo; tabla y funciones privadas denegadas a anon, authenticated y service_role |
| Registro de despachos | PASS | HTTP 200 con HTML, redirección que afirma éxito, timeout y error de red no se aceptan como procesamiento; watchdog 503 separa procesamiento y disponibilidad |
| Pruebas y despliegue | PASS | 3.834 pruebas / 83 archivos, TypeScript, ESLint y build remoto; 33 comprobaciones HTTPS de sesión/práctica/documentos y 17 de operación/callbacks |
| Preservación | PASS | Dominio compartido, cinco jobs originales, comandos/cadencias y dos secretos Vault originales conservados; cero cobros, devoluciones, retiros y torneos; caja pausada |

La excepción de Vercel hace público **todo el alias del ensayo**, no sólo dos rutas.
Las páginas privadas y APIs conservan Auth, roles, MFA, rate limit y verificación
de Flow. No se deshabilitó la protección del proyecto ni del alias compartido.
El acceso HTTP no acredita una confirmación financiera auténtica de Flow:
**token válido, consulta al proveedor y ciclo monetario siguen NOT_RUN**.

`STAGING_PHASE=configuration` sigue bloqueando Flow/Resend antes del transporte.
El monitor observa obligaciones y registra su procesamiento, pero no resuelve un
correo alternativo, reclama mensajes ni intenta enviarlos durante esta fase.
`monitor-status` revisa los cuatro jobs, fallos, fechas futuras, incidentes y cola;
devuelve `Cache-Control: no-store`. Mantiene HTTP 503 mientras la operación no
pueda aceptarse. Un heartbeat reciente no constituye autorización de dinero real.

## Base de datos y configuración

Migración fuente `20261007144704_rm12_isolated_scheduler.sql`, aplicada por MCP
como `rm12_isolated_scheduler`, versión cloud `20261007145414`. SQL normalizado
SHA256 `0aaaddc6aa37850dcacbc9fef39857291ab73c80385a31aa043fedf500b81dc4`
idéntico en fuente e historial. No se alteró el historial para igualar timestamps.

La migración queda inactiva hasta configurarla. Añade únicamente
`private.rm12_cron_dispatches`, `private.invoke_rm12_cron(text)` y
`private.capture_rm12_cron_responses()`. RLS sin políticas y permisos revocados:
es una tabla de diagnóstico para el scheduler PostgreSQL, inaccesible desde la
Data API. Guarda estados y clases de error, sin headers, bearer, tokens de Flow
ni cuerpos de respuesta. Retención técnica de 14 días; no reemplaza el registro
durable de operaciones financieras ni su política legal de conservación.

La activación utiliza `scripts/configure-rm12-scheduler.mjs`: exige el proyecto
dev confirmado y el alias exacto, instala sólo nombres `rm12-*` y lee el secreto
cron dev desde Vault. Añade `rm12_app_url` y `rm12_cron_secret`; no modifica
`torneos_app_url` ni `torneos_cron_secret`. Nunca escribir credenciales en el SQL
versionado ni aplicar este procedimiento sobre producción.

Las cinco fixtures SQL de diagnóstico se probaron con rollback y no quedaron
filas en la tabla privada ni en `net._http_response`. Los documentos sintéticos
de las comprobaciones HTTPS se retiraron. No se fabricaron cuentas bancarias,
conciliaciones, destinatarios o aprobaciones de premios.

Advisors no incorporan WARN/ERROR: persiste la advertencia previa de contraseñas
filtradas de Auth, pendiente de RM-14. La nueva INFO de RLS sin políticas refleja
el aislamiento deliberado de la tabla privada; no se concedieron políticas para
eliminar ese aviso. [Referencia del advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Monitor externo local y continuidad

`scripts/monitor-rm12-develop.mjs` consulta sólo el alias de ensayo, con el secreto
cron dev y sin service role, Flow o Resend. Rechaza redirecciones y revisa las
fechas de los cuatro éxitos. Un 503 puede acreditar procesamiento reciente, pero
siempre conserva `operationalReady=false`, salida 1 y decisión NO_GO.

`scripts/install-rm12-monitor.ps1` instala la tarea propia y
`scripts/run-rm12-monitor.ps1` la ejecuta sin interacción y con ventana oculta.
Configuración desde `C:/torneos/.env.cloud-development.local`; salida segura en
`artifacts/staging/rm12-monitor-latest.json`, registro de terminación en
`rm12-monitor-run.json`. Hubo una terminación previa por timeout; se corrigió
la ejecución no interactiva y se comprobó la finalización de la tarea con señal
503 y salida 1 esperada, sin confundirla con una falla de lanzamiento.

La tarea depende de esta máquina, la sesión Windows y alimentación eléctrica.
**Monitor cloud continuo y recepción/escalamiento humanos siguen pendientes**.
La fuente GitHub Actions previa no se considera activada por este ensayo.
Los correos titular/suplente permanecen omitidos por decisión del propietario.
Antes de archivar este checkout, retirar únicamente la tarea propia:

```powershell
& scripts/install-rm12-monitor.ps1 -Remove
```

Para detener únicamente el scheduler del ensayo, desactivar los cinco jobs cuyo
nombre comienza exactamente `rm12-`, conservando los demás. Para revertir acceso
externo, revocar el `alias-protection-override` de `rm12-torneos-dev.vercel.app`.
Una reversión de código no revierte operaciones externas; aquí no se ejecutaron.

## Pendiente y siguiente incremento

Preparar RM-13: restauración completa de datos/Auth/Storage privado, backlog,
reinicios y carga, conservando datos y jobs compartidos. Permanecen abiertos
RM-14 cuenta/datos/soporte, CI remoto obligatorio/Linux, MFA de titular/suplente,
aceptación física/humana y decisiones comerciales/legales.

El ensayo financiero requiere previamente reserva, límite de exposición,
conciliación real, montos/pagadores y autorización concreta. La disponibilidad
de callbacks y cron no autoriza habilitar proveedores ni cobrar.

[Evidencia de esta entrega](RM12-SCHEDULER-Y-CALLBACKS-DEVELOP-EVIDENCE.json).
[Validación previa y pendientes completos](RM12-VALIDACION-DEVELOP.md).
