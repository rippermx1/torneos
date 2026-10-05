# G2048-09.4 — integración y recorrido administrativo autenticado

2026-10-05. **En progreso; integración operativa y Auth/MFA NOT_RUN**. Se preparó
la integración conjunta de 09.2/09.3 y un ejecutor de recorrido autenticado.
Los controles del ejecutor y la transacción conjunta pasaron **8 tests Node**
(3 controles, 4 escenarios SQL y su suite) y lint sin errores ni advertencias.
Estas pruebas usan PostgreSQL 17.11 aislado; no sustituyen Supabase Auth ni la
interacción con la GUI. Evidencia: [E22](2048-ADMIN-INTEGRATION-EVIDENCE.json).

## Entrega implementada

- `scripts/2048-integrity-local.mjs`: lee exclusivamente `.env.local-stack`,
  rechaza cloud/otros puertos, verifica hashes de las dos migraciones revisadas
  y consulta únicamente `supabase_db_torneos`. `--apply` ejecuta las pendientes
  dentro de una transacción, registra versiones y recarga PostgREST. Conserva
  definiciones previas y compara fingerprints de filas de public/auth. Una
  pérdida de transporte durante la escritura queda como resultado desconocido;
  hay que consultar versiones antes de reintentar.
- `scripts/build-2048-integrity-candidate.mjs`: manifiesto de 18 archivos propios
  cotejados con `79f5e89`, con normalización de saltos de línea Windows.
  `--build` exige que la imagen operativa coincida con el manifiesto de contexto
  aceptado; conserva cápsulas Unity, assets y servidor Snake de esa base.
  No copia el WIP general y no activa una imagen automáticamente.
- `scripts/verify-2048-admin-local.mjs --run`: exige el ambiente local real,
  web saludable, claves sincronizadas y esquema instalado. Crea usuarios nuevos
  exclusivos de la prueba y verifica sesión SSR, acceso denegado a anónimo/no
  administrador, administrador AAL1 bloqueado y TOTP real para obtener AAL2.
  Usa direcciones por las API y comprueba tablero/puntaje persistidos, permisos
  de semilla, bloqueo sin premios/resultados, descarte motivado, sanción atómica,
  reintento de liquidación y conservación del historial ante sanción posterior.
  Verifica HTML administrativo y replay; los clics reales en navegador y la
  aceptación humana se registran por separado.

La cadencia exacta se reproduce ajustando únicamente timestamps del historial de
las dos partidas sintéticas de esa ejecución, después de recibir movimientos
reales por HTTP. Se declara como fixture controlada: no demuestra cadencia humana
ni detección universal de bots. No cambia cuentas existentes, contraseñas/MFA de
operadores ni torneos ajenos. No llama cron global ni Flow. Solo se permiten las
notificaciones capturadas por el correo local existente.

## Verificación realizada

`node --test scripts/2048-integrity-local.test.mjs scripts/2048-integrity-joint-sql.test.mjs`
pasó 8 tests, cero fallos/skips. SQL real verificó que un error en la segunda
migración revierte permisos y las dos versiones; la ejecución correcta conserva
filas preexistentes, oculta la semilla al navegador y mantiene lectura de estado
seguro/servicio. También comprobó permisos exclusivos de servicio para las tres
RPC y presencia del trigger de finalización. Los clusters propios se detuvieron.

El manifiesto de los 18 archivos coincide con la fuente revisada. Sintaxis Node
y lint de los cinco scripts nuevos pasan. No se recompiló Next ni Unity, porque
no hubo cambios nuevos en su runtime y Docker no permite construir la candidata.

## Bloqueo y continuación

Docker Desktop no responde al motor Linux. Su registro del 2026-10-05 muestra:
`initializing Inference manager ... dockerInference ... The file cannot be accessed by the system`.
Después aparece `Reset to factory defaults` y `application reset complete`.
El usuario confirmó que lo restableció sin respaldo. Persisten archivos VHDX,
pero la disponibilidad de sus datos no está comprobada. Las comprobaciones de
3081, API Supabase 54321 y DB 15432 no encuentran servicios operativos.
Un intento de inicio indicó que Desktop ya estaba abierto; un intento de
reinicio y las consultas al motor agotaron el tiempo. No se tocaron los previews
ajenos 3082/3083 ni se hicieron nuevos resets, borrados o cambios de configuración.

Para continuar, reparar el arranque de Docker y auditar lo que realmente conserva
antes de reconstruir. Si hay que recrear Supabase, usar la fuente aprobada y
fixtures locales; no aplicar en bloque las migraciones de WIP paralelo ni cambiar
credenciales de operadores. Actualizar claves locales si el nuevo Auth las cambió.
Después:

1. Auditar imagen/contexto y servicios locales recuperados. El manifiesto antiguo
   `artifacts/2048-unity-entry/candidate.json` se admite solo si coincide con la
   imagen operativa; una base distinta requiere su propio contexto revisado.
2. Compilar la candidata con `node scripts/build-2048-integrity-candidate.mjs --build`
   y verificar que conserva las cápsulas y los otros juegos aceptados.
3. Ejecutar preflight `node scripts/2048-integrity-local.mjs` y aplicar solo las
   pendientes con `node scripts/2048-integrity-local.mjs --apply`.
4. Activar esa candidata conservando configuración, volúmenes, redes y servicios
   de la base auditada. Esta activación aún no se implementó ni ejecutó en 09.4.
5. Ejecutar `node scripts/verify-2048-admin-local.mjs --run`, revisar su evidencia
   persistida y completar los clics con sesión/MFA real en la GUI operativa.

**No cerrar 09.4 hasta completar integración y recorrido autenticado.** El padre
G2048-09 conserva sus límites sobre bots con pausas variables y multicuenta sin
identidad verificada.
