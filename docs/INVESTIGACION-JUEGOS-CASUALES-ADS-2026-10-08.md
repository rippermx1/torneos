# Juegos casuales para TorneosPlay: selección y validación

Fecha: 8 de octubre de 2026. Investigación documental y revisión del checkout local. Supuesto de trabajo: público amplio de Chile/LatAm, prioridad móvil; todavía no confirmado por el propietario.

## Recomendación

Priorizar un puzzle original de bloques con reto diario como primer juego nuevo. Utilizar 2048 gratuito como referencia de adquisición, carga y repetición; conservar Factory Empire como apuesta de progreso persistente. Después de observar jugadores reales, probar un survivors breve para diversificar hacia acción. No construir simultáneamente seis juegos.

La oportunidad consiste en combinar una acción fácil de entender, partidas que inviten a repetir, un motivo concreto para volver y pausas donde la publicidad tenga sentido. La existencia de juegos comparables confirma que el formato funciona técnicamente en navegador; no demuestra demanda para TorneosPlay, rentabilidad ni retención propia.

Este documento complementa [el estudio de publicidad existente](ESTUDIO-PUBLICIDAD-Y-AD-REWARDS-WEB-2026-10-08.md). No activa proveedores, anuncios, recompensas, despliegues, cobros ni cambios de juego.

## Evidencia actual de la plataforma

Revisión sobre rama `codex/2048-clean-gameplay`, HEAD `c8d7e75`, con abundante trabajo compartido sin confirmar. Se leyeron AGENTS, README, STATUS, referencias de integración, catálogo público, runtimes y métricas locales de Factory. Se añade únicamente este informe.

| Producto existente | Qué aporta a esta investigación | Trabajo o incertidumbre relevante |
|---|---|---|
| 2048 | Entrada gratuita sin cuenta; mecánica conocida; práctica y competencia diferenciadas | Aún falta demostrar adquisición y retorno de la audiencia monetizable |
| Ted Runner | Acción por intentos, pantalla de resultado y contenido existente | Disponibilidad condicionada por ambiente; requiere verificar carga y experiencia móvil pública |
| Factory Empire 3D | Progreso, construcción, expansión y legado; posible motivo de retorno | STATUS documenta diversión y D1/D7 sin comprobar con cohortes reales |
| Snake Arena | Competencia social, misiones y rankings | Autoridad persistente y operación de salas; costo y continuidad del host público pendientes |
| RTS Duel | Exploración técnica de estrategia | No aparece en el catálogo público inspeccionado; su alcance es mayor que el piloto casual propuesto |

El registro local identifica `unity-2048-007`, Ted `level-030`, Snake `snake-arena-014` y Factory `factory-empire-3d-054`. No se verificaron esas versiones en una web pública durante esta investigación.

Factory registra sesiones y hitos en el navegador; sus D1/D7 locales no representan personas ni una cohorte agregada de la plataforma. Las pruebas técnicas y los bots no prueban diversión o demanda.

## Comparación de candidatos

Las duraciones son estimaciones propias para un MVP pequeño con un desarrollador dedicado, arte sencillo original, pruebas móviles, guardado y medición básica. Excluyen adquisición de audiencia, aprobación publicitaria, pagos, torneos con premios y operación comercial completa. No son cotizaciones ni compromisos de calendario. La integración de rewarded funcional requiere un incremento adicional.

| Candidato | Motivo para repetir o volver, por validar | Sesión objetivo de diseño | MVP estimado | Encaje publicitario propuesto | Prioridad |
|---|---|---:|---:|---|---|
| Puzzle de bloques | Récord personal, combos y reto diario compartible | 3–8 min | 2–4 semanas | Resultado; apariencia opcional. Un rescate futuro sólo en práctica asistida | 1, primer juego nuevo |
| Merge de caída | Anticipación de la próxima pieza y cadenas de fusión | 3–8 min | 3–5 semanas | Entre partidas; cosmético o rescate en modo separado | 2, alternativa al bloque |
| Ordenar colores | Resolver niveles, completar colecciones y descubrir reglas nuevas | 2–6 min | 3–5 semanas | Entre niveles; pista voluntaria en modo asistido | 2, alternativa orientada a relajación |
| Survivors breve | Combinaciones de habilidades, dominio y desbloqueos | 4–8 min | 5–8 semanas | Después de morir o terminar; continuación asistida separada | 3, segundo género |
| Puzzle lógico diario | Resolver el mismo desafío que amigos, calendario y archivo | 2–5 min | 2–4 semanas | Resultado y archivo; cosmético o pista asistida | Complemento de hábito |
| Factory Empire existente | Volver a una colonia con decisiones y objetivos pendientes | Visitas breves y sesiones largas | 2–4 semanas de mejora focal, por acotar | Cosméticos de campaña; ofertas fuera del mundo | Apuesta existente de largo plazo |

Las sesiones de la tabla son objetivos, no estadísticas de los referentes. En el puzzle diario, una sola visita breve puede producir pocas oportunidades publicitarias aunque el retorno sea bueno. El archivo debe aportar contenido útil, sin convertirse en una barrera para jugar gratis.

### 1. Puzzle original de bloques

Referencia para estudiar: [Sudoku Block Puzzle](https://www.crazygames.com/game/sudoku-block-puzzle), cuya ficha describe tablero, eliminación de grupos y desafíos diarios. Se propone una identidad, presentación y variante propias, no copiar su nombre, recursos o niveles.

Alcance sugerido: tablero 8×8, tres piezas disponibles, eliminación de filas/columnas, combos, récord local y un reto diario con semilla compartida. Un objetivo diario podría pedir limpiar cierta zona con piezas limitadas; un validador debe comprobar que los retos seleccionados sean resolubles.

Ventaja: arte, controles y reglas pequeños; no necesita crear personajes o mapas. Riesgo: saturación y escasa identidad. La diferencia debe aparecer en la experiencia —una regla diaria y una respuesta visual satisfactoria—, además de la apariencia.

MVP: práctica libre, guardado, historial corto del reto y compartir un resultado sin revelar la solución. Sin tienda, clanes ni multijugador en vivo. Una semilla común permite retos asincrónicos; cualquier clasificación pública exige definir validación, no confiar ciegamente en una cifra del cliente.

### 2. Merge de caída

Referencia: [Drop & Merge the Numbers](https://www.crazygames.com/game/drop-merge-the-numbers), disponible en navegador con mecánica de soltar y fusionar números. Para TorneosPlay se puede explorar una versión con piezas industriales, minerales o criaturas originales; la ambientación debe ayudar a comprender la progresión.

MVP: un recipiente/tablero, una cadena de 8–10 piezas, vista de la siguiente, fusiones encadenadas y derrota clara. Empezaría por caída en columnas; la variante con física libre añade riesgo de colisiones, rendimiento y partidas difíciles de reproducir.

Retorno propuesto: colección visual y semilla diaria. Riesgo: que sólo produzca curiosidad de una sesión o duplique demasiado la propuesta de 2048. Conviene contrastarlo con bloques antes de desarrollar ambos.

### 3. Ordenar colores

Referencia: [Color Water Sort 3D](https://www.crazygames.com/game/color-water-sort-3d), cuya ficha documenta clasificación por tubos y complejidad creciente. Una presentación 2D es suficiente para estudiar la misma familia de decisiones.

MVP: 30–40 niveles validados, deshacer limitado gratuito, dificultad gradual y guardado. Usar patrones o símbolos además del color. Un generador puede producir estados, pero necesita comprobar solución y dificultad; generar miles de tableros no equivale a crear buen contenido.

Retorno: terminar un capítulo y resolver un reto nuevo. Riesgo: niveles triviales o repetitivos y bloqueo artificial para vender pistas. La ruta normal debe ser resoluble sin publicidad; las pistas asistidas no participan en una clasificación comparable.

### 4. Survivors breve

Referencia: [10 Minutes Till Dawn](https://www.crazygames.com/game/10-minutes-till-dawn), una experiencia de supervivencia de diez minutos publicada en navegador. Su ficha indica escritorio; no se toma como prueba de compatibilidad móvil del prototipo propuesto.

Alcance propio: una arena 2D, un personaje, movimiento con control táctil, ataque automático, cinco armas, doce mejoras y partidas de 4–8 minutos. Ninguna historia extensa ni campaña de mapas. La elección de mejoras debe cambiar la forma de jugar.

Retorno: probar otra combinación y desbloquear opciones por juego. Riesgos: balance, legibilidad de enemigos, rendimiento móvil y una meta que demande demasiado contenido. Es el mejor candidato para variar respecto de puzzles, pero cuesta más producirlo bien.

### 5. Puzzle diario de lógica

Puede reutilizar la base de bloques o tener conexiones, rutas o números con reglas originales. Reutilizar un sistema conocido reduce aprendizaje y mantenimiento. El hábito depende de que el desafío sea interesante, no sólo de una racha.

MVP: una regla, 30 retos revisados, archivo, calendario y resultado compartible. Evitar inicialmente trivia y juegos de palabras si no hay presupuesto de curación: agregan diccionarios, localización y discusión sobre respuestas.

Riesgo principal: poca duración e inventario. Lo usaría como una puerta de retorno al catálogo, midiendo cuántos jugadores pasan a otro juego, sin imponer ese paso.

### 6. Factory Empire como inversión existente

Referencia de la familia: [Idle Mining Empire](https://www.crazygames.com/game/idle-mining-empire). La existencia de un referente idle no prueba que Factory ya tenga retención.

Antes de desarrollar otro idle, comprobar en Factory que un jugador nuevo entiende qué construir, disfruta su primera mejora y sabe por qué volver. El trabajo focal sería ritmo inicial, objetivos funcionales y variedad de decisiones. Medir los primeros diez minutos y el retorno real antes de expandir tecnologías o sistemas.

Los boosts productivos no forman parte del piloto de ads: afectan economía y podrían mezclarse con desafíos o comunidad. Una mejora futura requeriría aislamiento explícito y evaluación del balance. Los cosméticos también necesitan interés demostrado para generar aceptación.

## Qué servir: propio, licenciado o distribuido

| Ruta | Qué conseguimos | Qué debemos comprobar |
|---|---|---|
| Juegos propios | Control de experiencia, medición e identidad; posible activo propio | Costo de desarrollo, audiencia y mantenimiento |
| Juegos de terceros con licencia de publisher | Ampliar el catálogo con menos desarrollo | Dominio admitido, condiciones, reparto neto, anuncios, datos y derechos concretos |
| Publicar juegos propios en portales | Acceso a distribución y procesos de prueba de terceros | Admisión, contrato, exclusividad y compatibilidad con servir el mismo juego aquí |

[GameDistribution](https://static.gamedistribution.com/terms/publisher.html) documenta una licencia limitada para sus publishers, reparto de ingreso neto y control de publicidad dentro de sus juegos. El acuerdo consultado también exige Google Ad Manager activo. Por eso un iframe no basta para afirmar monetización habilitada; evaluar admisión y operación. No mezclar porcentajes del contrato de desarrollador con los del publisher.

Un catálogo de terceros puede ayudar a explorar preferencias, dentro de los usos autorizados por el contrato. No garantiza tráfico: el sitio sigue necesitando distribución propia. Recomiendo pocos títulos seleccionados por identidad y calidad, evitando llenar el catálogo sin objetivos medibles. No se solicitaron cuentas ni se aceptaron acuerdos.

[Poki](https://developers.poki.com/guide/revenue-deal-types) distingue acuerdos exclusivos web y no exclusivos. La exclusividad web puede entrar en conflicto con servir el mismo título en TorneosPlay; su alternativa no exclusiva descrita es una licencia fija, sin el mismo reparto de ingresos. Las condiciones finales son las del acuerdo particular.

[CrazyGames](https://docs.crazygames.com/resources/basic-launch-metrics/) usa una fase de prueba antes de monetizar. Puede ser un canal para juegos gratuitos propios, sujeto a revisión y contrato; no es una red publicitaria que se instala sin más en TorneosPlay.

## Tecnología y carga

Los juegos Unity existentes se conservan en sus proyectos reales. Para un juego 2D nuevo evaluaría TypeScript con Phaser, que documenta render Canvas/WebGL y soporte web móvil/escritorio. [Documentación de Phaser](https://docs.phaser.io/phaser/getting-started/what-is-phaser).

Es una elección a medir en un prototipo, no una garantía automática de velocidad. Si el flujo de autoría de Unity permite producir mejor el juego, también es candidato; decidir por carga, memoria, teléfonos reales y costo de iteración. No se propone reescribir juegos existentes.

Como referencia externa, CrazyGames limita a 20 MB la descarga inicial para acceder a su portada móvil y documenta restricciones específicas de Unity en iOS. Son condiciones de ese portal, no una prohibición de Unity móvil en TorneosPlay. [Requisitos técnicos](https://docs.crazygames.com/requirements/technical/).

Objetivos internos propuestos: jugar como invitado, inicio rápido medido con red móvil, controles de un dedo cuando sea posible, primer objetivo visible y guardado fiable. No hacer obligatorio el registro antes de probar un juego nuevo; ofrecer cuenta para conservar progreso o funciones sociales.

Mantener cuentas, catálogo y controles de plataforma fuera del canvas. El juego gratuito puede ejecutarse localmente; persistencia de cuenta y resultados compartidos requieren sus contratos correspondientes. Un ranking no convierte resultados locales en resultados confiables para premios.

## Publicidad que encaja con estos juegos

1. Display o patrocinio en catálogo y resultados, lejos de controles táctiles.
2. Intersticiales en transiciones naturales, con límites de frecuencia medidos.
3. Rewarded voluntario para un beneficio explicado; inicialmente cosmético. Pistas o rescates sólo como una prueba posterior, fuera de clasificaciones comparables.

[Google H5 Games Ads](https://support.google.com/adsense/answer/9959170?hl=en) documenta intersticiales, rewarded e integración de juegos embebidos. [El acceso](https://support.google.com/adsense/answer/1705831?hl=en) requiere solicitud y cuenta AdSense aprobada. [Unity Ads](https://docs.unity.com/en-us/grow/ads/references/faq) no soporta WebGL: usar Unity como motor no habilita su SDK publicitario web.

Las [políticas de recompensa de Google](https://support.google.com/adsense/answer/9121589?hl=en) exigen elección voluntaria y restringen recompensas monetarias. Para este piloto, nada de saldo, premios o inscripciones pagadas por ver anuncios. No penalizar a quien decline y mantener una ruta jugable ante no-fill, bloqueo o error.

TorneosPlay también contiene modalidades comerciales. Las [restricciones de Google](https://support.google.com/publisherpolicies/answer/10437795?hl=en) incluyen determinados juegos con pago y oportunidad de ganar premios; su aplicación al producto necesita evaluación específica. Unas rutas gratuitas no garantizan por sí solas la aceptación del sitio. Este estudio no cambia el NO_GO vigente de dinero real.

## Escala económica: usar datos antes de presupuestar crecimiento

Ingreso publicitario mensual = suma por formato de impresiones monetizadas × eCPM neto / 1.000. La impresión debe tener el mismo denominador que el eCPM usado; completar una recompensa no siempre equivale a una impresión facturable.

El [modelo local anterior](ESTUDIO-PUBLICIDAD-Y-AD-REWARDS-WEB-2026-10-08.modelo.json) presenta un escenario ilustrativo con dos sesiones diarias, elegibilidad, bloqueo, fill y render. Con 1.000 DAU promedio calcula 57.456 impresiones display y 7.182 rewarded al mes. Sus tarifas hipotéticas de USD 2 y USD 5 por mil producen USD 150,82 mensuales; con 10.000 DAU, USD 1.508,22. No son tarifas observadas en Chile ni ingresos reales.

El resultado excluye costos operativos y de adquisición; tampoco demuestra que los juegos generarán esas oportunidades. Puede ser cero si no existe inventario o aprobación. Una sesión larga no multiplica anuncios automáticamente y forzar más interrupciones puede destruir el retorno.

La consecuencia para selección de juegos es concreta: producir un título con poco contenido manual y distribución orgánica verificable antes de financiar una campaña grande. Comparar ingreso por jugador durante su vida observada con adquisición, soporte e infraestructura; no comprar tráfico basándose en un eCPM supuesto.

## Ensayo recomendado

Primero, medir el 2048 existente y preparar un prototipo de bloques. Las opciones merge y sort compiten por el mismo siguiente cupo; elegir una sólo si la prueba muestra mayor interés o mejor ajuste al público.

### Prototipo pequeño de bloques

- Práctica libre y un reto diario original.
- Buen tacto visual y sonoro, sin gran producción artística.
- Guardado local y compartir resultado; cuenta opcional posterior.
- Medición de carga, inicio, juego activo, resultado, repetición y retorno.
- Cero publicidad real durante pruebas del equipo; un espacio de resultado diseñado para evaluar después.

### Evidencia para decidir

Medir visitas al juego, llegada a una partida, primer minuto activo, segunda partida, tiempo activo, D1 y D7. Separar país, dispositivo, fuente de adquisición, build y QA. Diferenciar navegador/dispositivo de persona; no afirmar retención personal si sólo existe un identificador local.

Referencia externa: CrazyGames describe pruebas de 7–21 días y menciona 10+ minutos de tiempo medio, D1 de 10–15% y conversión de 80%+ en títulos fuertes. Su conversión significa jugar al menos un minuto tras iniciar; no es conversión de visitas de la web. Son referencias de su audiencia y definiciones, no umbrales universales para este proyecto. [Guía](https://docs.crazygames.com/resources/basic-launch-metrics/).

Propuesta propia: empezar con una ventana de 2–4 semanas de jugadores reales, prolongándola si la muestra es pequeña. Con 200 jugadores elegibles, una D1 observada de 15% tiene un intervalo aproximado de 10–20%; no distingue cambios pequeños con fiabilidad. D7 exige esperar y usar sólo cohortes que ya alcanzaron ese día. El piloto no debe declararse exitoso por visitas o por tests automatizados.

Cuando haya acceso al proveedor y línea base, comparar un grupo sin ads con otro con una sola ubicación. Medir ingreso conciliado, segunda partida, retorno y abandono después del anuncio; conservar asignación estable y evitar mezclar un cambio de juego con un cambio publicitario. El objetivo es ingreso total sostenible por jugador, no máxima cantidad de anuncios por sesión.

### Adquisición que acompañaría el ensayo

Preparar piezas breves de gameplay, página útil por juego en español y resultados compartibles que enlacen al reto. Contrastar fuentes: comunidad propia, grupos donde la difusión esté permitida y creadores pequeños interesados en puzzles. Cada enlace debe permitir atribuir jugadores y retorno, no sólo clics.

Explorar distribución externa de juegos propios si el acuerdo permite el objetivo de TorneosPlay. Publicar en un portal puede generar ingresos allí sin traer jugadores aquí; medir ambos negocios por separado.

## Decisión propuesta y límites de la investigación

Orden: medir 2048 → prototipo de bloques → validar retorno → piloto de una ubicación publicitaria → survivors breve si conviene ampliar géneros. Factory mantiene un ensayo independiente sobre su ritmo y motivos de retorno; Snake requiere resolver además su operación pública.

No priorizar un nuevo RTS, MMO, mundo abierto, multiplayer competitivo nuevo, merge con cientos de cadenas ni match-3 con una campaña extensa para validar ads. Su costo de producción u operación puede exceder lo que sabemos de la audiencia. No se descartan para siempre.

Fuentes consultadas en sus páginas públicas, sin jugar manualmente los referentes ni consultar analítica privada. No existe evidencia propia de LTV, ingresos, cohortes, admisión de red o aceptación comercial. Los nombres de los candidatos son descripciones de trabajo; arte, nombres finales y licencias deben elegirse expresamente durante su desarrollo.
