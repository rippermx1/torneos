# G2048-09.4 — integración y recorrido administrativo autenticado

2026-10-05. **Terminado y probado en el ambiente local 3081.** Las migraciones
revisadas de 09.2/09.3 y la candidata web están integradas; el recorrido pasó con
Supabase Auth, TOTP/MFA, HTTP, PostgreSQL y clics reales en la GUI. Cierre:
[E26](2048-ADMIN-INTEGRATION-CLOSURE-EVIDENCE.json). La preparación inicialmente
bloqueada se conserva en [E22](2048-ADMIN-INTEGRATION-EVIDENCE.json).

La plataforma conserva la autoridad sobre sesión, tablero, puntaje, revisiones,
sanciones y resultados. Unity `unity-2048-007` conserva su contrato de direcciones.
Este cierre local no habilita producción pública, dinero real ni aceptación humana.

## Ambiente recuperado e integración

Docker no arrancaba por dos sockets obsoletos en su directorio `run`:
`dockerInference` y `userAnalyticsOtlpHttp.sock`. Se comprobó que los procesos
Docker y su distribución WSL estaban detenidos y que el directorio contenía solo
esas dos entradas vacías. Se apartó el directorio, sin borrarlo, y se inició Docker
Desktop con su CLI. Este arreglo se basa en el error observado; no es un nuevo reset.
Los VHDX se conservaron y el motor volvió a responder con versión 28.3.0.
Referencia del comando: [docker desktop start](https://docs.docker.com/reference/cli/docker/desktop/start/).

La imagen aceptada `g2048-101-candidate-1790975961824` y Supabase seguían presentes.
Inventario previo: **74 perfiles, 22 partidas, 22 resultados y 58 migraciones**.
No hizo falta reconstruir la base, restaurar un dump ni cambiar claves,
contraseñas o MFA existentes. Se guardó un dump privado de public/auth/historia
de migraciones antes de aplicar cambios. Esto no constituye un ensayo de
restauración de backups o Storage de WEB-16.

`2048-integrity-local.mjs --apply` aplicó exclusivamente las migraciones
`20261004184805_guard_2048_seed_visibility.sql` y
`20261005131216_guard_2048_integrity_reviews.sql` en una transacción. La comparación
de fingerprints confirmó filas preexistentes public/auth conservadas. Los siete
controles de esquema pasaron: semilla oculta al navegador, lectura de servicio,
RPC privadas, guard de finalización y rechazo de movimientos de cuentas suspendidas.

La candidata contiene **20 archivos propios revisados**, incluidos los dos del
host E23. El primer build falló porque `FROM sha256:…` se interpretaba como nombre
de repositorio. El constructor ahora fija una etiqueta local a la imagen
inspeccionada y verifica su ID antes de compilar. La primera corrida se conserva.
Next, TypeScript y la imagen Docker final compilaron correctamente.

Imagen activa: `torneos-app:g2048-094-candidate-1791231240545`.
ID: `sha256:51412127d028715b658a2921115b39d45a6dc874204728df34add89315312e25`.
Entrada: [2048 local](http://127.0.0.1:3081/play).

## Activación acotada y retorno

`activate-2048-integrity-local.mjs` usa solo el motor Linux local de Docker
Desktop en Windows. Primero inicia un preview propio en 65164, sin el runtime
Snake ni volúmenes compartidos; verifica salud/rutas y hashes de todos los
archivos de las cápsulas públicas y del servidor Snake contra la base aceptada.
Antes de sustituir la aplicación exige cero jugadores/salas Snake y cero torneos
activos con ventana futura. Todos esos controles pasaron.

Con `--activate`, conserva configuración runtime, comandos, usuario, healthcheck,
puertos, redes, alias y volumen del simulador. Compara esos valores después y
confirma los IDs de los otros diez contenedores. El preview se detuvo y eliminó;
los volúmenes compartidos se conservaron. La aplicación quedó healthy y el alias
`torneos-app:local` apunta a ella. Contenedor anterior detenido y conservado:
`torneos-app-g2048-094-backup-1791231446369`.

Un fallo de activación intenta restaurar ese contenedor. Un resultado desconocido
requiere inspeccionar el estado antes de repetir. El camino de rollback está
implementado; no se inyectó un fallo de activación en este recorrido. Volver solo
la imagen anterior no revierte migraciones ni operaciones confirmadas en la base.

Builds conservadas: `007 / level-030 / snake-arena-006 / factory-empire-014`.
Los avances posteriores de Factory/Ted/Snake en checkout/previews se conservaron
fuera de esta integración acotada.

## Recorrido comprobado

**12 controles Auth/MFA HTTP/SQL PASS**, con usuarios nuevos exclusivos del ensayo:

- Anónimo y no administrador no pueden inspeccionar ni decidir. El proxy aceptado
  redirige al anónimo al login con retorno interno exacto; el usuario sin rol
  recibe 403. Administrador AAL1 bloqueado en las cuatro rutas protegidas.
- Enrollment y challenge TOTP reales elevan la sesión a AAL2.
- Dos jugadores envían 31 movimientos aceptados cada uno; tablero y puntaje
  coinciden con DB. Estado seguro permitido al propietario y `seed` denegada.
- Señales pendientes bloquean finalización con 409, sin ranking/créditos.
- Motivo corto y partida ajena rechazados; descarte conserva autor/motivo.
  La otra revisión pendiente mantiene bloqueada la liquidación.
- Sanción bloquea cuenta, invalida partida y marca revisión; jugador suspendido
  no puede enviar otro movimiento.
- Reintento liquida solo al admitido y crea un crédito sintético. Sanción posterior
  conserva resultado y libro; desbanear no resucita la partida inválida.

La fixture usa el preset gobernado `freeroll_v1`, `is_test=true`, inscripción
gratuita y premio sintético de 500.000 centavos. Sin cobros/transferencias externas.
Cadencia reproducida ajustando solo timestamps de sus propias partidas y una
ventana de 600 segundos coherente con las restricciones DB. No representa input
humano ni prueba universal de automatización.

**11 observaciones de GUI autenticada PASS**, con fixture independiente: login,
desafío AAL1, TOTP, log/tablero de partida, motivo corto deshabilitado, descarte,
sanción, recarga con decisiones persistidas/partida inválida, cierre, ranking y
auditoría pública. Solo el admitido aparece con **192 puntos**; PostgreSQL confirma
una fila de ranking y un crédito. Auditoría pública: dos partidas y huellas de
seed, sin revelar semillas. La sesión del operador de prueba se cerró al terminar.

Práctica Unity real en 3081 con flechas y puntaje **0 → 8**. No se recompiló Unity:
los archivos de la cápsula se conservaron byte a byte. Regresiones dirigidas:
**101 pruebas web /6 archivos y 9 Node**, cero fallos/skips. Lint de los tres
scripts modificados/nuevos pasó sin errores ni advertencias.

Cada corrida Auth conserva su carpeta. Los fallos iniciales del ejecutor
(redirección anónima, preset y ventana) quedan registrados; el torneo live de la
corrida fallida se canceló de forma acotada, sin borrar registros. Usuarios y
torneos sintéticos quedan para inspección. Credenciales del operador GUI solo en
artefacto privado ignorado. Cuentas existentes y MFA de operadores conservados.

## Reproducción y límites

```powershell
node --test scripts/2048-integrity-local.test.mjs scripts/2048-integrity-joint-sql.test.mjs
node scripts/2048-integrity-local.mjs
node scripts/verify-2048-admin-local.mjs --run
node scripts/verify-2048-admin-local.mjs --run --prepare-browser
```

`--prepare-browser` deja un torneo de prueba en revisión para completar los clics;
no declara GUI verificada automáticamente. Construcción/activación exige una base
aceptada cuyo manifiesto coincida con la imagen operativa. El manifiesto 101 ya
es histórico: revisar la nueva base 094 antes de otra integración. No adoptar WIP
general mediante `local:up`.

**09.4 cerrado localmente; G2048-09 terminado en su alcance probado.** Pendientes:
04.4 (regreso real de segundo plano), 06.2/07.2 (personas/lector real), 08.1
(Xiaomi físico) y preparación operativa de producción. Bots con pausas variables
y multicuenta sin identidad verificada conservan límites explícitos. Sin cambios
cloud/Flow, dinero real, merge a main ni push.
