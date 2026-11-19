# Activación contable de desarrollo — 2026-10-05

Destino confirmado: Supabase `torneos-dev`, ref `jnoyjewsqbooqaiighcs`.
Web local independiente: `http://127.0.0.1:3085/admin/accounting`.
Web publicada: [Contabilidad en desarrollo](https://torneos-dev.vercel.app/admin/accounting).
El dominio comercial conserva su versión. Vercel dev recibió únicamente la entrega
contable sobre su paquete anterior; se conservaron sus versiones de juegos.

La migración contable se aplicó y su historial se alineó con la versión local
`20261005181131`. SHA-256:
`5a3f7bc062cef36d63e3a2b21f72457f067b705beb7e2b94f89b73206b1e3f01`.
Se verificaron cinco tablas con RLS, sin permisos del navegador ni escritura
directa de servicio. Las RPC públicas son invoker y llaman funciones privadas.
El diario anterior tenía cero asientos/líneas. No se aplicaron migraciones de juegos.

## Aplicación

```powershell
node scripts/start-accounting-development.mjs --build
node scripts/start-accounting-development.mjs --start
```

El iniciador verifica el destino dev, vacía las claves de otros archivos `.env`
antes de que Next las cargue y usa Flow sandbox sin credenciales. La candidata
se compila en `artifacts/accounting/next-development-real`; se inicia con su
servidor standalone, recursos CSS y archivos públicos comunes. Este preview
está dedicado a contabilidad y no copia las builds WebGL de otros incrementos.
No se reutilizan los puertos de Factory 3082/3084 ni se detienen sus procesos.

La integración detectó que Next standalone presenta `localhost` en `req.url`,
aunque el navegador use `127.0.0.1`. La API contable ahora valida Origin contra
APP_URL configurada, conservando el rechazo de orígenes externos y sin confiar
en un Host reenviado arbitrariamente. Se añadió regresión específica.

## Verificación operativa

El script `scripts/verify-accounting-development.mjs` usa Supabase Auth real,
cookies SSR y TOTP AAL2 reales, además de PostgREST y las rutas HTTP de Next.
Se ejecuta solo sobre un diario dev inicialmente vacío. Un intento fallido
antes de registrar documentos puede retomarse con `--resume`, reutilizando
exclusivamente sus dos cuentas sintéticas y su factor MFA.

Estado del recorrido completo: **8 controles PASS**. La evidencia definitiva
queda en `artifacts/accounting/development-real.json`. No sustituye facturas,
cartolas ni aceptación del contador. Referencias de prueba llevan el prefijo
`PRUEBA-CONTABLE-227a1cad` y la indicación explícita de escenario sintético.
No se introducen ventas ni cobros Flow para ejecutar el ensayo.

Se comprobó denegación de lectura/escritura a anónimo, usuario común y admin AAL1;
TOTP elevó la sesión a AAL2 y el navegador no obtuvo ejecución directa de RPC.
Dos solicitudes HTTP concurrentes de aporte produjeron un solo documento/asiento.
Factura a crédito y pago separaron deuda de gasto. La cartola inválida revirtió toda
la carga; matching y exportaciones mantuvieron importes y seis líneas originales.
El cierre sintético de septiembre congeló esas seis líneas y rechazó backdating.
Tras reabrir, tres reversas y un movimiento bancario agrupado dejaron todas las
cuentas y controles en cero. Permanecen seis asientos, doce líneas, tres documentos,
tres movimientos y un cierre reabierto con su snapshot original conservado.

Build final de Next/TypeScript y 27 pruebas en ocho archivos PASS, ESLint PASS.
El primer intento corrigió una expectativa del ensayo: el proxy redirige al
anónimo a login (307). Sus dos cuentas sin documentos fueron eliminadas.
El segundo encontró el rechazo de Origin en standalone, se conservó su evidencia
y se retomó con las mismas cuentas después de corregir/recompilar la API.

Las credenciales del operador sintético y su secreto TOTP se conservan solo en
`.env.accounting-development-test.local`, ignorado por Git. Las cuentas existentes
no cambian contraseña, roles ni MFA. Las sesiones del ensayo se cierran al terminar.

La consulta de negocio de octubre contra la RPC real ya respondió: resultado cero,
sin movimientos ni controles pendientes. Conservar la distinción entre **sin ventas**
y **sin gastos registrados**: los gastos reales aún deben entregarse y contabilizarse.

## Seguridad y límites

El asesor de seguridad registra 12 avisos INFO por RLS sin políticas en tablas
operativas exclusivas del servidor, incluidas las cinco tablas nuevas. Los permisos
de navegador fueron comprobados y permanecen denegados. Descripción:
[RLS sin políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

Un aviso WARN corresponde a la protección contra contraseñas filtradas de Auth,
desactivada en la configuración del proyecto. Esta entrega no cambió esa opción:
[protección de contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Publicación Vercel dev completada; [evidencia y versión](CONTABILIDAD-PUBLICACION-DESARROLLO.md).
Pendientes: documentos reales y primer cierre revisado por el contador (CONT-11),
emisión/presentación tributaria (CONT-12) y aceptación humana del recorrido web.
La prueba de solicitudes HTTP
concurrentes no acredita todos los posibles intercalados de webhooks/cierres.
