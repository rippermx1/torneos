# Roadmap: retención + rentabilidad ("máquina de dinero")

> **Propósito de este archivo.** Es la fuente de verdad y handoff de la iniciativa
> de rediseño económico de TorneosPlay. Si la ventana de contexto del modelo se
> satura, **empezar por aquí**: contiene la estrategia, los parámetros decididos,
> el plan por fases, el mapeo al código, el estado de integración y las invariantes
> que NO se deben romper. Mantener la sección "Estado de integración" al día a
> medida que se avanza.

Última actualización: 2026-07-02 · Rama de trabajo: `feat/prize-ladder-retention`

---

## 1. El problema y la decisión

El modelo actual publica **premios fijos = 70% × entry × mínimo de jugadores**, repartidos 70/20/10 al top-3. Como el premio es fijo, cada jugador por encima del mínimo es ~81% de utilidad — excelente margen — **pero el retorno al jugador (RTP = premio ÷ inscripciones) se desploma al llenarse**: 70% al mínimo → ~14% a target → ~4% al máximo. Eso convierte torneos populares en un "rake" de 60-95%, que destruye la retención.

**Decisión del dueño (2026-07-02):** el producto es competencia de **habilidad**, no azar. Se paga por competir; el premio está pactado y publicado; lo gana el mayor puntaje. Por lo tanto la restricción legal permite premios que suben con la convocatoria **siempre que sean fijos, publicados y garantizados antes de inscribir** (no "% del pozo"). Con esa base, la solución es:

**Bolsa garantizada escalonada** (premios fijos publicados por tramos que suben con la convocatoria, calibrados para mantener ~30% de margen y RTP ~52-70% en todo nivel de llenado) + **stack de retención** (rakeback, brackets por habilidad, temporadas, torneo insignia) + **anti-cheat** reforzado.

La tesis económica (validada por modelo): un rake sano sobre una base grande, fiel y frecuente rinde mucho más que un rake alto sobre una base que se fuga. Comparación en régimen:
- Plano (hoy), rake alto, base que se fuga: ~$0,5M/mes.
- Escalera + retención, rake sano, base fiel: ~$2,7M/mes (5×).
- Escalera a escala nacional: ~$25M/mes.

---

## 2. Parámetros decididos (product config)

| Parámetro | Valor de partida |
|---|---|
| Tramos de la escalera | Múltiplos del mínimo: **1× · 2,5× · 5× · 8× · 13×** (umbral = round(mult × min), capado a max_players) |
| Fondo por tramo | **70%** × entry × umbral (`DEFAULT_PRIZE_FUND_BPS = 7000`), split **70/20/10** |
| Rakeback | **7%** de cada inscripción como crédito **no retirable**, vence a 30 días |
| Brackets por habilidad | v1: 3 divisiones (novato/intermedio/pro) por percentil de score histórico; v2: Elo |
| Hold & review | Retener pago de premios sobre **~$50.000** hasta pasar replay + heurística |
| Cap interino max_players | ~2-2,5× min (opcional, hasta que la escalera esté viva) |
| Torneo insignia | Semanal, bolsa garantizada grande financiada de margen (presupuesto marketing) |

---

## 3. Workstreams y mapeo al código

1. **Escalera garantizada** — tabla `tournament_prize_tiers`; `finalize_tournament` elige el tramo por `registered_count` y paga 70/20/10; vista `prize_liability` usa el tramo vigente; `createTournament` publica la escalera; UI de ficha/card con progreso al siguiente tramo.
   - Archivos: `supabase/migrations/*_tournament_prize_tiers.sql`, `lib/tournament/finance.ts`, `finalize_tournament` (migración), `app/(admin)/admin/tournaments/new/page.tsx`, `components/tournament/*`, `app/(public)/tournaments/[id]/page.tsx`.
2. **Rakeback créditos** — tipo `tournament_credit` (no retirable; `wallet_withdrawable_balance` ya excluye lo no-premio/refund); otorgar al liquidar; checkout consume crédito y cobra el resto por Flow.
   - Archivos: migración (type check en `009`), `settle_tournament_registration`, `app/api/tournaments/[id]/checkout/flow/create/route.ts`, `lib/accounting/model-a-report.ts`.
3. **Brackets por habilidad** — `profiles.skill_rating` o tabla `player_ratings`; recalcular tras `finalize`; gate de inscripción por rango; UI de división.
   - Archivos: migración, `finalize_tournament`, `register`/`checkout`, perfil/ficha.
4. **Anti-cheat hold & review** — `tournament_results.payout_status` (held/released); `finalize` retiene premios grandes; pasada automática replay+heurística; cola admin; mejorar `lib/anticheat/detector.ts` (anomalía estadística).
5. **Insignia + temporadas** — agregado de temporada/ranking; creación programada (reusa la escalera).
6. **Automatizar retiros/KYC** — rail de payout + proveedor KYC (Fase 3; hoy manual = techo de escala).

---

## 4. Plan por fases

- **Fase 0 — Cimientos (días):** cap `max_players`, tablero de retención/liquidez (PostHog), hold&review de premios grandes. *Salida:* RTP protegido + confianza.
- **Fase 1 — Escalera (2-3 sem):** workstream 1. Rollout **A/B** (escalonados en paralelo a planos para una cohorte, feature flag) midiendo llenado + retención D7/D30. *Salida:* lift confirmado → switch total.
- **Fase 2 — Motor de retención (3-4 sem):** rakeback + brackets + temporadas. *Salida:* entries/jugador/semana ≥ 2, D30 estable.
- **Fase 3 — Escala (continuo):** insignia semanal, automatizar retiros/KYC, anti-cheat v2, referidos.

**Regla de rollout:** cada fase se promueve solo si mueve su métrica de salida en la cohorte piloto. No escalar premio ni gasto de adquisición hasta probar retención.

**Tablero (North Star + soporte):** inscripciones/jugador-activo/semana · retención D1/D7/D30 · jugadores promedio por torneo (liquidez) · % torneos que superan tramo 2 · margen neto efectivo · pasivo (wallet + créditos) · CAC/LTV.

---

## 5. Invariantes que NO romper

- **Dinero siempre en centavos** (bigint en DB).
- **Wallet solo vía `wallet_insert_transaction`** (advisory lock por usuario). Nunca UPDATE directo al saldo.
- **Premios FIJOS y PUBLICADOS antes de inscribir.** La escalera son tramos fijos publicados/garantizados, no "% de pozo". Nunca framear como porcentaje del dinero recaudado.
- **Solvencia:** cada tramo `fund_cents ≤ entry_fee_cents × su umbral`. El tramo base ≤ entry × min (constraint `tournament_prizes_solvent_at_min_players` ya existe).
- **Contabilidad efectiva:** IVA = 19/119 × (cobros − premios pagados − reembolsos); resultado operativo resta la comisión Flow neta (la plataforma la absorbe). La escalera NO la cambia (premios siguen siendo premios pagados). **Rakeback SÍ la toca:** asentar como gasto de marketing y contar como "cobros" solo el efectivo (no la parte pagada con crédito). Confirmar con contador.
- **Sin lenguaje de casino/azar** ("pozo", "apuesta", "casa", "jackpot"). Usar "torneo/inscripción/premio/ranking/bolsa garantizada".
- **`finalize_tournament`** solo corre en estado `finalizing`, idempotente por guard de status.
- **Reembolsos (ya arreglado, commit 306e7d3):** `cancel_tournament`/`issueFlowRefunds` filtran `status='paid'`; red de seguridad `reconcileCancelledTournamentRefunds`; auto-refund de pagos no asentables en `settleFlowPayment`.
- **Age-gate:** `isAdult(birth_date)` (18+, TZ-safe) en onboarding, register y checkout.

---

## 6. Estado de integración (MANTENER AL DÍA)

Leyenda: ✅ hecho · 🚧 en progreso · ⬜ pendiente

### Fase 1 — Escalera garantizada
- ✅ **Migración `tournament_prize_tiers`** — `supabase/migrations/20260702000000_tournament_prize_tiers.sql`: tabla + backfill (cada torneo existente recibe su tramo base) + trigger `check_prize_tier_solvency`. Aditiva; nada la lee aún. **No aplicada a prod** (feature, va por flujo normal).
- ✅ **`finance.ts`: `buildPrizeLadder()` + `selectPrizeTier()`** — funciones puras + `DEFAULT_PRIZE_LADDER_MULTIPLES`. Tests en `__tests__/prize-ladder.test.ts` (9, verdes). Aditivas; nadie las llama aún.
- ✅ `createTournament` publica la escalera — `app/(admin)/admin/tournaments/new/page.tsx`: usa `buildPrizeLadder` (pagados) o tramo único (freerolls); inserta en `tournament_prize_tiers` con rollback del torneo si falla. Columnas `prize_*_cents` = tramo base.
- ✅ `finalize_tournament` paga por tramo — migración `20260702010000_finalize_by_prize_tier.sql`: selecciona el mayor umbral ≤ inscritos, con **fallback** a columnas `prize_*_cents`. Metadata y return exponen `applied_tier_threshold`. Idempotencia + guard `finalizing` intactos.
- ✅ `types/database.ts` — interfaz `TournamentPrizeTier` + entrada en `Tables`.
- ✅ UI — `components/tournament/prize-ladder.tsx` (escalera con tramo actual resaltado + "faltan N para subir la bolsa"); ficha `app/(public)/tournaments/[id]/page.tsx` muestra la bolsa del tramo aplicable según inscritos; card del listado usa "1° premio desde" en pagados.
- ⬜ Vista `prize_liability` al tramo vigente (hoy usa solo el base → **subestima** el comprometido en torneos llenos; no es bug de pago, sí de monitoreo de solvencia). Pendiente (menor).
- ⬜ Preview de la escalera en el form admin de creación (menor).
- Cobertura: lógica de tramos en `__tests__/prize-ladder.test.ts` (pura); `finalize` (SQL) se valida en el piloto de prod. 163/163 verdes.

**Fase 1 funcionalmente completa** (falta solo la vista de monitoreo y el preview admin, ambos menores). Lista para desplegar y pilotear en prod. Orden de deploy: aplicar migraciones `20260702000000` → `20260702010000` **antes** de desplegar el código (createTournament ya inserta tramos).

### Fase 0
- ⬜ Cap `max_players` en presets (o validación en `createTournament`).
- ⬜ Eventos PostHog de retención/liquidez.
- ⬜ Hold & review de premios grandes.

### Fase 2 — Motor de retención
- ✅ **Brackets por habilidad** (rama `feat/skill-brackets`) — migración `20260702020000_skill_brackets` (`player_ratings` + `tournaments.skill_tier`); `lib/tournament/rating.ts` (`tierForRating`/`updateRating`/`canRegisterForTier` + tests); rating actualizado tras `finalize` en el lifecycle; **gate de inscripción** en checkout + register; select de división en el admin; badge en la ficha. **NO aplicada a prod aún.** Umbrales de división (8.000 / 30.000) a CALIBRAR con datos reales.
- 🚧 **Rakeback en créditos**. **Incrementos 1 y 2-parte-1 HECHOS** (no aplicados a prod; increment 1 en `main` inerte, redención en rama `feat/rakeback-redeem`):
  - Incr. 1 (`main`, inerte): migración `20260702030000` (tipo `tournament_credit` + `wallet_credit_balance`), helper `lib/wallet/rakeback.ts`, **otorgamiento** del 7% al liquidar.
  - Incr. 2 parte 1 (`feat/rakeback-redeem`): **consumo todo-o-nada** — migración `20260702040000` (`register_with_credit`, RPC atómico: verifica crédito ≥ cuota, inscribe, debita); checkout con flag `useCredit`; UI (botón "inscribirme con crédito" + saldo en wallet/ficha); smoke `scripts/smoke-rakeback-redeem.mjs`.
  - **PENDIENTE incremento 2 parte 2 (antes de desplegar):** (b) contabilidad — asentar el grant como marketing en `model-a-report`, excluir inscripciones con crédito de los cobros efectivos (confirmar con contador); (c) **expiración FIFO a 30 días** (cron). La aplicación PARCIAL (crédito + Flow por el resto) queda como mejora futura; hoy es todo-o-nada.
- ⬜ Temporadas / ranking.

### Fase 3
- ⬜ Insignia semanal · ⬜ Automatización retiros/KYC · ⬜ Anti-cheat v2 · ⬜ Referidos.

**Despliegue:** este trabajo es feature nueva → flujo normal (rama → review → merge → deploy Vercel + aplicar migración). NO aplicar migraciones de feature directo a prod (a diferencia del hotfix de reembolsos, que fue autorizado explícitamente).

---

## 7. Contexto relacionado
- Hallazgos de auditoría y fixes de lanzamiento: memoria `project_deep_audit_jul2026.md` y commit `306e7d3` (reembolsos, contabilidad Flow, age-gate).
- Modelo económico reproducible: ver scripts de análisis (`scripts/analyze-business-model.mjs` es solvencia; el modelo forward de rentabilidad/retención se puede portar a `scripts/` si se decide).
