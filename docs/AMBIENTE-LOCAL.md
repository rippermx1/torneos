# Ambiente local operativo

Validado el 2026-10-01 en `codex/operational-local-environment`, desde `8790a37`.
El workspace activo es `C:/torneos`. No requiere Orbit ni usa su backend.

## Arranque

Con Docker Desktop ejecutándose y las builds WebGL locales conservadas:

```powershell
cd C:/torneos
npm ci
npm run local:up
```

El comando usa Supabase CLI **2.119.0** fijado en el lock, inicia PostgreSQL 17,
Auth, REST, Storage, Realtime, Mailpit y Studio; aplica las migraciones existentes
en una instalación nueva; crea cuentas/torneos compatibles y configura cuatro
tareas de Supabase Cron. Construye y espera la salud de `torneos-app-1`.
Hay un único contenedor de aplicación para web, APIs y ambos juegos; Supabase
utiliza sus contenedores de infraestructura estándar.

| Recurso | Dirección |
| --- | --- |
| Web pública, cuenta y torneos | http://127.0.0.1:3081 |
| 2048 Unity gratuito | http://127.0.0.1:3081/play |
| Alien Run gratuito | http://127.0.0.1:3081/play/alien-run |
| Correo capturado | http://127.0.0.1:54324 |
| Supabase Studio | http://127.0.0.1:54323 |
| API de Supabase para navegador | http://127.0.0.1:54321 |
| PostgreSQL | 127.0.0.1:15432 |

Se generan secretos exclusivamente locales en `.env.local-stack`, ignorado por
Git. **No se sobrescribe `.env.local` ni se utiliza su proyecto cloud, Flow o
Resend.** El contenedor recibe el archivo local y variables públicas al construir.
El servidor utiliza `host.docker.internal:54321`; el navegador, loopback. Ambos
comparten el mismo nombre de cookie. Las redirecciones usan `APP_URL`.

## Cuentas y uso

Las cuentas iniciales son `jugador1.local.e2e@example.com`,
`jugador2.local.e2e@example.com` y `operador.local@example.com`; su contraseña
generada está en `SUPABASE_E2E_PASSWORD` dentro de `.env.local-stack`.
El operador configura MFA desde el flujo habitual antes de entrar a administración.
El arranque conserva cuentas, perfiles, partidas y factores MFA existentes.
`admin.local.e2e@example.com` queda reservado para las pruebas automáticas.

También funciona crear una cuenta en `/sign-up`: abrir su confirmación en Mailpit,
completar onboarding e inscribirse. Los perfiles iniciales aprobados son fixtures
sintéticos; esa aprobación no constituye una verificación real de identidad.
Un perfil pendiente sigue recibiendo HTTP 403 al intentar checkout pagado.
Google está deshabilitado con una explicación visible; habilitarlo requiere
configurar ese proveedor por separado.

Los torneos de demostración son `is_test=true` y sólo se muestran en el catálogo
cuando la app y la base son locales. Los precios/premios se rigen por los presets
existentes y sólo tienen valor de prueba. El catálogo productivo continúa
excluyendo los torneos de prueba. Al cerrar la entrega, el demo gratuito tiene
dos inscritos y una ventana de juego abierta; el demo pagado permite explorar
la inscripción simulada. Los horarios evolucionan: `local:seed` crea nuevos demos
cuando no queda ninguno con inscripción futura; también se pueden crear desde admin.

## Pagos y correo

El propietario eligió **simulador local para desarrollo**. El checkout abre una
página identificada como simulador y permite aprobar, rechazar o cancelar sin
tarjetas ni datos bancarios. El resultado se guarda en el volumen
`torneos_local_flow_data` y se confirma mediante el webhook y RPC existentes.
Las consultas del proveedor requieren la firma HMAC del cliente Flow existente.
El simulador rechaza callbacks externos, montos inválidos y cambios de resultado
definitivo. Si falla el webhook, reintentar el mismo pago conserva su resultado.

Los reembolsos se crean pendientes y el proveedor simulado informa `completed`
en la consulta posterior. La conciliación existente los completa automáticamente
cuando alcanzan su antigüedad mínima (10 minutos); el smoke también prueba el
webhook de reembolso. No se usan comisiones reales: el simulador devuelve fee=0.
No representa todos los errores, plazos ni medios de pago de Flow sandbox.

Los mensajes de Auth y plataforma quedan en Mailpit. La clave de Resend está
vacía. Las plantillas alojadas en Resend se muestran localmente como una vista
de sus variables, identificada `[LOCAL]`; los emails HTML propios se conservan.

Los endpoints del simulador exigen modo local y URLs HTTP locales de aplicación,
base y proveedor. Un booleano aislado no habilita este circuito en producción.

## Pruebas y operación

```powershell
npm run local:smoke
npm test
node --test scripts/__tests__/container-workspace.test.mjs
node scripts/verify-container.mjs http://127.0.0.1:3081
npm audit
```

`local:smoke` carga únicamente la configuración local, prepara las tres cuentas
E2E y restablece **sólo el MFA del admin sintético**. Conserva el MFA del operador.
Prueba Auth, confirmación, MFA AAL2, creación administrativa con el preset interno
vigente, capacidad, inscripción, movimientos servidor, finalización/ranking y
seis contratos de pago/reembolso. Cada prueba de pagos usa una identidad nueva
para no consumir el límite de checkout de las cuentas de uso manual.

Logs, informes y capturas: `artifacts/local-environment`. Algunos logs de CLI
contienen claves locales: no compartirlos ni versionarlos. La evidencia resumida
sin secretos está en `LOCAL-ENVIRONMENT-EVIDENCE.json`.

Para detener la aplicación conservando los volúmenes:

```powershell
docker compose --env-file .env.local-stack -f compose.app.yaml -f compose.local.yaml stop
npx supabase stop
```

No usar `down -v`, `db reset` o `stop --no-backup` para un reinicio ordinario.
El antiguo `docker-compose.yml` DB/PostgREST y `dev:games` son alternativas
anteriores; no arrancarlos junto al stack para probar Auth. Fuentes Unity,
arte/licencias y `C:/play-games` siguen fuera de la imagen y del trabajo de esta entrega.

La app publica sólo loopback. Los servicios del CLI Supabase usan sus bindings
locales predeterminados de Docker, que aparecen como `0.0.0.0` en el inventario.
No se han configurado OAuth externo, Flow sandbox público, despliegue, aceptación
humana ni teléfono físico. Alien Run sigue siendo práctica sin premios.
