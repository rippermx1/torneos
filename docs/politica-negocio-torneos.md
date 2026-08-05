# Política de negocio para torneos — piloto

Vigente desde el 4 de agosto de 2026. Estas reglas gobiernan torneos nuevos; las
obligaciones ya publicadas se conservan.

## Producto

El usuario compra una inscripción no transferible a un torneo específico. La
empresa organiza la competencia, define reglas, cobra el precio final, adjudica
los premios y los paga desde su cuenta bancaria. No hay depósito, custodia, pozo
de terceros ni saldo monetario reutilizable.

## Canal y operación

La inscripción se comercializa directamente entre la empresa y el participante.
No existen intermediarios comerciales con permisos para crear torneos, registrar
participantes, cobrar inscripciones, administrar premios o recibir una parte de
la venta. Los torneos sólo pueden ser creados y gestionados por cuentas internas
`admin`/`owner` o por procesos controlados de la plataforma.

La adquisición de usuarios se mide como gasto comercial o de marketing de la
empresa y no altera la venta, el IVA, el presupuesto de premios ni el ledger del
torneo. Un proveedor externo eventual debe operar mediante un servicio contratado
fuera del producto, sin acceso administrativo ni participación automática en los
ingresos.

## Reglas económicas

| Regla | Piloto |
|---|---:|
| IVA incluido en precio final | 19% |
| Inscripción pagada mínima | $2.000 CLP |
| Presupuesto máximo de premios | 55% de la recaudación bruta mínima |
| Distribución estándar top 2 | 75% / 25% del premio publicado |
| Capacidad máxima | 1,25 veces el mínimo de jugadores |
| Premio total máximo por torneo | $70.000 CLP |
| Primer premio máximo | $49.000 CLP |
| Margen de contribución mínimo objetivo | 25% del bruto al mínimo |
| Rakeback/recompensas nuevas | Desactivadas |

Por cada $2.000 brutos vendidos al mínimo, el presupuesto fijo equivalente de
premio es $1.100. Después del IVA incluido y una comisión Flow neta estimada de
3,19%, la contribución estimada es $516,87 (25,84%) antes de costos fijos y renta. El
tope de $70.000 limita exposición operacional y antifraude durante la validación;
no es una afirmación de exención tributaria o legal.

Los topes sólo pueden aumentarse tras demostrar durante al menos tres cierres:

- conciliación completa de cobros, N/C, premios y banco;
- margen de contribución positivo por formato;
- reserva de caja suficiente para todos los premios comprometidos;
- revisión antifraude y jurídica aprobada;
- ninguna devolución o premio sin expediente completo.

### Formatos iniciales

| Formato | Entrada | Mínimo | Máximo | Premio fijo | Distribución |
|---|---:|---:|---:|---:|---:|
| Piloto pagado | $2.000 | 8 | 10 | $8.800 | $6.600 / $2.200 |
| Freeroll controlado | $0 | 2 | 10 | $5.000 | $5.000 al 1° |

El premio se calcula una sola vez al publicar y nunca cambia con la convocatoria.
El sistema rechaza tickets bajo el mínimo, capacidades superiores a 1,25 veces
el mínimo y premios que excedan 55% de la recaudación mínima.

## Condiciones de competencia

Cada torneo debe publicar antes de cobrar: precio final, horarios, juego, reglas,
criterio de ranking, desempate, premios fijos, mínimo/máximo de participantes,
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

- inscritos y ocupación del cupo;
- venta bruta y neta;
- IVA débito y N/C;
- premios adjudicados/venta bruta;
- comisión Flow neta real;
- contribución por torneo y por formato;
- cancelaciones, devoluciones y fraude;
- recompra y retención D7/D30.

No se escala un formato por volumen si su contribución, conciliación o seguridad
no están demostradas.
