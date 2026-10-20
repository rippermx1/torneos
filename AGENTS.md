<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Juegos Unity y plataforma

La plataforma comercial se mantiene en este monolito Next/Supabase/Flow. Los juegos
tienen proyectos separados en `games/alien-run/UnityProject` y `games/2048/UnityProject`.
Lee README y `docs/STATUS.md` antes de editar; después solo los contratos relevantes.
Conserva `.meta`, Packages, ProjectSettings y trabajo ajeno. Cada proyecto Unity real
es la fuente del juego; no reconstruyas una segunda copia desde semillas.

2048 competitivo envía direcciones, nunca una puntuación confiable del navegador.
Alien Run está integrado solo como práctica gratuita: su resultado local no habilita
premios ni constituye prueba de integridad. No habilites dinero con un booleano.
No cambies DB, Flow, despliegues, recursos externos ni licencias por esta migración.
Los assets KayKit y derivados LocalArt quedan locales e ignorados por Git; no enviarlos
a IA ni repositorios públicos. El arte GPT de 2048 tiene procedencia en el propio juego.

Compila y prueba incrementos útiles. Distingue compilación, pruebas Editor/navegador
y aceptación humana. No añadas gates ceremoniales o una arquitectura de microservicios.
`C:/play-games` se conserva como origen histórico y para cerrar cambios simultáneos;
sincroniza deltas con `scripts/migrate-alien-run.mjs`, que rechaza conflictos en destino.
