# G2048-07.2.1 — guía inicial y anuncios de carga

2026-10-05. **Implementado y probado técnicamente en preview local**. La plataforma
ofrece «Cómo jugar» antes de iniciar, durante la partida y al ampliar. Explica
una fusión 2 + 2 → 4, las cuatro direcciones, gesto móvil, Tab/Escape, consulta de
casillas y la diferencia entre práctica reiniciable y una partida de torneo.
El tablero Unity conserva únicamente fichas, puntaje y efectos.

El iframe referencia sus instrucciones con `aria-describedby`, con IDs únicos
por instancia. La carga tiene un progressbar con valor 0–100 y un estado textual
estable; el porcentaje ya no se repite en dos regiones de anuncios simultáneas.
El puntaje solo se anuncia después de iniciar y usa un estado atómico. Los
mensajes de juego conservan su región, y el reloj y la tabla no son anuncios en
vivo. Los controles de la guía tienen foco visible y mantienen el tamaño táctil
mínimo de 44 px; la zona de ayuda ampliada conserva desplazamiento propio.

## Evidencia E23

- **123 regresiones / 11 archivos PASS**, incluidos cuatro casos nuevos sobre
  guía inicial en ambas vistas, referencias únicas, progreso consultable sin
  porcentajes repetidos y puntaje confirmado. Tipos y lint PASS.
- **Next 16.3.8 producción PASS**, copia de HEAD `8196e25` con solo los dos
  archivos de host modificados; secretos y WIP paralelo excluidos. El build usa
  placeholders de entorno y no sirve como candidata operativa de Auth.
- **Navegador con host real y cápsula Unity `007`**, práctica local 1280×720:
  guía antes de iniciar, flechas y fusión hasta 4 puntos, Tab del canvas a la guía,
  Enter, consulta de 16 casillas, guía ampliada y Escape con foco devuelto al
  control de vista. Mismo puntaje y casillas entre vistas; sin desbordamiento
  horizontal. Capturas y datos en `artifacts/2048-first-move/`.
- Preview Vite del componente y cápsula reales. No sustituye páginas Next,
  Auth, APIs de torneo ni el ambiente 3081. No hubo nuevo build Unity ni cambios
  de reglas, servidor, DB, Flow o despliegue.

Durante las pruebas la configuración TypeScript compartida tuvo un fragmento
JSON duplicado. Se usaron configuraciones válidas aisladas. Al repetir el chequeo
la configuración compartida ya era válida; esta entrega no la modificó. Los
conteos anteriores corresponden a pruebas ejecutadas, no a la corrida bloqueada
durante ese estado transitorio.

[E23](2048-FIRST-MOVE-EVIDENCE.json) registra hashes, entorno y límites. Referencias:
[descripciones accesibles](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-describedby)
y [progressbar en WAI-ARIA](https://www.w3.org/TR/wai-aria-1.2/#progressbar).

## Continuación

**G2048-07.2 sigue En progreso**: faltan voz/navegación con lector de pantalla real,
comprensión de una persona nueva y teléfono físico. La comprobación DOM y de
teclado del agente no sustituye esas observaciones. La activación operativa del
host queda pendiente junto con la integración local: recuperar Docker, conservar
las cápsulas aceptadas y publicar el host revisado. El manifiesto de candidata
09.4 incorpora explícitamente estos dos archivos además de su delta 09.2/09.3.
