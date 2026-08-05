# Decisión cerrada: modelo de rentabilidad del piloto

Vigente desde el 5 de agosto de 2026. Este documento reemplaza el roadmap
histórico de premios variables por convocatoria.

## Modelo elegido

- Una inscripción directa por torneo, con precio final e IVA incluido.
- Un premio total fijo y una distribución fija publicados antes del pago.
- Premio máximo equivalente a 55% de la recaudación bruta al mínimo.
- Capacidad máxima de 1,25 veces el mínimo de jugadores.
- Dos posiciones premiadas por defecto: 75% / 25%.
- Inscripción pagada mínima de $2.000 CLP.
- Margen de contribución mínimo objetivo de 25% al mínimo de jugadores.
- Sin recompensas nuevas, reparto de ingresos ni intermediarios comerciales.

La implementación anterior de premios variables quedó retirada del esquema
operativo por la migración `20260805163009_fixed_prize_business_model.sql`. Sus
filas históricas se conservan únicamente como archivo privado de auditoría.

## Secuencia de validación

1. Operar un solo formato pagado: $5.000, mínimo 12, máximo 15 y premio fijo $33.000.
2. Medir llenado, contribución real, cancelaciones, recompra y retención D7/D30.
3. No abrir un segundo formato hasta llenar consistentemente el primero.
4. No aumentar premios o cupos antes de tres cierres mensuales conciliados.

Las fuentes de verdad vigentes son
[`politica-negocio-torneos.md`](./politica-negocio-torneos.md) y
[`contabilidad-producto.md`](./contabilidad-producto.md).
