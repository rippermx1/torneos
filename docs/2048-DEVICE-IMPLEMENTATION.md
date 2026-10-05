# G2048-08.1 — carga, controles táctiles y suspensión física

**Actualización 2026-10-05 / E28:** [terminado bajo el criterio simulado aprobado](2048-SIMULATED-ACCEPTANCE.md).
Cuatro arrastres, seis combinaciones de GUI y 120 muestras de FPS/memoria en PC
PASS. No se afirma aceptación física del Xiaomi; el requisito original descrito
abajo se sustituyó para cerrar el ticket por instrucción explícita del propietario.

**En progreso: medición implementada y probada en PC; resultado del teléfono pendiente.**
Dispositivo indicado por el propietario: Xiaomi 12 Pro, Android, Chrome
(`OWNER_REPORTED`; versiones del sistema y navegador pendientes).
El propietario confirma que desde ese teléfono cargan el juego y el panel de
prueba por la dirección LAN (`OWNER_REPORTED`, sin informe de métricas aún).

Se mide la cápsula operativa `unity-2048-007` de 3081, imagen
`g2048-101-candidate-1790975961824`. El host sigue orquestando la partida y
Unity representa tablero/puntaje y expone direcciones. Este incremento añade
herramientas locales de observación; no crea otra implementación del juego.

## Implementación

- `scripts/measure-2048-delivery.mjs`: seis archivos, tres lecturas por archivo,
  SHA256, descompresión gzip, MIME WASM y respuesta condicional ETag.
- `scripts/2048-device-probe/server.mjs`: servidor temporal de práctica en 3083,
  enlazado explícitamente a una IPv4 privada. Solo permite `/play`, recursos
  públicos Next y la cápsula `007`. No reenvía cookies, credenciales, parámetros
  de consulta ni peticiones a Auth/API/Flow. Conserva la CSP y usa su nonce para
  cargar el registrador. No modifica el firewall ni el contenedor operativo.
- El registrador observa mensajes reales, carga, direcciones, punteros táctiles,
  pérdida de contexto WebGL, orientación y visibilidad. Usa el `GetMetricsInfo`
  expuesto por el loader publicado para FPS, memoria WASM/JS y tiempos de Unity.
  Guarda el JSON mediante el botón del panel, con recibo UUID, en
  `artifacts/2048-device/`. El modelo y las observaciones son declaraciones del
  usuario; el guardado no certifica automáticamente el dispositivo ni aceptación.
- El panel está fuera de la GUI del juego y solo aparece en la prueba temporal.
  No inyecta movimientos, estados ni eventos de suspensión. Los informes tienen
  límites de tamaño y muestras para evitar crecimiento indefinido.

## Verificación ejecutada

| Evidencia | Resultado y límite |
| --- | --- |
| HTTP directo a 3081 | Seis hashes/gzip/MIME correctos; **17.562.585 bytes** publicados y **53.211.103 bytes** descomprimidos. ETag/304 comprobado. No mide arranque ni conexión del teléfono. |
| Pruebas web | **49/49** en tres archivos: límites del servidor temporal y contratos del reloj/recuperación existentes. No sustituyen suspensión física. |
| Navegador PC real | Unity cargado, panel visible, métricas disponibles, inicio/flechas y puntaje 4. JSON guardado mediante UI, recibo `e39fdedc-b172-4ec9-939c-c8deefefbeec`. Captura revisada: tablero/puntaje preservados y panel contraído fuera del juego. |
| Medición inicial PC | `game.ready` a **8.793 ms** desde navegación; WASM reservado **128 MiB**, usado aproximadamente **84 MiB**. Última muestra guardada: FPS 54,12 y media móvil 47,52. Navegador automatizado con carga/instrumentación: no es benchmark del Xiaomi ni objetivo aprobado de rendimiento. |
| Unity Editor/build | `STATUS_NO_INSTANCES`; no se ejecutó una nueva compilación ni se modificaron PlayerSettings. Se prueba el artefacto operativo existente. |
| Teléfono físico | Acceso LAN, carga del juego y panel confirmados por el propietario. **Pendiente**: versiones, tacto, orientación, fluidez y regreso real. No hay ADB conectado ni informe de métricas del Xiaomi disponible. |

No se limpiaron cachés del navegador: primera navegación observada no significa
carga fría. Las métricas del registrador tienen coste y sirven para detectar
problemas; cualquier optimización se contrasta después en la versión sin panel.
Entrega HTTP completa en `artifacts/2048-device/delivery.json`.
Resumen reproducible: [2048-DEVICE-EVIDENCE.json](2048-DEVICE-EVIDENCE.json).

La revisión de fuentes confirma gzip, memoria inicial 128 MiB, DPR limitado a 1,5
y objetivo 60 FPS. No se cambia la cadencia ni la memoria sin un fallo o una
medición física que lo justifique. Referencias oficiales para interpretar los
datos: [rendimiento Web Unity 6.3](https://docs.unity3d.com/6000.3/Documentation/Manual/webgl-performance.html)
y [memoria Web Unity 6.3](https://docs.unity3d.com/6000.3/Documentation/Manual/webgl-memory.html).

## Recorrido en el Xiaomi

1. Conectar el teléfono al mismo router que el PC. Abrir Chrome en
   **http://192.168.1.4:3083/play**. La dirección es local y temporal; si no carga,
   registrar el error. No cambiar reglas de red o firewall automáticamente.
2. Esperar la carga. Abrir «Prueba técnica 2048», indicar modelo/versiones y cerrar
   el panel para jugar. Iniciar desde la plataforma; deslizar en las cuatro
   direcciones, con pausas entre gestos, y jugar dos minutos. Observar respuesta,
   desplazamiento accidental de la página, movimientos perdidos/duplicados y calor.
3. Probar «Ampliar juego», girar a horizontal y volver a vertical. Confirmar que
   tablero y puntaje siguen visibles, sin recorte ni desplazamiento del toque.
4. Recordar tablero/puntaje. Salir a Inicio durante 30 segundos y regresar sin
   recargar. Repetir bloqueando el teléfono 60 segundos. Confirmar la misma partida,
   ausencia de movimientos espontáneos y respuesta del siguiente gesto. Probar
   también salir mientras se mantiene un dedo sobre el tablero y volver.
5. Volver a vista normal; abrir el panel, escribir las observaciones y pulsar
   «Guardar informe en el PC». Comunicar el recibo y cualquier fallo observado.
   Si Chrome descargó la pestaña, registrar ese hecho y repetir con un informe
   guardado antes de suspender; la memoria del registrador se pierde al recargar.

Para una segunda carga, guardar primero el informe y recargar; etiquetarla como
segunda navegación, sin asumir caché fría/caliente. Para medir frío de forma
controlada hará falta acordar cómo borrar solo los datos de este origen.

## Reproducción y cierre

Desde `C:/torneos`, con 3081 saludable:

```powershell
node scripts/measure-2048-delivery.mjs
node scripts/2048-device-probe/server.mjs --host 192.168.1.4
```

Detener con Ctrl+C en la terminal propietaria. El puerto está fijado a 3083;
la IP se valida como privada. `artifacts/2048-device/server.json` identifica
PID/origen para detener únicamente este proceso. Los informes son locales e
ignorados por Git; no se envían a servicios externos.

Cerrar G2048-08.1 exige revisar el informe físico y observaciones, corregir
fallos reproducidos y repetir el caso afectado. La práctica física no cierra
**G2048-04.4**: el regreso competitivo autenticado necesita su propio recorrido
con reloj, servidor y resultado; Auth local sigue configurada en loopback.
GUI humana/lector de pantalla permanecen en 06.2/07.2.
