# 2048 — cliente Unity

Proyecto real: `UnityProject`, Unity **6000.3.24f1**, plantilla Universal 2D.
La escena `Assets/Torneos/2048/Scenes/Puzzle.unity` se crea con la API de Editor;
el runtime construye su Canvas, tablero y controles. Conserva fuentes y `.meta`.

- WebGL: `/play`, puente `torneos.2048` versión 1, build `unity-2048-002`.
- Práctica web: engine TS existente local, sin requests a una API de partidas.
- Editor/standalone: motor C# de práctica sin plataforma ni pagos.
- Torneos: `/tournaments/[id]/play/unity` reutiliza start/move/timeout existentes;
  solo se envía dirección y número de movimiento. El servidor decide tablero y puntaje.
- Arte original generado con `image_gen.imagegen`: fichas tintables y fondo.
  Prompts y modo en `ART-PROVENANCE.json`. No hay referencias de assets comerciales.

Desde la raíz: `npm run games:build:2048` crea escena, ejecuta EditMode/PlayMode,
compila WebGL con gráficos y copia la build local a `public/games/2048/unity-2048-002`.
Los resultados y logs quedan en `artifacts/unity-2048`. No despliega a Vercel.
`npm run dev:games` inicia una vista local con credenciales placeholder.

No sustituir el cálculo del servidor por `PracticeBoard`. Su RNG solo sirve en Editor;
no promete reproducir las semillas secretas de torneos. Las direcciones del cliente
son entradas no confiables: cálculo servidor no demuestra que haya jugado una persona.
