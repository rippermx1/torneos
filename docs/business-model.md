# Modelo de negocio y optimizacion

## Tesis

Torneos 2048 puede ser rentable si evita dos errores:

1. Pagar premios con minimos demasiado bajos.
2. Confundir depositos de billetera con ingreso disponible.

El modelo sano es: los depositos financian saldos, las inscripciones reconocen
ingreso, y los premios son el costo directo de cada torneo.

## Formula base

Para torneos pagados:

```text
recaudacion_minima = min_players * entry_fee
costo_contable = premios * 1.19 / neto_flow
utilidad_minima = recaudacion_minima - costo_contable
```

Con Flow al dia habil siguiente:

```text
neto_flow ~= 1 - (3.19% * 1.19) = 96.20%
```

La plataforma debe publicar solo torneos con `utilidad_minima >= 0`. Para
operacion normal, el objetivo debe ser margen minimo >= 12%.

## Presets recomendados

| Preset | Entrada | Premios | Minimo | Uso |
| --- | ---: | ---: | ---: | --- |
| Express rentable | $1.000 | $9.500 | 12 | Actividad diaria y bajo riesgo |
| Estandar balanceado | $3.000 | $27.000 | 14 | Formato principal |
| Elite alto premio | $10.000 | $95.000 | 14 | Alto valor y menor frecuencia |
| Freeroll adquisicion | $0 | $5.000 | 2 | Marketing y reactivacion |

## Contabilidad simple

Reporte semanal recomendado:

- Depositos Flow cobrados.
- Comisiones Flow estimadas.
- Saldo total de billeteras.
- Inscripciones cobradas por torneos completados.
- Premios acreditados.
- Freerolls y ajustes.
- Retiros pagados.
- Resultado por torneo y resultado semanal.

La conciliacion minima debe cuadrar:

```text
caja_banco + caja_flow_pendiente - saldo_usuarios - retiros_pendientes
```

Ese numero debe ser suficiente para cubrir premios comprometidos y costos
operativos.

## Crecimiento sin romper margen

- Usar freerolls como presupuesto fijo, no como mecanismo permanente.
- Mantener express de bajo ticket para recurrencia.
- Publicar torneos estandar con premio fuerte pero minimo rentable.
- Limitar elite a ventanas donde ya hay demanda suficiente.
- Medir conversion: deposito -> inscripcion -> segunda inscripcion.
