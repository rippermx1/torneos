# Plataforma comercial y clientes Unity

## 2048

`Unity2048Session` organiza práctica, inicio explícito de torneo, estado servidor,
una jugada en vuelo, no-op, recuperación mediante recarga y cierre por timeout.
`Unity2048` comprueba origen y ventana emisora, canal, versión y build. La build
solo comunica direcciones/reinicio; no hay credenciales Supabase/Flow en Unity.
No se optimizan jugadas competitivas con un puntaje calculado en el cliente.

La práctica `/play` no escribe DB. `/play/web` y `/play/unity` redirigen a `/play`
conservando el retorno seguro al torneo. Los componentes web legado se conservan
en `components/game/game-board*.tsx`. `/tournaments/[id]/play` monta el cliente Unity. No se afirma E2E
remoto, integridad humana, aceptación legal ni elegibilidad de una nueva modalidad.

## Archivos WebGL

Solo `public/games/:game/:build/index.html` admite iframe del mismo origen y CSP
necesaria para scripts propios y WebAssembly. Las demás páginas mantienen DENY y
su CSP. El proxy excluye `/games/` (archivos públicos compilados, sin datos privados),
incluyendo `.wasm`, `.data` y manifiestos. Páginas de juego/API siguen protegidas.

El publicador copia una build explícita e inventaría SHA256; un ID existente es
inmutable. Los bundles y cachés se ignoran en Git. Reconstruye/publica localmente
antes de empaquetar un despliegue. `.vercelignore` excluye fuentes Unity y arte local.
No se subió ningún recurso externo como parte del traslado.

La cápsula activa `unity-2048-007` usa stripping High y gzip con encabezados específicos para
JS, datos y WASM. La verificación HTTP descomprime y compara hashes contra la build.
El modo ampliado mantiene la proporción de cada juego dentro del viewport, conserva
el iframe y ofrece volver a la página. Usa CSS; no depende del fullscreen nativo.
La exclusión de fuentes Unity también se aplica al tracing de salida standalone.
