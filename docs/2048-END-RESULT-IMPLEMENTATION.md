# 2048 — fin visible y resultados de la plataforma

Fecha: 2026-10-06. Evidencia **E29**. Implementado, compilado, probado y activo
en el ambiente local [3081](http://127.0.0.1:3081/play). Commit de implementación:
`1848054`. Este incremento responde al aviso del propietario de que faltaba un
mensaje al agotar movimientos y la tabla al terminar. Amplía el cierre E28.

## Comportamiento

En práctica, al no quedar movimientos aparece **Práctica terminada**, la causa,
el puntaje final y **Nueva partida**. El panel toma el foco y bloquea la cápsula;
reiniciar limpia el resultado y devuelve el foco a Unity.

En torneo, el panel aparece después de recibir el cierre confirmado del servidor.
Muestra causa y puntaje final, bloquea nuevos controles de juego y consulta
automáticamente la clasificación del torneo. La tabla usa el mismo origen que
la página de ranking: puntaje, ficha, movimientos y usuario como desempates para
la clasificación provisional; posiciones y premios persistidos para resultados
oficiales. Se indica que la clasificación puede cambiar hasta finalizar el torneo.
Un fallo de consulta conserva el fin de partida y permite reintentar o abrir el
ranking completo. No altera el juego ni transforma el fallo en una tabla vacía.

El endpoint exige autenticación y devuelve únicamente campos públicos, con
`private, no-store`. El servidor determina la fila propia; no expone identificadores
de usuarios, correos, semillas ni tableros. La GUI rechaza tablas de otro torneo.
La cápsula sigue enviando direcciones, nunca un puntaje confiable del navegador.
Unity `unity-2048-007` se conserva: no hubo reconstrucción ni cambios de proyecto.

## Verificación

- **270/270 pruebas en 16 archivos PASS**: cierre de práctica, controles bloqueados,
  reinicio, GUI normal/ampliada, recuperación, reloj, navegación y foco; contratos
  de tablas, autenticación, errores y orden de ranking. Tipos y lint PASS.
- Build Next de producción PASS sobre la base aceptada congelada, con únicamente
  nueve archivos de producción de este incremento. El WIP compartido no se incorporó.
- Navegador con Unity real y tablero inicial sintético: último movimiento de práctica
  termina en 4 puntos, aviso visible y reinicio funcional. API sintética competitiva:
  cierre 132, tabla automática, GUI ampliada 390×844, error 503/reintento y tabla oficial.
  Las filas y premios de esta última prueba son sintéticos.
- Auth/API/PostgreSQL reales: recuperación de la partida ya cerrada E27, puntaje 4,
  tabla provisional con la fila propia y actualización en 3081. Se compararon la
  partida y sus movimientos con el cierre E28: tablero, puntaje, dos movimientos,
  estado, causa y marcas de tiempo permanecen idénticos. No se inició otra partida.
- Activación local PASS: contenedor healthy, configuración/redes/volúmenes y otros
  contenedores conservados; hashes de las cápsulas y servidor Snake preservados.

La imagen activa es
`sha256:4be2a7bcdc12e10d887458abfae3fd89112121e88dd4ed677048fa836e51b786`.
Respaldo detenido para rollback:
`torneos-app-g2048-result-backup-1791299679435`.
La activación permitió exclusivamente el torneo de prueba E27 identificado, con
su única partida ya completada; no alteró ventanas ni partidas para habilitarla.
Las dos filas activas de fixtures vencidos en torneos cancelados quedaron intactas.

## Evidencia y reproducción

[E29](2048-END-RESULT-EVIDENCE.json). Reportes locales ignorados:
`artifacts/2048-result/regressions.json`, `real-ranking.json`,
`operative-ranking.json`, `browser.json`, `candidate.json` y
`activation-12b2df5e-25ef-4d7a-b9d9-9a5322075f16/report.json`.
Capturas: `practice-ended.png`, `tournament-ended.png`,
`tournament-mobile-expanded.png`, `real-candidate-result.png` y `operative-result.png`.

`node scripts/verify-2048-result-local.mjs --operative` verifica el ranking
autenticado y el cierre inmutable en 3081 con la fixture existente. No modifica
esquema ni partidas. `node scripts/preview-2048-result.mjs` ofrece las pruebas
sintéticas en 65174; `?scenario=failure` permite comprobar el reintento.
Los previews propios 65174/65175 se detienen al terminar; se conserva 3081 y su respaldo.

## Alcance

Sin migraciones, Flow, liquidación de premios, despliegue público, assets externos
ni licencias. Teléfono físico y aceptación humana de este panel: **NOT_RUN**.
La prueba oficial no constituye un ensayo operativo de pago. La limitación de
3090/3083 que devuelve 404 para la cápsula 2048 sigue pendiente: esos previews
Snake no fueron modificados. Usar 3081 para este incremento.

Para otro incremento, usar `artifacts/2048-result/candidate.json` como imagen
operativa actual. El manifest de integración 094 conserva su valor histórico;
no debe reescribirse para eludir los controles de identidad de runtime.
