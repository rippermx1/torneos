# Contabilidad simple de Torneos 2048

## Modelo de negocio

La plataforma no debe tratar cada deposito como ingreso. Un deposito crea caja,
pero tambien crea una obligacion con el usuario por el saldo disponible en su
billetera.

La contabilidad operativa puede manejarse con cinco bloques:

- `Caja Flow/banco`: dinero recibido desde Flow menos comisiones.
- `Saldo usuario`: obligacion por saldos disponibles en billeteras.
- `Pasivo de premios`: premios comprometidos por torneos activos.
- `Ingreso por torneo`: cuotas consumidas cuando un torneo se completa.
- `Costo de premios/promocion`: premios pagados y freerolls.

El ingreso economico aparece cuando el usuario gasta saldo en una inscripcion,
no cuando recarga. Los premios se registran como costo y vuelven a aumentar el
saldo de usuarios ganadores.

## Guardia de rentabilidad

Antes de crear un torneo pagado, la recaudacion minima debe cubrir los premios
comprometidos, el IVA y el costo Flow absorbido por la plataforma:

```text
min_players * entry_fee >= sum_premios * 1.19 / (1 - flow_fee * 1.19)
```

Donde:

- `sum_premios` es `prize_1st + prize_2nd + prize_3rd`.
- `1.19` incorpora IVA.
- `flow_fee` es la tasa Flow elegida para el abono.
- `entry_fee` y premios se calculan en centavos.

Con abono al dia habil siguiente, Flow publica 3,19% + IVA. En codigo se usa
un neto conservador de 96,20% aproximadamente.

En codigo, la comparacion se hace con enteros:

```text
flow_effective_cost_bps = ceil(319 * 11900 / 10000)
flow_net_bps = 10000 - flow_effective_cost_bps
required_revenue_cents = ceil(sum_premios_cents * 11900 / flow_net_bps)
min_revenue_cents = min_players * entry_fee_cents
```

Los freerolls quedan fuera de esta guardia porque no tienen `entry_fee`; su
premio es un costo promocional cubierto por la plataforma.

## Lectura de rentabilidad

Para cada torneo pagado:

```text
utilidad_minima = min_players * entry_fee - required_revenue
margen_minimo = utilidad_minima / (min_players * entry_fee)
```

Reglas practicas:

- Margen minimo negativo: no publicar.
- Margen minimo entre 0% y 12%: usar solo como adquisicion o evento especial.
- Margen minimo sobre 12%: sano para operacion normal.
- Freeroll: medir como CAC/promocion, no como torneo rentable.

## Cadencia recomendada

- Express rentable: bajo ticket, alta frecuencia, premios moderados.
- Estandar balanceado: ticket medio, margen sano, principal formato diario.
- Elite: menor frecuencia, ticket alto, premio fuerte y cupos limitados.
- Freeroll: una vez por semana como activacion, con presupuesto fijo.
