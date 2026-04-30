# Contabilidad de torneos

## Guardia de rentabilidad

Antes de crear un torneo pagado, la recaudacion minima debe cubrir los premios
comprometidos, el IVA y el costo Flow absorbido por la plataforma:

```text
min_players * entry_fee >= sum_premios * 1.19 / 0.97
```

Donde:

- `sum_premios` es `prize_1st + prize_2nd + prize_3rd`.
- `1.19` incorpora IVA.
- `0.97` modela el neto despues de un costo Flow aproximado de 3%.
- `entry_fee` y premios se calculan en centavos.

En codigo, la comparacion se hace con enteros:

```text
required_revenue_cents = ceil(sum_premios_cents * 119 / 97)
min_revenue_cents = min_players * entry_fee_cents
```

Los freerolls quedan fuera de esta guardia porque no tienen `entry_fee`; su
premio es un costo promocional cubierto por la plataforma.
