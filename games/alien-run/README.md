# Alien Run — traslado desde Orbit Arcade

Fuente de juego: `UnityProject` (Unity **6000.3.24f1**), SDK local en
`../../packages/unity-sdk` y consumidor copiado en `Assets/Orbit/SDK`.
Se conservan Assets, `.meta`, Packages y ProjectSettings. No se copia Library.

`node scripts/migrate-alien-run.mjs C:/play-games` desde la raíz copia solo el juego,
SDK y documentos de diseño, compara hashes y rechaza cambios propios en destino.
El inventario local está en `artifacts/alien-run-transfer.json`. No borra el origen.
`source-manifest.json` conserva el catálogo del origen como evidencia, incluidas
sus referencias de laboratorio; el host de TorneosPlay usa el build real y su protocolo.

Integración nueva: `/play/alien-run`, iframe de origen propio, canal `orbit.arcade` v1,
configuración de práctica y resultado visible de monedas/estrellas/duración.
No migra la plataforma Orbit ni registra rankings de torneo. Para hacer competitivo
Alien Run se necesita una estrategia servidor y persistencia por juego en TorneosPlay.

Los assets KayKit y LocalArt se mantienen solo en este equipo y fuera de Git/Vercel.
Revisa licencias antes de distribuir una build con ese contenido. La copia local
preserva autorización existente, no agrega permisos comerciales nuevos.

Publicación local explícita de una build real: `npm run games:publish -- alien-run level-030 RUTA_BUILD`.
El script rechaza cambios con el mismo identificador de build. No sube ni despliega.
