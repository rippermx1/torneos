# Política de negocio para torneos — piloto

Vigente desde el 4 de agosto de 2026. Estas reglas gobiernan torneos nuevos; las
obligaciones ya publicadas se conservan.

## Producto

El usuario compra una inscripción no transferible a un torneo específico. La
empresa organiza la competencia, define reglas, cobra el precio final, adjudica
los premios y los paga desde su cuenta bancaria. No hay depósito, custodia, pozo
de terceros ni saldo monetario reutilizable.

## Reglas económicas

| Regla | Piloto |
|---|---:|
| IVA incluido en precio final | 19% |
| Presupuesto máximo de premios | 65% de la recaudación bruta al umbral |
| Distribución estándar top 3 | 70% / 20% / 10% del premio publicado |
| Premio total máximo por torneo | $70.000 CLP |
| Primer premio máximo | $49.000 CLP |
| Margen de contribución mínimo objetivo | 15% del bruto |
| Rakeback/recompensas nuevas | Desactivadas |

Con $1.000 brutos, 65% de premio y comisión Flow neta estimada de 3,19%,
la contribución estimada es $158,44 (15,84%) antes de costos fijos y renta. El
tope de $70.000 limita exposición operacional y antifraude durante la validación;
no es una afirmación de exención tributaria o legal.

Los topes sólo pueden aumentarse tras demostrar durante al menos tres cierres:

- conciliación completa de cobros, N/C, premios y banco;
- margen de contribución positivo por formato;
- reserva de caja suficiente para todos los premios comprometidos;
- revisión antifraude y jurídica aprobada;
- ninguna devolución o premio sin expediente completo.

### Presets iniciales

| Formato | Entrada | Mínimo | Objetivo | Máximo | Premio máximo al llenarse |
|---|---:|---:|---:|---:|---:|
| Express | $1.000 | 8 | 20 | 40 | $26.000 |
| Challenger | $1.500 | 6 | 15 | 30 | $29.250 |
| Estándar | $3.000 | 6 | 15 | 30 | $58.500 |
| Pro | $5.000 | 4 | 10 | 20 | $65.000 |
| Elite | $10.000 | 4 | 10 | 10 | $65.000 |

Objetivo y capacidad son tramos publicados. El creador no puede aumentar cupos
si el fondo de 65% a capacidad excede los topes del piloto; el sistema rechaza
esa configuración en vez de congelar silenciosamente el premio.

## Condiciones de competencia

Cada torneo debe publicar antes de cobrar: precio final, horarios, juego, reglas,
criterio de ranking, desempate, premios por tramo, mínimo/máximo de participantes,
causales de cancelación, devolución y descalificación.

La clasificación como competencia de habilidad depende de la sustancia, no del
nombre "inscripción" o "ticket". El resultado debe depender predominantemente de
la destreza bajo condiciones comparables, con reglas auditables y antifraude.

### Bloqueo previo a captar usuarios pagados

Actualmente cada partida competitiva recibe un seed aleatorio propio. Aunque es
reproducible y auditable, jugadores distintos pueden enfrentar secuencias de
aparición distintas. Antes del lanzamiento pagado se requiere una decisión de
diseño y revisión jurídica: usar condiciones competitivas equivalentes (por
ejemplo, seed/serie común por torneo o rondas comparables) sin debilitar la
seguridad. Hasta cerrar esto, realizar sólo pruebas controladas y torneos de
prueba, no adquisición abierta con premios en dinero.

Referencia institucional: [SCJ — juegos de azar](https://www.scj.gob.cl/juegos-de-azar/).

## Pago del ganador

El pago sólo se ejecuta cuando el torneo está finalizado, el resultado está firme,
KYC coincide con el titular bancario y la revisión antifraude está liberada. La
transferencia requiere referencia bancaria, comprobante, folio interno y registro
en el libro. El administrador nunca paga desde una cuenta personal ni a un tercero.

## Métricas para gobernar cada formato

- inscritos y ocupación por tramo;
- venta bruta y neta;
- IVA débito y N/C;
- premios adjudicados/venta bruta;
- comisión Flow neta real;
- contribución por torneo y por formato;
- cancelaciones, devoluciones y fraude;
- recompra y retención D7/D30.

No se escala un formato por volumen si su contribución, conciliación o seguridad
no están demostradas.
