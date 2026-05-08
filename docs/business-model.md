# Modelo de negocio y optimizacion

## Tesis

TorneosPlay puede ser rentable si evita dos errores:

1. Pagar premios con minimos demasiado bajos.
2. Confundir caja recibida con utilidad disponible.

El modelo sano es: las inscripciones pagadas reconocen ingreso, los premios
publicados son el costo directo de cada torneo y los retiros se pagan sólo desde
saldo retirable verificado.

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
operacion normal, el objetivo debe ser margen neto minimo >= 18%.

## Presets recomendados

| Preset | Entrada | Premios | Minimo | Uso |
| --- | ---: | ---: | ---: | --- |
| Express rentable | $1.000 | $6.000 | 8 | Actividad diaria y bajo riesgo |
| Estandar balanceado | $3.000 | $13.500 | 6 | Formato principal |
| Elite alto premio | $10.000 | $30.000 | 4 | Alto valor y menor frecuencia |
| Freeroll adquisicion | $0 | $5.000 | 2 | Marketing y reactivacion |

## Contabilidad simple

Reporte semanal recomendado:

- Pagos Flow cobrados.
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
- Medir conversion: practica -> registro -> inscripcion -> segunda inscripcion.
