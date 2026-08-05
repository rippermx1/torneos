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

## Formato comercial gobernado

| Entrada | Mínimo | Máximo | Premio fijo | 1° | 2° |
|---:|---:|---:|---:|---:|---:|
| $5.000 | 12 | 15 | $33.000 | $24.750 | $8.250 |

Al mínimo, la contribución estimada es $15.506 (25,84%). Al llenarse, es
$27.633 (36,84%), antes de marketing, soporte, infraestructura, renta y otros
costos fijos.

## Sostenibilidad del negocio

Que un torneo tenga margen positivo no significa que la empresa completa haya
alcanzado equilibrio. El formato comercial produce los siguientes montos antes de
CAC, soporte, infraestructura, contador, asesoría jurídica e impuesto a la
renta:

| Inscritos | Venta bruta | Contribución | Margen | Contribución por inscrito antes de costos fijos |
|---:|---:|---:|---:|---:|
| 12 | $60.000 | $15.506 | 25,84% | $1.292 por inscrito |
| 13 | $65.000 | $19.548 | 30,07% | $1.504 por inscrito |
| 14 | $70.000 | $23.591 | 33,70% | $1.685 por inscrito |
| 15 | $75.000 | $27.633 | 36,84% | $1.842 por inscrito |

El último valor no es un presupuesto recomendado de marketing: es el límite
absoluto que consumiría toda la contribución y dejaría $0 para costos fijos.
Una parte de ese monto debe cubrir operación y utilidad; no debe utilizarse
completo como presupuesto de adquisición.

Torneos mensuales necesarios para cubrir costos fijos, sin utilidad adicional:

| Costos fijos mensuales | Con 12 inscritos | Con 13 inscritos | Con 14 inscritos | Con 15 inscritos |
|---:|---:|---:|---:|---:|
| $50.000 | 4 | 3 | 3 | 2 |
| $100.000 | 7 | 6 | 5 | 4 |
| $250.000 | 17 | 13 | 11 | 10 |
| $500.000 | 33 | 26 | 22 | 19 |
| $1.000.000 | 65 | 52 | 43 | 37 |

La plataforma sólo puede declararse autosostenible cuando la contribución
mensual real, después de devoluciones y fraude, cubra el 100% de los costos
fijos y del CAC durante tres cierres consecutivos. Mientras no existan ventas
reales, el formato está validado en economía unitaria, no en sostenibilidad
global.

La política detallada está en
[`politica-negocio-torneos.md`](./politica-negocio-torneos.md) y la mecánica del
libro en [`contabilidad-producto.md`](./contabilidad-producto.md).
