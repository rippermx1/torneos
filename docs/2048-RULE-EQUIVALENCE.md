# G2048-09.1 — equivalencia de reglas Unity/servidor

Primer incremento de **G2048-09**: corpus común y verificación automatizada de
reglas. **09.1 terminado y probado localmente**; G2048-09 queda en progreso por
desempates, límites de sesión y revisión adversarial de automatización/multicuenta.
No aumenta el número de tickets del backlog base.

Los **2.936 escenarios** pasan contra `Game2048` real en TypeScript y
`PracticeBoard` real en C#. No se detectaron diferencias en las reglas
comparadas. El resultado entrega una regresión reproducible; no requiere
modificar los motores ni sustituir el cálculo competitivo del servidor.

## Qué se compara

| Cobertura | Casos / resultado |
| --- | --- |
| Resultados independientes | 40 anclas: huecos, compresión, triples, cuatro iguales, ausencia de fusiones encadenadas, valores distintos y fichas grandes. Resultado de tablero/puntos escrito explícitamente antes de generar. |
| Líneas exhaustivas | 625 combinaciones de cuatro celdas con valores 0/2/4/8/16, en las cuatro direcciones: 2.500 casos. Las posiciones de fila/columna varían entre las cuatro líneas. |
| Tableros completos | 96 entradas generadas con semilla fija, cuatro direcciones: 384 casos de varias fusiones y geometría completa. |
| Disponibilidad de movimientos | Tres tableros completos —terminal, con única fusión horizontal o vertical— en cuatro direcciones: 12 casos. Se compara `canMove` antes y después del deslizamiento. |
| Final después de aparecer una ficha | Casos horizontal/vertical que llenan la última celda sin permitir nuevas fusiones; ambos motores detectan el estado terminal después de la aparición. Llegar a 2048 permite continuar si quedan movimientos. |
| Contrato de aparición | Solo aparece una ficha en una celda vacía después de un movimiento efectivo. Valores 2/4; un movimiento sin cambios conserva tablero/puntos y no consume RNG. C# verifica también ambos valores con su RNG real, y una dirección inválida no altera su estado. |
| Copias y puntaje | Tablero de entrada preservado, snapshot TS separado del estado interno y puntuación previa más suma exacta de fusiones. |

El corpus se genera invocando el motor TS existente con una aparición controlada;
se retira únicamente la ficha indicada por su resultado para comparar el
deslizamiento determinista. No contiene otra implementación del juego. Las 40
anclas independientes evitan aceptar silenciosamente cambios básicos de reglas.
`--check` vuelve a calcularlo y exige igualdad con el archivo versionado.

## Archivos

- `scripts/2048-rule-cases.mjs`: generación y comprobación sin escritura.
- `scripts/verify-2048-rules.ps1`: ejecución local de corpus, tests web y Editor.
  Verifica que 2048 no esté ya abierto, usa Editor/CLI instalados y mantiene
  diagnósticos de licencias en archivos locales ignorados.
- `__tests__/2048-rule-equivalence.test.ts`: consume el mismo JSON que C#.
- `games/2048/UnityProject/Assets/Torneos/2048/Tests/EditMode/RuleEquivalenceTests.cs`:
  ejecuta los casos contra `PracticeBoard`, sin adaptar sus reglas al oracle.
- `Tests/EditMode/Fixtures/rule-cases.json` y sus `.meta`: fixture versionada,
  fuera de Resources y sin referencias desde escenas/runtime. La assembly de
  tests sigue limitada a Editor; Packages, ProjectSettings y GUIDs previos se
  conservan.

## Verificación

**2.995 pruebas web** en tres archivos (corpus más engine/RNG existentes),
**18 pruebas EditMode** (14 anteriores más cuatro nuevas), compilación C# en
Unity 6000.3.24f1, tipos del incremento, lint y corpus reproducible pasados.
Los tests C# recorren todos los escenarios para deslizamiento y aparición;
18 tests de Editor no significa solo 18 tableros.

No hay cambios del runtime, interfaz ni build publicada. No se ejecutó una
nueva build WebGL, PlayMode ni recorrido de navegador por este incremento de
tests. 3081 y el ambiente cloud conservan sus artefactos. No hay mutaciones
de DB, Flow, Auth, despliegues o licencias. No cierra prueba física ni aceptación
humana de 08.1/06.2/07.2, ni regreso competitivo autenticado de 04.4.
[Evidencia](2048-RULE-EQUIVALENCE-EVIDENCE.json).

## RNG y alcance

Unity WebGL usa estados confirmados por la plataforma; su `PracticeBoard` es
solo Editor/standalone. El RNG C# `System.Random` y el RNG competitivo TS tienen
secuencias distintas intencionalmente. Se verifica su contrato de aparición,
no igualdad de partidas a partir de la misma semilla. El servidor conserva su
semilla secreta, tablero y puntuación; Unity envía direcciones.

La cobertura usa tableros 4×4, valores legales y puntos dentro del rango de
`int` C#. No demuestra equivalencia para datos corruptos, desbordamientos ni
todos los tableros posibles. La selección de entradas con semilla fija es
reproducible, no una partida competitiva ni prueba estadística de fairness.

Siguiente incremento definido: **G2048-09.2**, revisar desempates y límites de
sesión con casos adversariales de direcciones automatizadas/multicuenta antes
de proponer correcciones concretas. La autoridad sobre puntos por sí sola no
identifica bots ni demuestra que haya jugado una persona.

## Reproducción

Desde `C:/torneos`, con Node **24** y los Unity CLI/Editor ya instalados:

```powershell
node scripts/2048-rule-cases.mjs --check
./scripts/verify-2048-rules.ps1
```

La herramienta verifica el corpus antes de ejecutar los dos motores. Para
regenerarlo tras revisar un cambio de reglas: `node scripts/2048-rule-cases.mjs`.
Sin instalaciones ni dependencias nuevas. Informes en
`artifacts/2048-equivalence/web-tests.json`, `editmode.xml` y logs locales.
