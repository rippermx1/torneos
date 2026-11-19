# WEB-11.1 — catálogo de 2048 y Ted Runner

2026-10-05. Implementado y probado en preview Next de producción. `/play/catalog`
ofrece dos fichas con descripción, controles y modalidad: 2048 tiene práctica y
acceso al catálogo de torneos; Ted Runner ofrece práctica gratuita sin torneos ni
premios. La página de catálogo no carga una cápsula Unity antes de elegir juego.
La entrada habitual `/play` conserva 2048 y ahora permite explorar el catálogo.

La navegación común de práctica conserva `next` al abrir el catálogo, elegir
cualquiera de los juegos y regresar por «Explorar juegos». Solo acepta la ficha
pública de un torneo con UUID mediante el validador existente; destinos externos,
administración, pagos, URLs de partida y parámetros duplicados se descartan.
«Torneo seleccionado» conserva el acceso directo a esa ficha. La práctica no
inscribe al jugador ni inicia una partida competitiva. Los enlaces existentes de
otras superficies mantienen su comportamiento; no se afirma que todo enlace
global «Practicar» conserve un torneo.

Ted usa su entrada compatible `/play/alien-run`, que el trabajo paralelo de marca
redirige a `/play/ted-runner`. El catálogo también funciona con la ruta histórica.
En `cloud-development`, la ficha explica que Ted no está disponible y no ofrece
un enlace de lanzamiento, respetando la disponibilidad actual de ese ambiente.
Las ilustraciones de las fichas usan texto y CSS propios, sin copiar arte del juego.

## Validación

- **135 pruebas /12 archivos PASS**, incluidas 12 nuevas de navegación, modalidad,
  disponibilidad, destinos inválidos y referencias al torneo. Tipos y lint PASS.
- **Next 16.3.8 producción PASS** en copia de HEAD `8c5c2df` con cinco archivos de
  catálogo/navegación y dos dependencias de marca Ted conservadas sin cambios.
  El alias existente se reprodujo en esa copia. No se incorporó el resto del WIP.
- **Cinco comprobaciones HTTP PASS**: catálogo normal, torneo seleccionado,
  destino externo, parámetros duplicados y redirección Ted con el mismo `next`.
- Navegador real: ambas cápsulas llegan a disponibles sin iniciar automáticamente;
  regreso desde ambas al catálogo conserva el torneo. Tab/Enter abre 2048. Sin
  iframe en el catálogo; controles propios de 44 px y sin desbordamiento desktop.
- Layout móvil: HTML y CSS compilados de Next en un iframe de 390×844, con scripts
  de aplicación retirados. Dos fichas en una columna, sin desbordamiento horizontal
  (375 px útiles con scrollbar) y enlaces de 44 px. Esto verifica layout, no tacto,
  hidratación móvil, menú del sitio ni un teléfono físico.

Capturas, manifiesto, reportes y logs locales: `artifacts/public-game-catalog/`.
[Evidencia](PUBLIC-GAME-CATALOG-EVIDENCE.json). Preview revisable:
[catálogo](http://127.0.0.1:65162/play/catalog).

## Límites e integración pendiente

**WEB-11 En progreso; 11.1 completo como incremento técnico en preview.** Falta
incorporar estos archivos al ambiente operativo junto con la marca Ted y aceptar
la navegación en teléfono. No se activó 3081 ni un despliegue público. El UUID del
recorrido es sintético: no prueba torneo existente, Auth, inscripción o pagos.
El entorno de compilación usa placeholders locales; los fallos esperables del
cliente Auth no se presentan como una consola global limpia ni sesión validada.

El layout común se aplica a `/play` y sus páginas hijas. Este catálogo cubre los
dos juegos del ticket WEB-11; las entradas existentes de Factory y Snake y sus
backlogs se conservan. No cambia gameplay, build Unity, reglas, DB, Flow, MFA,
configuración operativa ni recursos externos. G2048-09.4 sigue pendiente por Docker.
