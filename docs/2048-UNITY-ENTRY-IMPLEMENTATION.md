# 2048: Unity como único cliente jugable — G2048-10.1

Dirección aprobada por el propietario el 2026-10-02. La acción habitual
«Jugar ahora» abre Unity en `/tournaments/[id]/play`. La plataforma conserva
Auth, inscripción, inicio, duración, tablero/puntuación autoritativos y ranking.
Unity muestra la cápsula `unity-2048-007` y envía direcciones.

## Cambio entregado

- La ruta competitiva habitual monta `Unity2048` y conserva los controles de
  acceso existentes. Una partida propia puede recuperarse después del cierre;
  no se ofrece inicio si no hay inscripción, si no se puede consultar la partida
  o si terminó la ventana y no existe una partida propia.
- El marcador `/tournaments/[id]/play/unity` redirige a la ruta habitual.
  `/play/web` y `/play/unity` redirigen a práctica Unity `/play`, conservando
  únicamente un retorno seguro a la ficha del torneo.
- Se retiró el enlace «Abrir versión ligera». El cliente anterior permanece en
  Git y en la imagen operativa anterior como opción de retorno técnico. No se
  añadió una segunda copia Unity, un reinicio competitivo ni otra API de score.
- El backlog retira el requisito de alternativa ligera visible. Las pruebas
  físicas/humanas siguen en 06.2/07.2/08.1 y el regreso real desde segundo plano
  sigue en 04.4; se mantienen separados de la implementación de estas rutas.

## Verificación

195 pruebas en 14 archivos: rutas/alias, acceso por propietario, recuperación,
reloj, navegación, resultado y cierre. ESLint sin avisos. Compilación Next 16.3.8,
TypeScript y Docker standalone PASS. Se consultó la documentación instalada de
`redirect`: una respuesta transmitida puede redirigir con meta refresh y HTTP 200.
Las comprobaciones HTTP verifican ese destino además de la redirección HTTP 307.

14 comprobaciones HTTP sobre la candidata: acceso anónimo/ajeno, recuperación
propia, alias y retorno seguro, Unity disponible, sin enlace al cliente anterior,
sin crear/alterar juegos por cargar páginas y aplicación operativa healthy.

Navegador real en candidata 3082: ficha → «Jugar ahora» → Unity `007`, recuperación
de la partida existente, vista ampliada/retorno y revisión de captura por el agente.
El enlace competitivo antiguo recupera el mismo gameId
`df50a5c6-05bd-4f4b-9e22-20b466e83210`, score final **16** y ranking oficial **16**.
La práctica antigua llega a Unity con retorno a la ficha; el host inicia la partida
y las flechas producen fusión **0 → 4**. No es aceptación visual humana.

Se reutilizaron fixtures propias de 04.4. Abrir `parallelStart` recuperó su partida
vencida y confirmó timeout en 0 mediante la API existente. No se crearon torneos,
usuarios o partidas adicionales ni se ejecutó finalización/cron global. El premio
mostrado pertenece a un torneo local de prueba, sin cargo real.

## Candidata y límites

Preview aislado: **http://127.0.0.1:3082/play**. Imagen
`torneos-app:g2048-101-candidate-1790975961824`, SHA
`cb0d154790ac90846059a318d5ce395cce30d04ebc55104cb4f86a808dc68f20`.

Se derivó del contexto aceptado de 04.4 y solo se sustituyeron cinco páginas.
La copia del catálogo recibió únicamente la retirada del enlace 2048; el WIP
compartido de Ted/Snake/Factory permanece en el checkout. Builds preservadas:
`007 / level-030 / snake-arena-006 / factory-empire-014`.

**3081 no se reemplazó**: conserva
`g2048-044-candidate-1790973340774`, SHA
`4d22824563919416303d1de1a855ea664c46620fbb764e5b892a92e67f30409f`.
La candidata corre como web aislada, sin montar volúmenes operativos ni iniciar
un segundo servidor Snake. No se aplicaron migraciones ni cambios Flow/despliegues
externos. A06 operativo queda pendiente de activar/verificar esta imagen en 3081.

Teléfono físico, lector de pantalla, aceptación humana y regreso real tras
suspensión siguen sin verificar. No hubo merge a main ni push.

## Reproducción

- `scripts/build-2048-unity-entry-candidate.mjs`: deriva una candidata del contexto
  y la imagen aceptados; rechaza un ambiente operativo diferente. No la activa.
- `scripts/preview-2048-unity-entry.mjs`: inicia la candidata web en puerto 3082
  libre; rechaza reutilizar un contenedor existente. No reemplaza 3081.
- `scripts/verify-2048-unity-entry.mjs`: checks HTTP/lectura con fixtures locales
  propias, sin imprimir credenciales ni repetir inicios.

[Evidencia E17](2048-UNITY-ENTRY-EVIDENCE.json). Logs y manifiestos de preview
en `artifacts/2048-unity-entry`, ignorados por Git.
