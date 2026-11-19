# Auditoría comercial de producto y cartera de TorneosPlay

Fecha: 15 de octubre de 2026. Mercado inicial: Chile. La audiencia, ingresos y costos comerciales todavía no se miden, según confirmación del propietario en esta conversación.

**Recomiendo pausar durante 30 días la incorporación de juegos y la expansión de sistemas que no respondan a una conducta observada. Torneos ya tiene suficiente variedad para comprobar si alguien quiere jugar, volver y competir. Su siguiente inversión debe producir evidencia de elección del público.**

La preocupación del propietario está respaldada por un patrón verificable: numerosas entregas técnicas, propuestas de juego distintas y escasa evidencia de preferencia espontánea de jugadores externos. Esto permite cuestionar la asignación de inversión. No permite concluir que todos los juegos sean malos o que no puedan tener público.

## El valor que debe entregar el producto

Un juego puede aportar entretenimiento, dominio de una habilidad, sorpresa, expresión personal, creación o relación con otras personas. Su valor no requiere utilidad laboral ni producción AAA. Una partida sencilla puede ofrecerlo; un sistema complejo puede no conseguirlo.

Para Torneos hay tres preguntas comerciales diferentes:

| Nivel | Valor para el cliente | Evidencia que lo demostraría |
| --- | --- | --- |
| Juego | La experiencia merece su tiempo | Juega sin guía constante, elige otra partida o quiere continuar su proyecto |
| Plataforma | Prefiere hacerlo aquí | Regresa al sitio, busca una actividad, invita a alguien o conserva relaciones/progreso que le importan |
| Negocio | Ese uso permite sostener el servicio | Ingreso efectivamente obtenido y contribución suficiente después de captación, atención, operación y mantenimiento |

Añadir un juego puede ampliar capacidad en el primer nivel sin resolver los otros dos. Ver un anuncio o pagar un ticket es una forma de monetizar; no explica por qué alguien desea participar.

## Diagnóstico comercial

### Se están explorando tres negocios al mismo tiempo

| Apuesta | Cliente y promesa | Capacidad decisiva | Estado de la hipótesis |
| --- | --- | --- | --- |
| Portal de juegos casuales | Entrar y encontrar entretenimiento inmediato | Distribución, descubrimiento, carga rápida y retorno | Existe oferta interna; no un canal de adquisición ni hábito medidos |
| Estudio de juegos propios | Elegir una experiencia de un género y volver por ella | Diseño, identidad, ritmo y contenido atractivo | Hay producción y mejoras; preferencia y recurrencia todavía sin demostrar |
| Operador de competencias | Encontrar rivales, reglas claras y una actividad que vale repetir | Convocatoria, calendario, confianza, atención y repetición | Hay capacidades; la oferta competitiva pública está vacía al corte |

Las tres pueden convivir a largo plazo. Descubrirlas juntas exige atender públicos y problemas distintos con el mismo esfuerzo. Un aficionado a incrementales no se convierte automáticamente en comprador de un ticket de 2048; quien disfruta una carrera breve no necesariamente quiere aprender un RTS.

El catálogo actual presenta el gratuito como preparación para un torneo, mientras incluye colonia personal, runner sin torneos y laboratorio RTS. Ese desajuste es de propuesta comercial, además de navegación. Fuente: [catálogo local](../components/game/public-game-catalog.tsx).

La dispersión **de inversión** está documentada. La fragmentación **de audiencia** es un riesgo futuro, no un resultado medido: no hay datos para afirmar que los jugadores ya se reparten entre cinco juegos. En multijugador, más juegos y horarios pueden dejar menos rivales en cada sala si la adquisición no aumenta.

### El visitante recibe una oferta menor que la desarrollada internamente

La visita de navegador realizada para esta auditoría recorrió la portada pública, la práctica y la lista de torneos, sin iniciar sesión, jugar una partida, pagar ni modificar guardados.

| Superficie observada | Lo que ve el visitante | Implicación comercial |
| --- | --- | --- |
| [Portada pública](https://www.torneosplay.cl/) | Promesa de habilidad, premios y pago de inscripción; ausencia de torneos activos | La promesa principal no se puede consumir en esta visita |
| [Practicar](https://www.torneosplay.cl/play) | Tablero 2048, puntaje, mejor marca, reinicio e instrucciones | Hay una actividad gratuita, con diferenciación pública limitada y sin el catálogo local visible en este recorrido |
| [Torneos](https://www.torneosplay.cl/tournaments) | No hay torneos activos y se invita a volver pronto | No hay fecha, rivalidad o actividad concreta que dé contenido a ese regreso |
| Repositorio y previews | Cinco propuestas y múltiples avances de experiencia | El trabajo interno todavía no equivale a una oferta comercial común disponible |

Esta brecha importa más comercialmente que publicar un sexto juego. La ausencia de eventos en una visita no prueba que nunca los haya habido ni que nadie los quiera. Sí demuestra que hoy no se entrega una competencia al visitante de ese recorrido.

### Las iteraciones han tenido criterios de producción más claros que criterios de valor

El repositorio identifica builds, pruebas y capacidades con precisión. La documentación de Factory conserva pendientes de aceptación humana y recurrencia incluso después de numerosas mejoras. Fuente: [Factory 062](games/factory-empire/3D-INCREMENTAL-BULK.md).

Cerrar una funcionalidad demuestra que puede utilizarse. Para justificar la siguiente inversión falta una relación concreta entre cambio, experiencia y conducta del jugador.

| Iteración | Valor posible | Señal que interesa observar |
| --- | --- | --- |
| Controles y resultado más claros | Menos abandono por confusión | Comprende y completa una partida; empieza otra |
| Compras múltiples | Menos trabajo repetitivo; crecimiento más fluido | Dedica atención a elegir y construir, y quiere continuar |
| Próxima meta al regresar | Una expectativa que da sentido a la ausencia | Vuelve y retoma la meta sin asistencia constante |
| Arte y señales legibles | Reconoce acciones, peligros y progreso | Decide mejor o disfruta una transformación visible |
| Más máquinas, niveles o logros | Profundidad, colección, aspiración | Busca esas posibilidades y cambia cómo juega |
| Nuevo juego | Una experiencia deseada adicional | Atrae público alcanzable o aumenta retorno total de la audiencia |

El arte, los logros y las animaciones pueden ser parte del valor emocional. Su presencia o cantidad no demuestra que alguien los desee. Tampoco más profundidad resuelve automáticamente una primera sesión sin una aspiración clara.

## La señal de Factory requiere atención

La revisión de la build 059 documentó la sensación del propietario de jugar por inercia de desarrollador: operaciones confirmadas, objetivos económicos y paneles, con una promesa inicial débil sobre lo que merecía construir. Es evidencia cualitativa relevante de una persona y una versión. Fuente: [experiencia como jugador 059](games/factory-empire/3D-PLAYER-EXPERIENCE-059-20261009.md).

Las builds 061/062 respondieron con ritmo incremental, compras múltiples, hitos y metas de regreso. Sería incorrecto trasladar todos los defectos de 059 a la versión actual sin observarla; también sería incorrecto asumir que las correcciones resolvieron el deseo de continuar. Fuente: [adaptación incremental](games/factory-empire/3D-COOKIE-CLICKER-ADAPTATION.md).

La siguiente pregunta de producto es si alguien quiere conservar y continuar esa fábrica. Antes de nuevas capas de legado, descubrimientos o porcentajes, conviene observar la primera sesión y la vuelta a la misma partida en 062. Un bloqueo concreto de comprensión o control justifica una corrección; la mera existencia del siguiente ticket de roadmap no justifica su prioridad comercial.

## Evaluación y decisión por juego

Las decisiones siguientes son recomendaciones de inversión, no cambios ejecutados en los proyectos o backlogs.

| Juego | Valor que puede ofrecer | Diagnóstico comercial | Decisión inmediata propuesta |
| --- | --- | --- | --- |
| **2048** | Decisiones breves, dominio y superación de marca | Reglas acotadas; comprensión de jugadores nuevos por verificar. La diferenciación puede venir de competencia/comunidad, aún sin demanda medida | Mantener núcleo. Invertir en acceso, convocatoria y observación como instrumento barato de validación |
| **Snake Arena** | Supervivencia, enfrentamientos y revancha | Es el candidato más directo a probar valor social; depende de reunir personas y operar su host | Mantener. Un ensayo organizado antes de ampliar skins, misiones o eventos |
| **Factory Empire** | Construcción propia, automatización y expectativa de progreso | Puede sostener un juego independiente; retorno y atractivo de 062 todavía no comprobados | Mantener versión actual y probar retorno. Pausar nuevas capas durante el ensayo |
| **Ted Runner** | Destreza, exploración de rutas y completar un recorrido | No hay evidencia suficiente para justificar más contenido comercial | Congelar expansión, preservando nivel y trabajo. Reabrir ante interés diferencial observado |
| **RTS / FRONTERA** | Planificación, economía y táctica | Público y aprendizaje más exigentes; aceptación de la experiencia todavía pendiente | Conservar laboratorio. Congelar expansión comercial dentro del ensayo casual y tratar cualquier continuación como apuesta propia |

Fuentes: [catálogo](../components/game/public-game-catalog.tsx), [Snake torneo gratuito](SNAKE-TOURNAMENT-IMPLEMENTATION.md), [Factory 062](games/factory-empire/3D-INCREMENTAL-BULK.md), [Ted nivel](../games/alien-run/docs/COMPLETE-LEVEL.md) y [RTS experiencia](games/rts-duel/UX-REDESIGN.md).

2048 es la recomendación para empezar por costo de aprendizaje y operación, **no un ganador comercial demostrado**. Snake puede tener más potencial social; la convocatoria permite comprobarlo. Factory merece una prueba específica con personas interesadas en incrementales, sin compararlo con un puzzle únicamente por duración de sesión.

## Posicionamiento y competencia

Una propuesta de trabajo más coherente sería **competencias casuales recurrentes para comunidades pequeñas, accesibles desde el navegador y operadas con reglas y atención claras**. Es la apuesta que recomiendo contrastar primero por coherencia con el nombre y los activos existentes, no una oportunidad de mercado confirmada.

El cliente recibe una actividad concreta: con quién compite, cuándo, qué dura, cómo se decide el resultado y cuándo puede volver. El beneficio incluye rivalidad, reconocimiento y relaciones; el juego integrado facilita ese beneficio.

Existen alternativas en ambos extremos. [Poki](https://poki.com/) ofrece un catálogo amplio de entretenimiento inmediato; [Challonge](https://challonge.com/) ofrece gestión de formatos, eventos y comunidades. Esto exige una razón específica para elegir Torneos. Tener juegos, rankings y registro no constituye por sí solo una diferencia suficiente.

Una diferenciación posible es reunir convocatoria, juego y organización en una experiencia breve atendida. Debe probarse con una comunidad delimitada, no con el segmento genérico de cualquiera que juega en Chile.

También conviene investigar posteriormente quién sería el comprador: el participante o una comunidad/empresa que valore un evento operado. Para esta segunda hipótesis bastan conversaciones sobre una oferta concreta del servicio; no hace falta construir una plataforma para organizadores. Sería un modelo comercial futuro distinto de la venta directa al participante de la [política vigente](politica-negocio-torneos.md). Respetar los permisos internos no demuestra su compatibilidad contractual o tributaria: requiere una definición propia antes de venderlo.

La publicidad puede acompañar al gratuito y el ticket a competencias habilitadas. Una audiencia gratuita no prueba disposición a pagar; un evento con subsidio o premios no prueba interés sostenido sin ellos. Los requisitos de lanzamiento monetario siguen en la [auditoría integral](AUDITORIA-NEGOCIO-Y-MONETIZACION-2026-10-15.md); esta recomendación comercial no los modifica.

## Cuándo añadir otro juego

Un título adicional merece inversión cuando existe evidencia de una necesidad específica del público elegido, acceso a ese público y un motivo para que la experiencia mejore el producto.

Exigir antes de iniciarlo:

1. **Demanda concreta:** jugadores del segmento muestran una preferencia o necesidad, más allá de decir que sería interesante.
2. **Beneficio adicional:** atrae personas nuevas relevantes o hace volver a las actuales; no basta mover visitas entre fichas del mismo catálogo.
3. **Ventaja de una experiencia nueva:** un ajuste acotado de formato, ritmo o descubrimiento no responde al problema detectado.
4. **Costo completo y límite:** desarrollo, arte, QA, dispositivo, hosting, mantenimiento, contenido y captación caben en una inversión explícita.
5. **Experimento y decisión:** conducta que se observará, versión, público, ventana y condición para continuar o detener.

La cantidad de géneros cubiertos no es un objetivo comercial suficiente. Una alternativa solicitada y distribuible puede aportar valor; un título más sin público puede sumar obligaciones.

## Ensayo comercial de 30 días

El objetivo es elegir una apuesta de producto y conocer su principal obstáculo. Los límites y muestras siguientes son propuestas exploratorias, no benchmarks, presupuestos aprobados ni garantía estadística. No se enviaron invitaciones ni se ejecutaron eventos durante esta auditoría.

### Primera semana

Mantener una versión estable y definir un segmento alcanzable, una actividad y una entrada principal. Propongo un máximo de 40 horas totales en 30 días, incluyendo captación, observación, corrección acotada, operación y análisis; no es un presupuesto aprobado. Fijar también el límite de dinero antes de gastar. Evitar construir un sistema completo de métricas: comenzar con registros acotados de consentimiento, sesión y seguimiento, sin datos financieros ni identidad innecesaria.

Usar 2048 como primera actividad si su acceso cumple lo prometido. Si no se puede ofrecer el recorrido real necesario, corregir ese obstáculo antes de reclutar. El ensayo no necesita la publicación de todos los juegos.

### Semanas dos y tres

Observar un grupo exploratorio de 20–30 personas ajenas al desarrollo que encajen con el segmento. Registrar cómo llegan, si juegan, si entienden la actividad, si eligen repetir y qué hacen en una fecha posterior. La entrevista ayuda a interpretar su conducta; una respuesta amable no reemplaza el uso.

Organizar dos convocatorias gratuitas y sin premio patrimonial de la misma actividad, con fecha concreta y reglas operables. Concentrar el público para comprobar retorno de participantes y de quienes no quedan primeros. No multiplicar juegos y horarios durante esta prueba.

Factory 062 queda preparado para una prueba posterior con unas 8–12 personas interesadas en incrementales, conservando partidas aisladas de las del propietario. Observar deseo de continuar y vuelta a la misma colonia evalúa una apuesta de juego propio, no la capacidad de convertirla en ticket. No forma parte de los entregables obligatorios de este primer ensayo.

Como investigación posterior de comprador, unas 5–6 conversaciones con responsables de comunidades reales podrían explorar fecha, responsable y disposición a convocar. Describir un alcance y precio hipotéticos permite investigar la oferta; una intención verbal no cuenta como venta. Este trabajo tampoco requiere ejecutarse en paralelo durante los primeros 30 días.

El alcance principal es un juego y dos convocatorias. Factory y la investigación de compradores son alternativas posteriores, sujetas a lo aprendido y a recursos disponibles; no convertir la validación en tres proyectos nuevos.

### Cuarta semana

| Resultado observado | Decisión |
| --- | --- |
| Repiten y regresan por la actividad o por rivales reconocibles | Continuar esa apuesta con otro incremento acotado; no declarar rentabilidad todavía |
| Participan, pero un obstáculo concreto impide entender o completar | Corregir ese obstáculo y repetir la prueba con condiciones comparables |
| Entienden y completan, pero no desean repetir | Revisar promesa y experiencia central antes de añadir contenido |
| Comunidad convoca y pide otra fecha | Profundizar servicio/evento; comprobar después comprador, precio y costo real |
| Factory genera retorno espontáneo al proyecto personal | Continuar una hipótesis de estudio/incremental, con su propia distribución y economía |
| Sólo hay uso acompañado, recordatorios individuales o incentivo | Reducir inversión y cambiar la hipótesis de valor |
| No se consigue público adecuado | Revisar canal y segmento; no concluir automáticamente que el juego fracasó |

Un recordatorio general de una fecha puede ser parte legítima del servicio competitivo. Debe distinguirse del seguimiento individual insistente que sostiene artificialmente la participación. El registro debe mostrar qué asistencia e incentivos recibió cada grupo.

## Qué medir y qué dejar de usar como sustituto

Para gratuito: tiempo hasta primera acción, abandono temprano, segunda partida, retorno en otro día, motivo de regreso y recomendación que produce uso real. Para competencia: inscripción, asistencia, finalización, revancha/nueva fecha, retorno de no ganadores y horas necesarias para convocar/atender.

Para Factory: comprensión de una aspiración, elección de siguiente inversión, retorno a la misma partida y deseo expresado acompañado de acción. Comparar versiones de la misma propuesta; una sesión corta puede ser adecuada para un reto y una larga no siempre demuestra diversión en un incremental.

Distinguir personas, cuentas y navegadores. D1/D7 por calendario Chile madura al terminar el día objetivo en America/Santiago. Mostrar denominadores, asistencia, casos desconocidos y cohortes maduras. La muestra inicial sirve para aprendizaje, no para estimar el mercado chileno.

Como referencia de método, [Poki](https://developers.poki.com/guide/playtesting) usa observación de sesiones para entender problemas de experiencia y [CrazyGames](https://docs.crazygames.com/resources/basic-launch-metrics/) observa juego efectivo, duración y retorno antes de ampliar un lanzamiento. Sus umbrales y públicos no son criterios universales para Torneos.

La medición decisiva es cuántas personas del público elegido vuelven voluntariamente y cuánto cuesta lograrlo y atenderlas. Builds, pruebas, cantidad de máquinas, skins o juegos siguen siendo información de producción; deben servir a esa conducta.

## Decisión recomendada

Durante el siguiente mes, concentrar la inversión en entregar y observar una actividad repetible. Mantener el núcleo 2048 y probar convocatoria social. Conservar Factory 062 para una evaluación posterior del género y Ted/RTS sin ampliar su alcance comercial en este ensayo.

La evidencia puede llevar a elegir competencia de comunidades, un juego incremental independiente o un portal casual. La elección debe salir del comportamiento observado y de su costo, no de la facilidad para seguir generando contenido. **Hoy no recomendaría financiar otro juego como respuesta a la falta de valor percibido.**

Esta auditoría no modifica backlogs, proyectos, partidas, DB, pagos, despliegues ni contratos. Revisa prioridades comerciales a partir de fuentes actuales, navegación pública y evidencia previa identificada por versión; no incluye un nuevo playtest de todos los juegos.
