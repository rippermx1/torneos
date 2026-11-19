# Arquitectura del código nuevo

Reglas para quien agregue código. El plan completo está en
[la hoja de ruta B2B](superpowers/plans/2026-11-19-migracion-b2b-roadmap.md).
La migración es incremental: lo nuevo vive en `src/`, `app/` solo compone y
el código de `lib/` y `components/` se borra cuando queda sin referencias.

## Capas

```
app/        Rutas de Next: arman dependencias y pasan datos. Sin reglas ni textos.
content/    Textos de la UI por idioma y espacio de nombres (content/es-CL/*.json).
src/
  views/     Páginas completas.
  widgets/   Bloques de UI compuestos (tarjeta de torneo).
  features/  Acciones del usuario (inscribirse, jugar, exportar).
  entities/  Conceptos del negocio (challenge, organización, participante).
  shared/    Sin negocio: ui, config, content, kernel, lib.
```

Una capa importa solo de capas inferiores: `views → widgets → features →
entities → shared`. Dos slices de la misma capa no se importan entre sí.
Desde otra capa, un slice se importa solo por su API pública (`@entities/challenge`,
nunca `@entities/challenge/domain/...`). Dentro de un slice, incluidas sus
pruebas, se usan rutas relativas. ESLint lo hace cumplir (`eslint.config.mjs`).

Alias: `@shared/*`, `@entities/*`, `@features/*`, `@widgets/*`, `@views/*`,
`@content/*`. El código antiguo sigue usando `@/`.

## Carpetas de un slice

Solo los slices con reglas de negocio tienen todas:

```
src/entities/challenge/
  domain/          Tipos y reglas puras. Sin React, Next, Supabase, ui ni infraestructura.
  application/     Casos de uso y puertos (interfaces de repositorios, reloj).
  infrastructure/  Adaptadores: repositorios Supabase, mapeo fila → dominio.
  config/          Constantes con nombre del slice.
  model/           Modelos de vista (widgets).
  ui/              Componentes que reciben datos y textos por props.
  index.ts         API pública.
```

Un widget puramente visual tiene `config/`, `model/`, `ui/` e `index.ts`.

## Casos de uso

Cada caso de uso es una función fábrica que recibe sus dependencias:

```ts
export function makeRecordMove({ games, clock }: { games: GameRepository; clock: Clock }) {
  return async (input: MoveInput): Promise<Result<MoveOutcome, MoveError>> => { /* … */ }
}
```

La ruta de `app/` las arma (`makeRecordMove({ games: supabaseGames(client), clock: systemClock })`).
No hay contenedor de inyección. Los errores viajan como códigos (`GAME_NOT_FOUND`)
dentro de `Result`, nunca como frases.

## Textos

- Todo texto visible vive en `content/es-CL/<espacio>.json`.
- Para un espacio nuevo: crear el JSON y registrarlo en
  `src/shared/content/registry.ts`. TypeScript infiere su forma.
- El servidor llama `getContent('<espacio>')` y pasa el texto por props o
  dentro de un modelo de vista. Las plantillas usan `{clave}` y se llenan con
  `interpolate`, que falla si falta un valor.
- `mergeContent(base, overrides)` aplica textos propios de una organización:
  solo reemplaza textos que ya existen.

## Sistema de diseño (`src/shared/ui`)

- `tokens/tokens.css`: tokens semánticos (`--ds-color-*`, `--ds-radius-*`,
  `--ds-space-*`) y sus utilidades Tailwind (`bg-ds-surface`, `text-ds-text-muted`,
  `gap-ds-md`, `rounded-ds-lg`…).
- `primitives/`: `Text`, `Stack`, `Card`, `Badge`, `ActionLink`, `Button`.
- `patterns/`: `KeyValueGrid`.
- `theme/`: `themeToCssVariables` valida el color de una marca (solo `#rgb`,
  `#rrggbb` u `oklch(l c h)`) y lo convierte en tokens.
- No conoce el negocio ni contiene textos.

## Prohibido en `src/`

| Regla | Control |
| --- | --- |
| Texto fijo en JSX | `react/jsx-no-literals` |
| Texto fijo en `label`, `title`, `placeholder`, `alt`, `aria-label` | prueba `ui-audit` |
| Colores de paleta (`bg-green-100`) o hex en `.tsx` | prueba `ui-audit` |
| Números en expresiones fuera de `config/` (salvo -1, 0, 1) | `no-magic-numbers` |
| Imports que violan las capas o entran a un slice | `no-restricted-imports` |

## Constantes

- Unidades, zona horaria, idioma y moneda: `src/shared/config/`.
- Constantes de un slice: su carpeta `config/`.
- Las reglas que cambian por torneo (duración, cupos, formato) son datos del
  torneo en la base, no constantes.
- Fechas y montos se muestran con `formatDateTime` y `formatMoney`
  (`src/shared/lib/format.ts`); los montos se guardan en centavos.
- La hora actual se obtiene con `systemClock` (`src/shared/kernel/clock.ts`).
