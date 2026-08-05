# Modelo de negocio: torneo de premio fijo

Vigente desde el 5 de agosto de 2026.

## Fórmula única

```text
venta_bruta = inscritos_pagados * precio_final
venta_neta = venta_bruta - IVA_incluido
contribucion = venta_neta - comision_Flow_neta - premio_fijo
```

La inscripción completa es venta de la empresa. El premio es un gasto propio y
no reduce el IVA de la venta.

## Reglas de publicación

- Entrada pagada mínima: $2.000 CLP.
- Premio fijo máximo: 55% de `entrada * mínimo`.
- Cupo máximo: 1,25 veces el mínimo.
- Distribución pagada estándar: 75% al primer lugar y 25% al segundo.
- Margen de contribución mínimo al mínimo de jugadores: 25%.
- Si no se alcanza el mínimo, el torneo se cancela y Flow devuelve cada pago.

## Formato del piloto

| Entrada | Mínimo | Máximo | Premio fijo | 1° | 2° |
|---:|---:|---:|---:|---:|---:|
| $2.000 | 8 | 10 | $8.800 | $6.600 | $2.200 |

Al mínimo, la contribución estimada es $4.135 (25,84%). Al llenarse, es
$7.369 (36,84%), antes de marketing, soporte, infraestructura, renta y otros
costos fijos.

La política detallada está en
[`politica-negocio-torneos.md`](./politica-negocio-torneos.md) y la mecánica del
libro en [`contabilidad-producto.md`](./contabilidad-producto.md).
