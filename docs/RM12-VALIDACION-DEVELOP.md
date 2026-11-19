# RM-12: validación de develop con configuración productiva

Actualización **2026-10-07**: scheduler y acceso externo de callbacks implementados y verificados; aplicación `e5e1c78`, despliegue READY. Monitor independiente local activo; cloud/avisos y aceptación financiera pendientes. [Entrega y evidencia actuales](RM12-SCHEDULER-Y-CALLBACKS-DEVELOP.md). El detalle del 6 de octubre que sigue conserva su candidata y alcance originales.

2026-10-06. IN_PROGRESS. **NO_GO para operar con dinero real.**

El ensayo está publicado en https://rm12-torneos-dev.vercel.app dentro del proyecto
Vercel `torneos-dev`, con Supabase `jnoyjewsqbooqaiighcs`. Se conserva el despliegue
compartido de https://torneos-dev.vercel.app y su avance concurrente. La revisión
publicada es `823063cf1566533b4edeaccacefb8d7360193a9e`, despliegue
`dpl_5RRkNLW6Ysf1jr2W75F75DXJW2zZ`, READY.

## Configuración aplicada

Identidad de empresa y claves Flow recuperadas de las variables productivas de
Vercel, según autorización del propietario. En el proyecto dev se guardaron la
identidad comercial y `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true`; las claves Flow y
Resend se inyectaron sólo en el despliegue RM-12 para preservar los defaults de
los otros incrementos. Supabase, claves de base de datos, secreto cron y origen
HTTPS permanecen propios de develop.

Vercel no devuelve las variables sensibles Resend. Se utilizó la fuente local
previamente indicada para `RESEND_API_KEY` y `RESEND_FROM_EMAIL`. No se afirma
igualdad con el secreto ilegible de Vercel ni autenticación de esa credencial ante
Resend. El endpoint Flow productivo se fijó explícitamente conforme al ambiente
declarado por el propietario. No se copiaron secretos de Supabase de producción.

`STAGING_PHASE=configuration` admite estas credenciales exclusivamente en staging
aislado y bloquea Flow y Resend antes del transporte. La fase y Google quedan
congelados en el build; cambiarlos requiere reconstrucción. `preflight` sigue
rechazando credenciales de proveedores. `financial` y producción siguen exigiendo
los datos operativos completos. El verificador rechaza ambas fases bloqueadas
como evidencia de aceptación financiera.

ALERT_EMAIL y OPS_ESCALATION_EMAIL están ausentes en la fuente y se omiten durante
este incremento por decisión del propietario. Su validación y recepción humana
permanecen pendientes para la operación financiera; no se fabricaron destinatarios.

## Evidencia actual

| Control | Resultado | Alcance |
| --- | --- | --- |
| Compilación y código | PASS | 3.816 pruebas en 81 archivos; TypeScript y ESLint; build remoto READY |
| Fuentes publicadas | PASS | 287 archivos coinciden con el inventario Vercel; SHA256 `c16f8e778c643e2cbc619e636780808b79a101d286def96ff3b649c2f2d4c713` |
| Catálogo dev | PASS | 69 migraciones; siete dependencias comerciales verificadas por nombre/hash y permisos; sin nuevas migraciones |
| HTTPS, sesión y práctica | PASS | 33 comprobaciones: páginas, iframe/assets 2048, login por contraseña, premios, práctica y denegaciones privadas |
| Google configurado | PASS | Proveedor dev activo, botón habilitado, Google muestra formulario; callbacks RM-12 con/sin `next` admitidos; origen externo rechazado |
| Google con sesión real | PASS | Ingreso personal del propietario: sesión emitida y perfil presente a las 20:15:53 UTC; retorno a RM-12 con sesión confirmado por el usuario |
| MFA técnico | PASS | Cuenta temporal: TOTP incorrecto rechazado y desafío válido AAL2 contra Supabase real |
| Aplicación con AAL2 | PASS | Caja, operaciones y premios HTTP 200; entrada inválida rechazada; faltantes privados 404 después del guard |
| KYC privado | PASS | Operador AAL1 ajeno denegado; AAL2 descarga un archivo sintético ajeno |
| Caja privada | PASS | Ruta AAL2 devuelve URL firmada y bytes exactos; registro de corte sintético rechazado con saldos cero, retirado después |
| Premios privados | PARCIAL | Descarga directa bloqueada incluso en AAL2; endpoint rechaza anónimo y comprobante inexistente. Descarga de un retiro efectivo pendiente |
| Caja financiera | BLOQUEADA | Pausada; sin límite/reserva definidos ni conciliación aprobada; cero pagos, devoluciones y retiros |
| Monitor operativo | GAP | Monitor autorizado responde 503: no existe éxito reciente de watchdog; otros tres heartbeats datan de 2026-10-05 |
| Scheduler | PARCIAL | Jobs SQL activos y despachando, pero ello no acredita éxito HTTP; watchdog corre `17 * * * *`, frente a cada cinco minutos del contrato |
| Callback externo Flow | BLOQUEADO | Sin acceso Vercel, confirmación y devolución redirigen a Vercel; con acceso y sin token responden 400 |
| Limpieza | PASS | Cuenta/factor/roles temporales, documentos y corte sintético retirados; factor previo preservado |

La prueba de caja privada sólo acredita acceso autorizado y bytes del documento.
No acredita saldo bancario, conciliación, cierre contable, pago o recuperación.
Los buckets de premios y caja permanecen accesibles desde service role y rutas
administrativas protegidas; no se ampliaron políticas de Storage para conceder
descarga directa al operador.

Se observaron y corrigieron en configuración el error Google
`redirect_uri_mismatch` y la ausencia del alias RM-12 en Redirect URLs de Supabase.
La configuración final admite `https://rm12-torneos-dev.vercel.app/**`, conserva
el callback del dominio compartido y usa el callback Google de Supabase dev
`https://jnoyjewsqbooqaiighcs.supabase.co/auth/v1/callback`.
Estos son destinos distintos, como describe la
[documentación de Google en Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google).

## Trabajo restante

1. Completar onboarding y recuperación de cuenta; aceptar MFA del titular y
   suplente. Google ya tiene identidad, sesión y perfil verificados en Supabase,
   más retorno a RM-12 confirmado por el propietario desde su navegador. Esa
   confirmación humana se distingue de las sondas de navegador automatizadas.
2. Preparar el scheduler del ensayo y su monitor independiente, verificar las
   respuestas HTTP y heartbeats recientes, y resolver el acceso externo de Vercel.
   Los jobs compartidos y Factory Empire se preservaron. Los destinatarios y
   recepción de alertas se reanudan cuando el propietario los defina.
3. Realizar recuperación completa de datos, Auth y archivos privados de Supabase.
   El ensayo anterior de catálogo vacío no acredita esa recuperación.
4. Definir reserva/límite de exposición y conciliación real; aprobar montos y
   pagadores antes del ensayo Flow. El protocolo corregido requiere tres cobros
   como mínimo: CLP 6.000 en entradas, más comisiones, premio y cobertura. No está
   autorizado ni ejecutado.
5. Ejecutar inscripción pagada de dos jugadores, juego/ranking/cierre, revisión
   de premio, solicitud y transferencia de retiro; aparte, cancelación y devolución.
   Verificar el comprobante efectivo, banco, Flow, duplicados y estados inciertos.
6. Mantener pendientes aceptación comercial/legal, soporte, suplente, teléfono
   físico y decisión de lanzamiento. La evidencia técnica no los sustituye.

No se ejecutaron cobros, devoluciones, transferencias ni correos.
Las evidencias seguras y sus hashes se registran en
[RM12-VALIDACION-DEVELOP-EVIDENCE.json](RM12-VALIDACION-DEVELOP-EVIDENCE.json).
