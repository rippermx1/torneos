# Migración de TorneosPlay al modelo B2B — Hoja de ruta

Fecha: 2026-11-19. Estado: propuesta para revisión, sin implementación.

Este documento fija los requisitos, la arquitectura objetivo y las fases. Cada
fase tiene su propio plan detallado; el primero es
[2026-11-19-fase-1-fundaciones.md](2026-11-19-fase-1-fundaciones.md).

## 1. Requisitos (spec)

Del propietario, 2026-11-19:

1. Migrar la lógica de front y back a Clean Architecture + Feature-Sliced Design.
2. La UI tiene su propio sistema de diseño, también con capas limpias.
3. Eliminar las «magic variables» (números y cadenas sin nombre).
4. Nada de sobreingeniería.
5. Código limpio y escalable.
6. Ningún texto estático en el front: la UI recibe el texto como datos.

Del negocio (documento «TorneosPlay — Plan para hacerlo rentable»):

7. El cliente es una empresa: el jugador entra gratis y el premio lo pone el
   patrocinador. El dinero de los jugadores (billetera, Flow, retiros, KYC)
   queda congelado.
8. Cada empresa tiene su organización, marca (colores, logo, textos) y URL.
9. Formatos: torneo estándar (5–10 min) y sprint (60–90 s) con semilla
   compartida por torneo.
10. Registro con consentimiento por marca (Ley 21.719) y exportación CSV.
11. Bases y ganadores públicos por torneo (Ley 19.496, arts. 35 y 36).

## 2. Diagnóstico de la estructura actual

Medido sobre `C:\torneos`, rama `codex/2048-clean-gameplay`, 2026-11-19.

| Hallazgo | Evidencia | Consecuencia |
| --- | --- | --- |
| Lógica de negocio dentro de las rutas | 128 llamadas `.from('…')` de Supabase en `app/`, 64 en `lib/`; `app/api/tournaments/[id]/game/move/route.ts` tiene 274 líneas con validación, consultas, reglas y respuesta HTTP | No se puede probar una regla sin Next ni base de datos |
| Organización por tipo técnico, no por funcionalidad | `lib/tournament`, `lib/game`, `components/tournament`, `components/game` para la misma capacidad | Un cambio funcional toca 3–5 carpetas |
| Textos fijos en la UI | ~487 nodos de texto JSX, ~601 literales de frase en `.tsx`, 206 mensajes de error en `app/api` | Imposible personalizar por marca o traducir |
| Números mágicos | ~1.300 literales numéricos de 3+ dígitos en `app/` y `lib/` (p. ej. `limit: 240, windowMs: 60_000` en la ruta de movimiento) | Reglas escondidas y duplicadas |
| Colores fuera del sistema de diseño | 411 clases de paleta fija (`bg-green-100`, `text-amber-800`…) y 21 hex en `.tsx` | No hay tema por marca |
| Sistema de diseño casi inexistente | `components/ui/` tiene solo `button.tsx`; tokens shadcn en `app/globals.css` | Cada pantalla reinventa tarjetas, insignias y tablas |
| Archivos grandes | `components/game/game-board-client.tsx` 1.086 líneas; `lib/accounting/model-a-report.ts` 920; `app/(admin)/admin/page.tsx` 507 | Difícil de revisar y reutilizar |
| Base de código fragmentada | 5 ramas sin integrar, `main` sin commits desde el 5-ago, 382 cambios sin confirmar | Hay que consolidar antes de migrar |
| Lo que está bien y se conserva | Motor 2048 puro (`lib/game/engine.ts`, `rng.ts`), autoridad del servidor, ~3.850 pruebas, Supabase/RLS, MFA de administración | Se mueve tal cual a la nueva estructura |

## 3. Arquitectura objetivo

### 3.1 Principio

Una sola app Next.js. Sin monorepo, sin microservicios, sin contenedor de
inyección de dependencias. La migración es incremental (patrón estrangulador):
lo nuevo vive en `src/`, las rutas de `app/` pasan a ser delgadas y llaman a
`src/`, y el código antiguo de `lib/` y `components/` se borra cuando queda sin
referencias.

### 3.2 Capas (Feature-Sliced Design)

```
app/                      Rutas de Next (composición solamente; sin reglas ni textos)
content/es-CL/*.json      Textos de la UI, por espacio de nombres
src/
  views/                  Páginas completas (FSD «pages», renombrado por choque con Next)
  widgets/                Bloques de UI compuestos (tarjeta de torneo, tabla de ranking)
  features/               Acciones del usuario (inscribirse, jugar, exportar contactos)
  entities/               Conceptos del negocio (organización, torneo, participante, partida)
  shared/                 Sin negocio: ui (sistema de diseño), config, content, kernel, lib, infrastructure
```

Regla de dependencias: una capa solo importa de capas inferiores
(`views → widgets → features → entities → shared`). Dos slices de la misma capa
no se importan entre sí. ESLint lo hace cumplir (`no-restricted-imports`).

### 3.3 Clean Architecture dentro de cada slice

Solo los slices con reglas de negocio tienen las cuatro carpetas; un widget
puramente visual tiene solo `ui/` y `model/`.

```
src/entities/challenge/
  domain/           Tipos y reglas puras. Sin React, sin Next, sin Supabase.
  application/      Casos de uso y puertos (interfaces de repositorios, reloj).
  infrastructure/   Adaptadores: repositorios Supabase, mapeo fila → dominio.
  ui/               Componentes que reciben datos y textos por props.
  index.ts          API pública del slice; nadie importa rutas internas.
```

Composición: cada caso de uso es una función fábrica
(`makeRecordMove({ games, clock })`); la ruta de `app/` arma las dependencias.
No hay framework de inyección.

### 3.4 Sistema de diseño (`src/shared/ui`)

```
tokens/      CSS de tokens semánticos (superficie, texto, marca, éxito, alerta, peligro, espaciado, radios, tipografía)
theme/       BrandTheme → variables CSS validadas (tema por organización)
primitives/  Text, Stack, Card, Badge, Button, ActionLink
patterns/    KeyValueGrid, PageHeader, EmptyState, DataTable
```

Reglas: el sistema de diseño no conoce el negocio ni contiene textos; toda
etiqueta llega por props. Los colores solo existen como tokens semánticos; la
marca de cada empresa sobrescribe tokens, nunca clases.

### 3.5 Textos como datos

- Los textos viven en `content/es-CL/<espacio>.json`, tipados por su forma.
- El servidor los carga con `getContent('<espacio>')` y los pasa como props.
- Cada organización puede sobrescribir textos (Fase 3) con
  `mergeContent(base, overrides)`, que ignora claves desconocidas.
- Los errores del backend viajan como códigos (`GAME_NOT_FOUND`), nunca como frases; la UI los traduce con su contenido.
- Control: `react/jsx-no-literals` en `src/**` y una prueba de auditoría que
  falla si un `.tsx` de `src/` tiene texto fijo en `label`, `title`,
  `placeholder`, `alt` o `aria-label`, o clases de paleta fija.

### 3.6 Sin números mágicos

- Constantes con nombre en `src/shared/config/` (tiempo, zona horaria, moneda, límites de tasa).
- Las reglas de producto que cambian por torneo (duración, cupos, formato) son
  datos del torneo en la base, no constantes.
- ESLint `no-magic-numbers` en `src/**` (permitidos `-1, 0, 1`), salvo `config/` y pruebas.

## 4. Fases

Cada fase deja la app funcionando y desplegable. Horas estimadas para una
persona con agentes de IA.

| Fase | Entrega | Criterio de salida | Horas |
| --- | --- | --- | --- |
| 0. Consolidar la base | Limpieza del 6-nov confirmada en Git; `real-money-access` integrada (permisos A01, cuentas RM-14); una rama base `b2b/base` desplegada en torneos-dev | Suite completa, lint y build en verde sobre una sola rama; A01 cerrado en la base de datos de producción | 8 |
| 1. Fundaciones | Estructura `src/`, reglas de capas, kernel, config, contenido, sistema de diseño y la tarjeta de torneo migrada como primer slice vertical | Ver el plan de la Fase 1 | 25 |
| 2. Juego y competencia | `features/play-2048`: casos de uso iniciar, mover, vencer y ranking; códigos de error; semilla compartida por torneo; formato sprint (duración como dato); cliente web liviano por defecto, Unity opcional | Las 4 rutas de juego delgadas (<40 líneas), mismas pruebas de integridad en verde y prueba de carga con 500 jugadores concurrentes | 25 |
| 3. Organizaciones y marca | `entities/organization`; migración SQL (organizaciones, miembros, marca, textos propios); torneo con `organization_id` y formato patrocinado (entrada 0, premio descrito); landing `/c/[org]/[torneo]` con tema por marca | Un torneo de marca de demostración publicado con colores y textos propios, sin tocar código | 20 |
| 4. Participantes y consentimiento | Registro con consentimiento por marca, tabla de consentimientos, exportación CSV, solicitud de borrado; página pública de bases y ganadores | Recorrido completo de inscripción → juego → exportación con datos sintéticos, y prueba de borrado | 15 |
| 5. Backoffice B2B | Asistente para crear campañas, panel del cliente de solo lectura por enlace firmado, instrumentación de 6 eventos | Un operador crea y publica un torneo de marca en menos de 15 minutos | 20 |
| 6. Retirar el dinero real | Rutas de billetera, premios, retiros, checkout y KYC devuelven 404 y salen de la navegación; dos releases después, se borra el código (el historial SQL se conserva) | Sin referencias a `lib/flow`, `lib/wallet` ni `lib/payouts` desde `src/` ni `app/` | 8 |
| 7. Condicional: liga de capacitación | Motor de preguntas por equipos, registro auditable por trabajador | Solo si la validación comercial de 90 días elige este segmento | 60–80 |

Total de las fases 0–6: ~120 horas.

### Advertencia de negocio

El plan comercial pide vender antes de construir. Esta migración no debe
bloquear los pilotos: el primer piloto se puede operar a mano con el código
actual (fases 0 y 1 no cambian el comportamiento visible). Las fases 3 y 4 son
las que vuelven vendible el producto sin intervención manual; si un piloto
pagado aparece antes, se priorizan sobre la limpieza de la Fase 2.

## 5. Decisiones tomadas por defecto (revisar)

| Decisión | Valor por defecto | Alternativa |
| --- | --- | --- |
| Dinero real | Congelar (404 + fuera de navegación) y borrar en la Fase 6 | Borrar ya |
| Origen de los textos | JSON versionado en el repositorio (es-CL) + sobrescrituras por organización en la base | Todo en la base, editable desde el backoffice |
| Unity | Se conserva como cliente opcional, sin migrarlo | Retirarlo y quedarse solo con el cliente web |
| Juego | Solo 2048 (estándar y sprint); preguntas solo en la Fase 7 | Motor de preguntas desde la Fase 2 |
| Nombre de dominio | `challenge` (torneo de marca) en el código; «torneo» en los textos | Mantener `tournament` |
