# Alien Run — recorrido completo en V8

La escena sigue siendo `AlienRunProductLevelV8.unity`. La composición anterior está respaldada en
`.local-unity-verification/v8-before-prefab-level-20260930-172312`. El incremento reorganiza el nivel
a petición del usuario, conservando el jugador, SDK, cámara, iluminación y textura original del cielo.

## Diseño

Referencia de ritmo: New Super Mario Bros. U Deluxe. Ruta legible, presentación de una mecánica,
variación y combinación posterior; estrellas opcionales que premian explorar. No se copió arte de Nintendo.

| Tramo | Distancia | Experiencia principal | Alternativa / estrella |
| --- | --- | --- | --- |
| Amarillo | 0–44 m | Caja de hachas, rampa, primer hueco de 3 m, pinchos fijos | Salto desde la terraza |
| Azul | 44–92 m | Resorte, puente, recepción antes del hueco, prensa con ciclo | Salto desde el puente |
| Verde | 92–142 m | Bárbaro con aviso de lanzamiento, caja, hueco, patrulla | Bloque de apoyo y puente alto |
| Rojo | 142–192 m | Pinchos retráctiles, transbordador, rodillo móvil | Salto desde el transbordador |
| Final | 192–240 m | Segundo bárbaro, rampa, escalón y resorte sobre el hueco | Estrella durante el impulso |

90 monedas, cinco estrellas y cuatro checkpoints en x=43, 91, 141 y 191. Meta en x=240;
24 monedas requeridas. Las estrellas dan bonus y son opcionales. Cada objeto tiene ID propio y giro.
El tramo azul deja espacio para aterrizar desde el puente antes del siguiente salto.

## Medidas físicas

La unidad Unity equivale a un metro en el diseño. Velocidad máxima 7 m/s, aceleración 38 m/s²,
frenado 45 m/s², gravedad 28 m/s² y salto de diseño 2,8 m.

`v₀ = sqrt(2gh) = 12,522 m/s`; `y(t) = v₀t − gt²/2`.
Tiempo ideal hasta volver a la misma altura: `2v₀/g = 0,894 s`.
Alcance ideal con velocidad máxima: `7 × 0,894 = 6,261 m`.
Distancia de frenado: `v²/(2a) = 0,544 m`.

Para una recepción elevada Δh: `t = (v₀ + sqrt(v₀² − 2gΔh))/g`;
`Δx = vt`, descontando margen de recepción, tamaño de cápsula y tiempo de aceleración.
El cálculo ideal es una cota; la implementación integra en pasos máximos de 1/60 s.
La prueba a pasos de 1/20 y 1/60 comprueba la envolvente física, **no mide FPS del teléfono**.

- Huecos comunes: 3 m, con plataforma de salida y recepción. El hueco de 7 m tiene transbordador.
- Monedas corrientes: 2 m entre centros. Los arcos se calculan con la parábola del salto; el cierre usa la del resorte de 13 m/s.
- Cápsula del jugador: altura 1,8 m, radio 0,36 m, skin 0,08 m.
- Resortes: 13 m/s verticales; altura ideal adicional 3,018 m. Compresión visual separada del collider.
- Bárbaros: alcance 8 m, aviso 0,9 s, pausa 3,4 s. Hachas con gravedad 19,6 m/s²,
  barrido de radio 0,18 m y giro 720°/s. El jugador consume una munición por pulsación.
- Prensa: recorrido vertical 4,7 m, periodo 4,6 s. Transbordador: recorrido 3,3 m, periodo 4 s.
- Enemigos: cápsula de 1,8 m; el daño se desactiva inmediatamente al morir, el cuerpo permanece
  visible durante Death_A y su pose final antes de retirarse. Pisarlos desde arriba rebota al jugador.

Las rampas se colocan según el perfil superior medido con sus MeshColliders, no según la mitad
de la caja del modelo. Se orientan ascendiendo hacia +X. Carteles y banderas miran al plano XY.
Los personajes se centran usando geometría deformada en Idle, para que los pies coincidan con el suelo.

## Biblioteca propia

[KAYKIT-PREFABS.csv](KAYKIT-PREFABS.csv) cataloga los 594 prefabs importados: ruta y GUID originales,
ruta y GUID de la copia, familia, función, dimensiones, rotación, desnivel y política física.
El JSON equivalente está en `evidence/kaykit-prefab-catalog.json`.

Las copias están en `Assets/Orbit/AlienRun/LocalArt/GameplayKit`, fuera de Git. Mantienen referencias
a las mallas/texturas licenciadas originales; no duplican ni alteran los archivos del proveedor.
Los prefabs adicionales propios incluyen moneda, visual de hacha, plantilla de jugador y actores Bárbaro/Rogue.

| Función | Física y presentación |
| --- | --- |
| Piso, bloque, madera y pilar | BoxCollider estático; pivote en superficie superior |
| Rampa | MeshCollider estático; perfil superior y ascenso +X medidos |
| Resorte | Collider sólido, BouncePad y compresión del visual |
| Peligro | Trigger ajustado al arte; contacto mediante ComputePenetration |
| Peligro móvil / transbordador | Rigidbody cinemático, MovePosition en FixedUpdate |
| Caja de suministro | BoxCollider, golpe desde abajo, fragmentos y recompensa de hachas |
| Moneda / estrella | Giro y recogida por proximidad; sin cuerpo físico dinámico |
| Personaje | Skin propio con clips nativos; actor independiente con cápsula y scripts |
| Escenografía | Sin colisión con jugador; colocada detrás del plano de juego |

Los assets no usados quedan catalogados para futuras composiciones. El nivel usa un conjunto
seleccionado; los parámetros de sesión se asignan a sus instancias. No se añade Rigidbody al jugador.
La jerarquía agrupa Terrain, Traversal, Hazards, Enemies, Collectibles y Scenery; se retiraron los
objetos archivados, colisiones fantasma y composiciones anteriores de esta escena.

## Prueba manual

### Encuentros y feedback — level-030 / practice-v10

La misma V8 añade seis enemigos y siete trampas/peligros, además de dos bloques bajos
y una recepción roja de 1,3 m tras el rodillo.
Hay nueve enemigos: cinco bárbaros y cuatro patrullas Rogue. Los actores propios tienen
cápsula de 1,8 m × radio 0,36 m, Rigidbody cinemático y patrulla en suelo plano.

| Zona | Nuevos retos / refuerzo |
| --- | --- |
| Amarillo | Bloque bajo tras la caja y Rogue en 11,6–14,8 m |
| Azul | Rodillo 48,2–49,8 m, sierra suspendida sobre el puente, Rogue bajo su salida, bloque en 75 y bárbaro en 84,5–88 |
| Verde | Pinchos retráctiles en 101, bárbaro más rápido, prensa en 124 y Rogue en 128,5–131,3 |
| Rojo | Bárbaro en 144,5–148, pinchos retráctiles en 185,5 y Rogue en 186,6–189,5 |
| Final | Pinchos en 202, bárbaro más rápido, prensa en 215 y guardián en 234,6–237,8 |

Paleta: recompensas y resortes dorados; peligros y avisos rojos, piezas mecánicas neutrales;
suelo y decoración conservan el color de su tramo. Las cinco estrellas ahora comparten el oro.
El cuerpo enemigo conserva el atlas KayKit; el equipo no agranda su cápsula de daño.
La sierra cuelga de un arco azul del kit. El cielo usa una sola imagen con seguimiento de cámara
y parallax limitado a 8 m, eliminando las uniones entre paneles repetidos.

Moneda recogida: ascenso, giro, pulso y fundido de 0,64 s con cuatro destellos.
Estrella recogida: celebración de 0,95 s con ocho destellos y anillo. Los efectos son independientes
de los objetos recogidos, carecen de física y están limitados a doce simultáneos; se limpian al reiniciar.

Velocidades de patrulla: 2,4–3,3 m/s; el jugador conserva 7 m/s. Bárbaro: aviso 0,65 s,
pausa 2,25 s tras disparar y recuperación 0,32 s. Rogue: aviso 0,45 s, alcance 1,8 m,
ventana activa 0,16 s y recuperación 0,5 s. La dirección se fija al avisar; los sólidos bloquean
el ataque. Ambas variantes conservan stomp, muerte y protección durante entrada/respawn.

La cápsula del jugador recorre unos 2,5 m durante el aviso melee al acelerar desde reposo,
más que alcance + radio (2,16 m). El rango es fijo: moverse detrás también evita el golpe.
La sierra tiene radio físico 0,62 m dentro del visual de 0,75 m, brazo de 2 m y oscilación
±40° cada 3,8 s. Su borde inferior mínimo es 4,48 m; el jugador sobre el puente llega a
4,28 m estando de pie, dejando 0,20 m para pasar caminando. Saltar allí exige observar su ciclo.
Entre la prensa de 124 y la cápsula del Rogue hay aproximadamente 3,3 m de suelo libre.
La recepción elevada roja se prolonga hasta x184,3: permite aterrizar después del rodillo,
preparar el salto desde x183,3 y superar los pinchos de x185,5 antes de la patrulla.

Las hitboxes de peligro se ajustan a los meshes locales con un margen de 7–8 % en X/Z;
los rodillos y la sierra usan esfera. Los pinchos dañan durante su fase extendida.
La cápsula real decide contacto/stomp, el barrido de esfera decide impactos de hachas.
No se usan radios amplios de proximidad para el cuerpo de los enemigos propios.

Prueba adicional: observar el aviso de cada ataque, esquivarlo hacia atrás o saltando,
comprobar muerte animada, atravesar la sierra caminando, esperar las tres prensas
y ver el feedback de moneda/estrella en teléfono real.
La guía de desarrollo usa disparos desde suelo y distancia de 7,5–9,8 m antes de las
combinaciones pinchos/bárbaro, y espera a que pasen los proyectiles liberados antes de avanzar.
No modifica posiciones, munición ni vulnerabilidad para completar el recorrido.

### Recorrido

1. Abrir el portal y comprobar que el personaje reposa en el suelo antes de iniciar.
2. Iniciar: entrada caminando desde la izquierda, cronómetro detenido hasta entregar el control.
3. Romper la primera caja con un salto. Recoger el hacha y lanzar con X o HACHA.
4. Recorrer los cinco tramos, usando los ciclos de prensa, pinchos y transbordador.
5. Probar hachas y salto sobre enemigos: observar caída animada y ausencia de daño del cuerpo muerto.
6. Buscar las cinco estrellas; al menos 24 monedas abren la meta.
7. Caer antes/después de activar una bandera: fundido y regreso a la zona segura.
8. Iniciar una segunda práctica: cajas, enemigos, munición, monedas y checkpoints deben reiniciarse.

La versión vigente y sus pruebas realmente ejecutadas se registran en STATUS y VERIFICATION.
Portal LAN: **http://192.168.1.4:8080**.
La aceptación humana de ritmo, dificultad, estética y rendimiento en móvil sigue pendiente.
