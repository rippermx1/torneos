# G2048-04.4 — regreso real desde segundo plano

**Actualización E28:** [cerrado con el criterio simulado aceptado por el propietario](2048-SIMULATED-ACCEPTANCE.md).
La fixture de esta entrega se consumió una sola vez y quedó cerrada por timeout
natural, con puntaje 4. La omisión y el estado inicial que se describen abajo son
el antecedente E27; no representan una prueba física ejecutada después.

Fecha: 2026-10-05. Estado: **en progreso; recorrido real omitido por el propietario**.

Se verifica la plataforma local 3081 y la cápsula `unity-2048-007` sobre la imagen
094 integrada en E26. El servidor conserva la autoridad del tablero, el puntaje,
la identidad de la partida y su deadline; Unity presenta el estado confirmado.

El navegador integrado disponible sigue declarando `document.hidden=false` y
`visibilityState=visible` tanto al ocultarlo como al abrir otra pestaña visible.
No se despachan eventos sintéticos ni se confunde ese comportamiento con una
suspensión real. El propietario confirmó la carga de Unity y el botón de inicio
disponible en Chrome de escritorio. Al solicitar el primer cambio real de pestaña
respondió **«omite»**. Se omitió ese recorrido; no se inició la partida ni se
registró un regreso vigente o vencido. La lectura posterior de PostgreSQL a las
20:57:56 UTC confirma cero partidas y cero movimientos en esta fixture.

## Fixture identificada

- Torneo: `82f51723-acf1-4676-8d9a-49906a11e47f`.
- Usuario de prueba: `3c149ab4-e036-42b9-a5b4-0c9e5e7330ad`.
- Imagen: `sha256:51412127d028715b658a2921115b39d45a6dc874204728df34add89315312e25`.
- URL: `http://127.0.0.1:3081/tournaments/82f51723-acf1-4676-8d9a-49906a11e47f/play`.
- Torneo `is_test`, contrato gobernado `internal_test_v1`, entrada gratuita,
  duración natural 300 segundos y premio sintético de 100 centavos requerido por
  el preset. No se liquida el torneo desde este verificador.
- Credenciales sólo en `artifacts/2048-background/login.private.txt`, ignorado.
  Se creó una cuenta exclusiva; no se cambiaron contraseñas ni permisos existentes.

## Recorrido y cierre

1. Entrar en Chrome con la cuenta de prueba y esperar la carga de Unity.
2. Iniciar, hacer un movimiento y anotar puntaje/tiempo. Cambiar realmente a otra
   pestaña durante 20–30 segundos, regresar sin recargar y comprobar que el tiempo
   disminuyó, se conserva el tablero y se permite otro movimiento.
3. Mantener la partida en segundo plano hasta superar los cinco minutos desde
   su inicio. Regresar sin recargar: el resultado debe estar cerrado por timeout,
   el tiempo en cero y el tablero debe rechazar direcciones nuevas.
4. Contrastar gameId único, board/score/move_count/started_at persistidos y las
   fechas de movimientos. Confirmar cierre inmutable, recuperación idempotente
   y rechazo de una dirección tardía mediante HTTP autenticado contra 3081.
5. Comprobar el mismo puntaje en el ranking visible. Distinguir la observación
   humana del segundo plano de las comprobaciones automáticas del servidor.

El script no acelera ni desplaza el reloj, no modifica tableros y no crea una
segunda partida para repetir la prueba. `verify-closed` exige que el juego ya esté
cerrado antes de consultar APIs: no puede fabricar el cierre que pretende observar.

```powershell
node scripts/verify-2048-background-local.mjs prepare
node scripts/verify-2048-background-local.mjs watch
node scripts/verify-2048-background-local.mjs checkpoint before-background
node scripts/verify-2048-background-local.mjs checkpoint returned-active
node scripts/verify-2048-background-local.mjs checkpoint before-expired-return
node scripts/verify-2048-background-local.mjs verify-closed
```

`prepare` rechaza reutilizar el directorio con una fixture identificada. Los
checkpoints también rechazan sobrescribir evidencia. `watch` lee únicamente la
partida del usuario/torneo identificados cada dos segundos, guarda cambios de estado
en el directorio ignorado y termina al cierre o a los 15 minutos. No demuestra
por sí mismo que Chrome estuviera oculto. No ejecuta cron, reset ni migraciones.

## Validación técnica de esta entrega

53 pruebas existentes de reloj, ciclo de vida del host, recuperación y controles
PASS en cuatro archivos, ejecutadas secuencialmente en 1,94 segundos. La primera
ronda paralela tuvo dos timeouts de 5 segundos durante recuperación (51 PASS,
2 timeouts); la repetición con un worker y timeout de 15 segundos pasó sin cambios
de código del juego ni de sus pruebas. Creación gobernada de la fixture y lectura
del estado inicial sin partida PASS. Las pruebas unitarias no cierran el recorrido
físico. Lint del script PASS. El monitor propio se detuvo al omitirse el recorrido;
la fixture y sus credenciales locales se conservan. No se modifica ni recompila
Unity, ni se activa otra imagen.

El script rechaza `prepare` duplicado y `verify-closed` sin partida iniciada
(dos controles reales PASS, exit 1 esperado), conservando el manifiesto. Durante
esa verificación, la excepción superior sin manejar tras `fetch` provocó salida
Windows `3221226505`/assert de libuv en Node 24. Se corrigió el manejo superior
de errores, sin imprimir configuración ni respuestas privadas. El mismo auxiliar
de procesos hijos después pasó ambos rechazos. Se conserva el fallo original como
antecedente; esos controles no sustituyen un resultado real, todavía `NOT_RUN`.

[Recorrido competitivo previo E16](2048-COMPETITIVE-IMPLEMENTATION.md) ·
[Ambiente integrado E26](2048-ADMIN-INTEGRATION-CLOSURE.md).

G2048-04 y 04.4 permanecen en progreso hasta terminar el recorrido descrito.
Esta aceptación es de escritorio local; teléfono físico, suspensión del sistema,
staging externo y lanzamiento con dinero real mantienen sus criterios separados.
