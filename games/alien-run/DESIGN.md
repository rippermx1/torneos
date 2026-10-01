# Alien Run — Diseño de arranque

## Fantasía y presentación
Un explorador alienígena recorre una instalación/naturaleza estilizada. Tranquilidad en el personaje,
lectura clara de obstáculos y sensación de dominio al repetir. Arte basado en los kits comprados de
Kay, sin copiar personajes, marcas, música o niveles de Nintendo. Nombre provisional.

## Núcleo
Moverse izquierda/derecha, saltar, elegir una ruta, recoger monedas y alcanzar una baliza. La cámara
lateral muestra profundidad 3D, pero el movimiento se restringe al plano X/Y. V8 añade tres estrellas
opcionales, cajas rompibles y hachas para golpear patrullas; los peligros móviles exigen elegir el momento de cruzar.

El jugador usa A/D o flechas y espacio. Coyote time y buffer de salto ayudan a que el control sea
legible; salto variable por liberación de tecla. Los valores del ScriptableObject son iniciales,
no calibrados mediante playtests. El input táctil/OnGUI es un prototipo que necesita sustitución y prueba.

## Qué genera el código incluido
Tres tramos de suelo, dos huecos, una ruta elevada de tres plataformas, seis cristales, dos obstáculos,
un checkpoint lógico y una meta. Cápsula como personaje, cámara de seguimiento y una luz sin sombras.
Un recorrido corto para comprobar motor/contrato, no el nivel de producto de 2–4 minutos.

Ciclo: Idle → Playing → Finished o Failed. Reintentar desde el portal crea otro run. Morir devuelve
al inicio/checkpoint, conserva cristales recogidos y añade penalización. Ningún cristal se recoge
más de una vez por run. El tiempo usa reloj de tiempo real, no se detiene por una pausa de simulación.

Puntuación provisional: ver `docs/CONTRACTS.md`. Los empates exactos comparten posición. No existen
premios ni trucos de monetización en el juego. El backend nunca acepta su valor de score directo.

## Dirección de iteración
Primero comprobar que correr/saltar/reaparecer es divertido y estable. Ajustar cámara, alturas y
huecos mirando intentos reales. Después desarrollar una ruta segura y otra de mayor dificultad cuyo
beneficio de puntuación compense el desvío. La fórmula, número de cristales y distribución se deben
ajustar juntos y versionarse. Evitar puntuación que solo mida quién juega más intentos.

La curva prevista tiene una entrada legible, una sección de elecciones y una final de ejecución.
Llegar a meta debería ser aprendible; dominar la ruta y el tiempo da profundidad. Esta intención aún
no está demostrada por el pequeño nivel generado.

## Primer nivel jugable en desarrollo

La variante local `AlienRunLevelOne` convierte los seis cristales de puntuación en monedas visuales.
La meta exige recoger al menos tres. Las monedas no son dinero ni saldo persistente; solo cuentan
dentro de la partida y para la puntuación de práctica. La ruta de suelo ofrece cuatro monedas y
mantiene un camino de llegada directo. La ruta elevada ofrece otras dos y ahora tiene un dron que
patrulla una plataforma: más riesgo para quien busque una mejor marca. El dron provoca respawn,
sin combate ni IA compleja. La puntuación aún es provisional y los resultados siguen siendo
`plausibility_only`.

El siguiente playtest debe observar si el jugador entiende el requisito de tres monedas, descubre
la elección entre rutas y reconoce el dron como peligro antes de tocarlo. Solo después conviene
alargar el nivel o añadir otro tipo de obstáculo.

La variante local `AlienRunLevelDesign` trabaja la lectura del recorrido: la cámara muestra más suelo
por delante, se eleva suavemente al tomar la ruta alta y limita su avance en los extremos; dos planos
de colinas redondeadas sustituyen los bloques rectangulares del fondo. Un borde continuo define cada
tramo de piso, el ámbar señala el despegue antes de cada hueco y el verde marca la recepción. Estos
elementos no tienen colisión. Es una iteración de composición y anticipación sobre el nivel corto;
el ritmo de los obstáculos y la elección de ruta todavía requieren observación humana.

## Arte y piezas para la siguiente sección

El atlas `platformer_texture.png` del pack importado ofrece referencias locales de pizarra
`#212C30`, madera `#C3805C`/`#E4BF90`, azul `#268AC6`, verde `#008B56` y acentos
`#F05925`/`#FAB152` (muestras puntuales, no una paleta oficial del proveedor). Las próximas piezas
propias de cielo, nube, señalización y efectos partirán de esa gama y mantendrán contraste con
personaje, monedas y peligros. Se pueden generar texturas originales por descripción y valores de
color, sin enviar el atlas ni otros archivos comerciales a un servicio externo.

El pack local incluye suelos y plataformas modulares de madera, barreras, pilares, señales, pinchos,
sierra y rodillos. Cada pieza jugable necesita lectura anticipada, espacio de aterrizaje y una ruta
justa; las colisiones y la lectura deben comprobarse en Unity y en móvil.

`AlienRunKayKitSection` es la primera sección jugable compuesta con esas piezas: un bloque con
pinchos KayKit aparece al inicio, precedido por marcas de aproximación; después se llega al primer
hueco y a la bifurcación. Una señal KayKit anuncia la ruta elevada, que mantiene sus plataformas
modulares y el dron. El bloque usa un collider y una regla de peligro propios; los colliders de los
prefabs visuales están desactivados. Esta geometría se identifica como `practice-v3` para que sus
resultados no compartan tabla con el recorrido anterior.

## Nivel ampliado para revisión de producto

`AlienRunProductLevelV6` conserva la introducción y desarrolla cuatro tramos nuevos hasta x=282.
La secuencia enseña un peligro, permite rutas altas con monedas extra, introduce una sierra móvil
en suelo y cierra con una barrera no letal y dos peligros espaciados. Tres huecos nuevos usan la
señalización ámbar/verde. Los arcos teñidos con la paleta del kit marcan zonas y checkpoints sin
añadir colisión. El fondo
continúa hasta la meta y la cámara conserva anticipación sin mostrar fuera del recorrido. El primer
intento de plataformas altas bloqueaba la ruta baja; V2 elevó su cara inferior y preservó la altura
alcanzable desde el suelo. V3 quitó estructuras de fondo sobredimensionadas. V4 usa madera modular
visible en las plataformas opcionales; el prefab anterior mostraba sus soportes pero no una superficie
legible en WebGL. V5 corrigió el posicionamiento de visuales creados junto con sus hitboxes;
el suelo alto y los pinchos quedaron visibles y alineados. V6 orienta la sierra hacia la cámara.

Hay 14 monedas, ocho obligatorias. La ruta de suelo ofrece diez y las rutas altas cuatro más en
total; se conservan las recogidas al reaparecer. Los checkpoints están en x=46, x=136 y x=231.
La meta exige el objetivo y la barrera nueva separa la competencia como `practice-v5`. Es un candidato de
nivel jugable, no una declaración de calidad final: falta observar a personas jugar ambas rutas,
medir duración real, frustración, visibilidad y rendimiento en teléfonos objetivo. La recompensa
por monedas y tiempo también necesitará balance con esos datos.

## Iteración V7: lectura, recompensa y presión

La variante local V7 añade una textura panorámica original detrás de la geometría KayKit.
El arte se generó a partir de una paleta escrita; no se enviaron prefabs ni texturas comerciales
al generador. Siete paneles cubren el recorrido. La composición debe comprobarse en WebGL
porque el encuadre ortográfico y el contraste móvil pueden cambiar la lectura.

El tramo final alterna suelo seguro, dos plataformas opcionales con muelle, un rodillo móvil,
un hueco anunciado, otro par de plataformas y una bola patrullera antes de los pinchos.
Hay también una bola móvil en la ruta alta. Las 24 monedas combinan ruta baja y recompensas
elevadas; hacen falta 12 para abrir la meta. Los checkpoints quedan en x=46, 136, 231 y 332.
La secuencia enseña un elemento, lo repite con una variación y termina combinándolo con otro.
Este principio de ritmo toma como referencia los plataformas clásicos, con nivel, arte y
personaje originales. Los prefabs comerciales son visuales; las hitboxes y el estado de
partida siguen en código propio.

No significa usar cada variante de color y tamaño del pack: las piezas se eligen por su
función y lectura. Se usan pisos, pilares, arcos, señales, pinchos, sierra, rodillo,
bola, barrera y muelle. La prueba humana debe decidir si la densidad, altura y señalización
ayudan o fatigan en celular.

## Sistemas del primer juego
| Sistema | Base incluida | Próximo valor |
|---|---|---|
| Movimiento | CharacterController, aceleración/frenado, salto, plano 2.5D | Playtest, fricciones, bordes y fallos |
| Input | Teclado, botones táctiles de prototipo | InputActions, reasignación/mando cuando haga falta |
| Cámara | Seguimiento ortográfico con anticipación y límites configurables en la variante de nivel | Probar encuadre y comodidad en móvil |
| Partida | Estado, cronómetro, reinicio, colección y meta | UX de pausa/abandono y pérdida de foco |
| Arte | VisualSkin del jugador y geometría provisional | Wrappers Kay y Animator verificado |
| Audio/VFX | Recogida animada de monedas/estrellas y avisos de ataque | Audio y efectos de meta cuando corresponda |
| Plataforma | SDK, ready/start/result/error | Compilar build y verificar navegador real |
| Integridad | Plausibilidad en servidor | Diseño/verificación autoritativa antes de premios |

## Criterio del primer playtest técnico
La escena compila, el personaje se mueve solo en X/Y, el salto responde, los huecos son superables,
una caída suma una muerte, el checkpoint funciona, los cristales no duplican, la meta termina y
otra partida reinicia objetos/tiempo. Probar llegada, muerte repetida, cancelar, perder foco y nuevo run.
Esto debe verificarse en Unity: no se declara cumplido por la existencia del código.

## Qué no añadir por ahora
Dash/doble salto, inventario, clases, progresión con estadísticas, mundo procedural grande, enemigos
con IA compleja, cuatro mapas, multijugador simultáneo o tienda. Cualquiera puede entrar
al backlog si una necesidad concreta lo justifica; no se prohíbe experimentar, se evita sumar alcance
sin medir el núcleo.
# Iteración V8 sobre la escena editada por el usuario

Diseño, cálculos, encuentros y composición actuales: [nivel completo V8](../../docs/ALIEN-RUN-COMPLETE-LEVEL.md).
La iteración incluye patrullas, ataques cercanos, hachas, stomp y muerte animada por petición del usuario.
Escena local: `UnityProject/Assets/Orbit/AlienRun/LocalArt/AlienRunProductLevelV8.unity`.
Se preservó V7. Referencia de ritmo/plataformas: New Super Mario Bros. U Deluxe.
