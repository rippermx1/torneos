# 2048 — cliente Unity

Mejoras y validaciones independientes: [backlog 2048](../../docs/BACKLOG.md#2048).
Las pruebas locales autenticadas de inicio, movimientos y recuperación están en
`docs/LOCAL-ENVIRONMENT-EVIDENCE.json`; Unity ya es el único cliente jugable en
3081 (G2048-10.1). Staging y aceptación física/humana permanecen pendientes.
El backlog separa juego y plataforma comercial.

Proyecto real: `UnityProject`, Unity **6000.3.24f1**, plantilla Universal 2D.
Se conserva la escena `Assets/Torneos/2048/Scenes/Puzzle.unity` y su GUID;
el runtime construye el Canvas con tablero y puntaje. La herramienta de build
configura los recursos del proyecto existente sin reconstruir esa escena.

- WebGL: `/play`, puente `torneos.2048` versión 1, build `unity-2048-007`.
- Práctica web: engine TS existente local, sin requests a una API de partidas.
- Editor/standalone: motor C# de práctica sin plataforma ni pagos.
- Torneos: `/tournaments/[id]/play/unity` reutiliza start/move/timeout existentes;
  solo se envía dirección y número de movimiento. El servidor decide tablero y puntaje.
- Arte original generado con `image_gen.imagegen`: fichas tintables y fondo.
  Prompts y modo en `ART-PROVENANCE.json`. No hay referencias de assets comerciales.

Desde la raíz: `npm run games:build:2048` importa los recursos TMP del paquete local,
prepara el atlas Inter, ejecuta EditMode/PlayMode y compila WebGL con gráficos.
Copia la build local a `public/games/2048/unity-2048-007`.
Los resultados y logs quedan en `artifacts/unity-2048`. No despliega a Vercel.
`npm run dev:games` inicia una vista local con credenciales placeholder.

La GUI de la partida muestra solo tablero y puntaje: fondo claro y fichas GPT v3,
Inter en un atlas SDF estático. Inicio, nueva partida, tiempo competitivo y mensajes
pertenecen al host web. Unity no solicita reiniciar; la práctica empieza con el botón
de la plataforma y el torneo mantiene su único inicio por las APIs existentes.
Flechas/WASD y deslizar sobre el tablero comparten entrada y efectos de deslizamiento,
fusión, aparición y ganancia de puntos. Las animaciones solo representan un movimiento
confirmado; no predicen un resultado competitivo. Se respeta movimiento reducido.
Detalle de fuentes: `UnityProject/Assets/Torneos/2048/Resources/UI/README.md`.
Diseño y validación de la GUI: [2048-GUI.md](../../docs/2048-GUI.md).
La plataforma ofrece una tabla accesible del tablero confirmado y gestiona el foco
al ampliar/volver; Escape y Tab se comunican desde la cápsula al host.
Incorporación local: [G2048-11.1](../../docs/2048-INTEGRATION-IMPLEMENTATION.md).
Prueba física y mediciones: [G2048-08.1](../../docs/2048-DEVICE-IMPLEMENTATION.md).

No sustituir el cálculo del servidor por `PracticeBoard`. Su RNG solo sirve en Editor;
no promete reproducir las semillas secretas de torneos. Las direcciones del cliente
son entradas no confiables: cálculo servidor no demuestra que haya jugado una persona.
