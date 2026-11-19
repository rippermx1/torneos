# G2048-04.4: recorrido competitivo autenticado

**Cierre 2026-10-05 / E28:** el propietario acepta pruebas simuladas para terminar
el ticket. [Cierre y criterio revisado](2048-SIMULATED-ACCEPTANCE.md): Auth/API/DB
reales y suspensión modelada, deadline natural, resultado/GUI/ranking coherentes.
04.4 queda terminado en ese alcance; no se afirma segundo plano físico real.
Los estados E16/E27 siguientes son antecedentes anteriores a esa decisión.

Continuación 2026-10-05: [recorrido real y fixture E27](2048-BACKGROUND-VALIDATION.md).
Unity cargado en Chrome, según el propietario. Se omitió el cambio real de pestaña
por su respuesta «omite»; G2048-04.4 permanece en progreso. Imagen actual: 094/E26.
La evidencia siguiente conserva las ejecuciones originales del 2026-10-02.

2026-10-02. **En progreso: recorrido local verificado; regreso real de segundo plano pendiente.**
Rama `codex/2048-clean-gameplay`, base `c299b91`. No merge a main.
[Evidencia estructurada](2048-COMPETITIVE-EVIDENCE.json).

El host y la cápsula `unity-2048-007` funcionan en 3081 con usuarios Auth locales:
inscripción gratuita, inicio explícito, direcciones calculadas por el servidor,
recarga, recuperación de estado, cierre y ranking oficial. Unity presenta tablero
y puntaje; la plataforma conserva autorización, reloj, resultados y torneos.
Una puntuación enviada por el navegador no sustituye el cálculo del servidor.

## Hallazgos y correcciones

| Caso | Stack operativo anterior | Corrección preparada | Verificación |
| --- | --- | --- | --- |
| Dos inicios leen que no existe partida antes de insertar | Una respuesta 200 y otra 500 por la restricción única; una sola fila | Ante `23505`, leer la partida del mismo torneo/usuario; devolver su snapshot sin otro INSERT | Barrera HTTP contra Supabase local, **200/200 y mismo ID**, antes y después de activar la candidata |
| Un movimiento queda pendiente mientras timeout confirma el resultado | Timeout devuelve score 16 / count 0; el RPC posterior cambia la fila completada a score 20 / count 1 y responde `gameOver:false` | RPC bloquea la fila, exige partida activa, vigencia al adquirir el bloqueo, secuencia y tablero previos coincidentes | **13 comprobaciones PostgreSQL 17 desechable PASS**. RPC aplicado con autorización: **400 + snapshot final score 16 / count 0**, sin movimiento insertado; también conserva ranking finalizado |
| Conflicto de movimiento entre pestañas | Un conflicto RPC puede convertirse en error 500 | La API lee el ganador por gameId/torneo/usuario; devuelve cierre persistido o 409 recuperable, sin repetir la dirección | Regresiones y dos pestañas Unity reales en 3081 PASS: dirección válida eleva score 8 → 16; dirección obsoleta se bloquea y el botón recupera 16 / count 5 |
| Fallo de escritura del timeout | No debe inventar un resultado cerrado | Contrato anterior confirmado: 503 `GAME_CLOSURE_UNCONFIRMED`, fila activa; recuperación posterior confirma cierre real | Transporte rechazado únicamente para la fixture propia, en proceso Next aislado; PASS en ambas imágenes |

La protección se aplica en
`supabase/migrations/20261002202731_guard_2048_move_commit.sql`, creada mediante
`supabase migration new`. Mantiene firma, escritura atómica y ejecución exclusiva
de `service_role`; `anon` y `authenticated` no pueden ejecutar el RPC. Usa
`clock_timestamp()` después del bloqueo para incluir la espera en el deadline.
La API consume `PT409`/`23505` mediante una lectura, nunca un replay del movimiento.
Con autorización explícita del propietario se aplicó únicamente esta migración
local, registrada como `20261002202731`. No se ejecutó `db push` ni se aplicaron
migraciones Snake ajenas. Copia exacta del RPC anterior e imagen de retorno preservadas.

## Evidencia ejecutada

- **9/9 casos API autenticados** sobre la imagen operativa en 3081: propietario,
  autorización, inscripción, una partida, score falsificado ignorado, persistencia,
  respuesta descartada después del commit, recuperación sin replay, reloj de cliente
  desfasado en un adaptador aislado, carreras de dirección, `no_moves` y timeout.
- Tras activar el paquete corregido: **4/4 casos nuevos directamente contra 3081**:
  inscripción/inicio/reanudación, cuatro direcciones válidas y score autoritativo,
  acceso de otro propietario rechazado, y último movimiento `no_moves` persistido.
- **240/240 pruebas web, 22 archivos**: rutas y dominio/consumidores de juegos;
  dentro de ellas **57 regresiones de rutas**. ESLint de los siete archivos JS/TS
  modificados sin errores ni advertencias. Next Docker/TypeScript/standalone PASS.
- Navegador real autenticado: ficha, inscripción, carga fría `007`, inicio explícito,
  flechas, recarga y dos pestañas recuperando la misma partida. Timeout natural de
  **300 segundos**: Unity, tabla accesible de 16 celdas y DB coinciden, score **4**.
  GUI normal/ampliada conserva resultado y enlace al ranking sin reinicio competitivo.
- Fixture cercana al fin preparada en su propia fila: cierre `no_moves`, score
  **128**; recuperado en Unity después del torneo completado, 16 celdas iguales a DB.
  No representa una partida orgánica completa ni una prueba humana de habilidad.
- Finalización explícita de torneos propios, mediante el RPC existente,
  sin cron global: cinco rankings coinciden con games en **4 / 128 / 0 / 16 / 128**,
  ranking primero; una sexta finalización protegida conserva **16** ante movimiento
  pendiente. Navegador muestra los rankings oficiales 4, 128 y 16.
- Reproducción determinista adicional con HTTP proxy y el mismo servidor real:
  **imagen anterior 1 PASS / 2 FAIL**; **candidata con RPC antiguo 2 PASS / 1 FAIL**;
  **paquete integrado con RPC corregido 4/4 PASS**. A01 corregido y confirmado en
  Supabase local. La barrera pausa transporte de una petición real; no simula el RPC.

## Paquetes y reproducción

Imagen anterior conservada para retorno: `torneos-app:g2048-007-20261002191810`,
`sha256:377066cba2bf7ef7ab16a39ec82cc8bb4eccf7d522c13f752442f601b2250579`.

Paquete corregido **activo y saludable en 3081**:
`torneos-app:g2048-044-candidate-1790973340774`,
`sha256:4d22824563919416303d1de1a855ea664c46620fbb764e5b892a92e67f30409f`.
Derivada del contexto congelado de 11.1; sólo sustituye las rutas start/move.
Conserva `007`, Ted `level-030`, Snake `snake-arena-006`, Factory
`factory-empire-014`, runtime y arranque Snake anteriores. El registro/GUI Factory
y Snake en desarrollo permanecen fuera de esta derivación. Variables de runtime,
volúmenes y redes coinciden con la imagen previa. `torneos-app:local` apunta a este
paquete. Sin jugadores ni torneos Snake
activos al sustituir únicamente el servicio web; Supabase no se reinició.

```powershell
node scripts/verify-2048-competitive-local.mjs prepare
node scripts/verify-2048-competitive-local.mjs api
node scripts/verify-2048-competitive-local.mjs api-fixed
node scripts/verify-2048-competitive-local.mjs state
node scripts/verify-2048-competitive-local.mjs finalize-owned
node scripts/verify-2048-interleavings-local.mjs
node scripts/verify-2048-commit-sql.mjs
node scripts/build-2048-competitive-candidate.mjs
node scripts/verify-2048-interleavings-local.mjs --candidate
node scripts/verify-2048-interleavings-local.mjs --integrated
```

`prepare` rechaza duplicar fixtures existentes. `api` conserva checks ya pasados;
su fecha describe la ejecución original, no una nueva ronda. Las barreras requieren
fixtures nuevas y rechazan reutilizar las registradas. Los scripts validan URLs y
proyecto local. El constructor requiere el contexto preservado de 11.1. El script
SQL sólo conecta a su contenedor desechable, sin puertos ni red de la plataforma.
Los procesos aislados se retiran al terminar; no se elimina ni reinicia el stack.

Fixtures: **3 cuentas nuevas y 18 torneos `is_test` identificados** hasta esta ronda,
IDs en `artifacts/2048-competitive/manifest.json`. Premio de prueba 100 centavos
($1 CLP) requerido por la restricción existente, entrada gratis y pagos simulados;
sin cobros Flow. Se conservan resultados y reproducciones fallidas para inspección.
No se reinician fixtures previas ni se ejecutan reset/reseed/prune/cron general.
Credenciales sólo en `artifacts/2048-competitive/credentials.private.json`, ignorado;
ni contraseña, cookies ni clave de servicio se incluyen en evidencia versionada.

Capturas locales: `terminal-normal.jpg`, `terminal-expanded.jpg`, `ranking.jpg`,
`no-moves-expanded.jpg`, `two-tabs-conflict.jpg` y `two-tabs-recovered.jpg`, dentro
de `artifacts/2048-competitive/`; también `fixed-terminal.jpg` y `fixed-ranking.jpg`
para el recorrido posterior a activar el RPC/host corregidos.

## Pendiente concreto

Verificar regreso real desde segundo plano. El navegador automatizado declaró
ambas pestañas `visible`; ese entorno no demuestra suspensión real. Chrome no
está conectado al controlador disponible. El contrato de reloj/retorno y el desfase
se comprobaron por separado, no como evidencia física. G2048-04.4 conserva este
criterio pendiente, aunque la carrera crítica y el recorrido local están corregidos.

Procedimiento restante: crear una fixture local identificada con ventana vigente,
iniciar en un navegador de escritorio real, anotar deadline/score, cambiar a otra
pestaña/aplicación durante 15–30 segundos y regresar; comprobar el tiempo servidor,
conservar gameId/moveCount y realizar una dirección válida. Repetir regresando
después del deadline: debe confirmar el cierre persistido y prohibir otro movimiento.
Adjuntar navegador, tiempos y estado DB; no reiniciar las fixtures terminadas.

Se solicitó y recibió autorización por la instrucción explícita de AGENTS.md:
«No cambies DB, Flow, despliegues, recursos externos ni licencias por esta migración».
El propietario respondió **«Autorizar ambos cambios locales»**; esa autorización
se ejecutó íntegramente. No queda una aprobación técnica pendiente para este paquete.
Staging externo, teléfono físico, lector de pantalla y aceptación humana siguen
separados. Los correos de las pruebas de fallo no se validan: el proceso aislado
no resolvía Mailpit, aunque inscripción y juego sí persistieron correctamente.
No se modifica Unity ni se ejecuta Editor en este incremento.
