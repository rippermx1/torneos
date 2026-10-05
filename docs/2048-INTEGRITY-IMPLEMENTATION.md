# G2048-09.3 — revisiones y coherencia de sanciones

2026-10-05. **G2048-09.3 terminado y probado localmente**: 3.226 pruebas web en
15 archivos, 22 checks SQL PostgreSQL 17.11, tipos/lint, Next producción y panel
en navegador PASS. Activación operativa pendiente. La plataforma mantiene la autoridad
competitiva y Unity conserva su papel de cápsula. No se cambian Unity, reglas de
2048, Flow, premios publicados ni el algoritmo financiero de liquidación.

## Cambios

| Gap | Control implementado | Límite |
| --- | --- | --- |
| Bot pausado de 500 ms pasa los detectores anteriores | Ventana de 30 intervalos de servidor entre 80–2.000 ms, variación máxima 10 ms. Señal persistida `regular_pace`; revisión previa a liquidar y guard SQL independiente | Heurística de revisión; no prueba automatización. Bot con pausas variables puede pasar |
| Señales sin decisión trazable | Panel en `/admin/tournaments/<id>/games`, API administrativa con MFA. Descartar con motivo de 10–1.000 caracteres o sancionar una infracción confirmada | El operador debe revisar la partida y la evidencia. No hay sanción automática por cadencia regular |
| Cuenta bloqueada pero partidas válidas por fallo parcial | RPC única guarda bloqueo, invalidación de partidas sin liquidar y bitácora. El fallo revierte todo | El detector anterior sigue trabajando después de responder al movimiento; no se garantiza detección antes del primer movimiento sospechoso |
| Movimiento concurrente admite una cuenta recién sancionada | Commit toma bloqueo compartido del perfil antes del exclusivo de la partida. Sanción toma perfil, torneos ordenados y partidas | Un movimiento que ganó primero puede quedar persistido; la sanción posterior invalida su elegibilidad |
| Partida terminada aún elegible al sancionar | Invalida partidas activas y terminadas de torneos todavía sin liquidar | Retirar una sanción no restaura esas partidas ni libera la participación |
| Sanción posterior contradice resultado ya liquidado | Conserva partida, score, ranking y ledger. Guarda `settled_sanction` para revisar la incidencia | Sin recalcular premios, reversas ni adjudicación automática. Resolución comercial de la incidencia queda en el procedimiento correspondiente |
| Una identidad verificada abre varias cuentas | Reserva privada por RUT normalizado y torneo. Incluye puntos, guion, DV mayúscula/minúscula y cero inicial; dos inserts concurrentes producen una participación | No identifica a personas con cuentas sin KYC, identidades prestadas o documentos falsos |
| Partidas antiguas no tienen reserva de identidad | Insert revisa participantes verificados anteriores; escaneo detecta colisiones de identidad tras cambios de aprobación KYC | La señal requiere decisión; no se castiga por compartir IP, Wi-Fi o teléfono |

## Cierre del torneo y revisión

El cambio a `finalizing` persiste señales del historial de movimientos. El
scheduler y la finalización manual consultan la revisión antes de invocar la
función financiera existente. Si queda una señal pendiente, el torneo continúa
en `finalizing`, sin liquidación confirmada. El operador revisa las partidas,
registra motivo y descarta un falso positivo o sanciona una infracción confirmada.
Después vuelve a finalizar el torneo mediante el control existente.

El trigger de transición a `completed` vuelve a escanear y rechaza la transacción
si queda una señal elegible sin resolver. Protege también llamadas directas a la
RPC financiera: el rechazo revierte resultados y créditos de esa transacción.
Las señales se consultan por API administrativa; si el escaneo de una llamada
directa se revierte junto al rechazo, la consulta en `finalizing` las persiste.

Los casos, reservas de identidad y bitácora están en `integrity_private`, con RLS
y sin acceso de `anon`/`authenticated`. Las tres RPC nuevas usan invoker y permisos
solo para `service_role`; triggers con definer están en el esquema privado y
usan búsqueda de esquemas vacía. Las decisiones manuales comprueban actor admin
en SQL además del MFA de la ruta. El cliente recibe evidencia sin RUT ni semilla.

La política automática anterior de ráfagas y promedio de puntos se conserva,
ahora con aplicación atómica. Sus umbrales continúan siendo heurísticos. No se
introduce una afirmación de que todo score elevado demuestra trampas.

## Validación y reproducción

Ver cifras finales y hashes en [E21](2048-INTEGRITY-EVIDENCE.json).

```powershell
node scripts/verify-2048-integrity.mjs --sql --pg-bin artifacts/2048-adversarial/postgres-portable/pgsql/bin
node scripts/preview-2048-integrity.mjs
```

El verificador crea un cluster nativo PostgreSQL 17.11 nuevo, con UUID y puerto
loopback efímeros. Usa perfiles/torneos/partidas sintéticos y las funciones SQL
originales de wallet UUID y liquidación, junto con la migración candidata completa.
No es una reproducción completa de Supabase Auth/PostgREST ni de todas las
migraciones financieras. Comprueba permisos de los roles, rollback, ventanas,
identidades equivalentes, concurrencia y ambos órdenes de sanción/liquidación.
Solo detiene el cluster propio. No toca otras instancias PostgreSQL.

Las pruebas web importan helper, rutas y ciclo de vida reales; sustituyen transporte
Supabase y MFA por fixtures. Ningún correo, pago o devolución real se ejecuta.
La prueba de navegador renderiza el componente React real, con estilos de la
plataforma y endpoints sintéticos de decisión. Comprueba motivo obligatorio,
descarte, sanción, error sin éxito falso, verificación indisponible y resultado
liquidado sin botones de reversa. Capturas en `artifacts/2048-integrity/ui-*.png`.
No acredita MFA real, aceptación humana, teléfono físico o integración operativa.

Next 16.3.8 se compila en snapshot de HEAD + únicamente las fuentes de esta entrega,
sin trabajo paralelo ni copias Unity. Solo se ajusta en ese snapshot la raíz de
Turbopack para contener el enlace a dependencias locales. Se conservan manifiesto,
hashes y log de build. Las variables del build usan valores sintéticos y un puerto
loopback sin servicio; no se usa configuración operativa.

## Integración pendiente

La migración `20261005131216_guard_2048_integrity_reviews.sql` fue creada mediante
Supabase CLI y validada en el cluster desechable. **No se aplicó a la DB operativa
ni se activó una imagen web**. También sigue pendiente la aplicación operativa de
los permisos de semilla de 09.2. La web nueva requiere las RPC de esta migración;
si no están disponibles, sanción/finalización responden indisponibilidad y no
confirman escrituras parciales. Integrar DB y web conjuntamente.

**Siguiente G2048-09.4:** integrar 09.2/09.3 en el ambiente local autorizado y
verificar el recorrido autenticado completo: torneo con señal, bloqueo de
liquidación, revisión MFA, falso positivo descartado/infracción sancionada,
reintento de finalización y resultado/ranking persistidos. El padre G2048-09
continúa En progreso. Automatización con variación y personas sin identidad
verificada siguen siendo riesgos explícitos; no se declaran resueltos.

Referencias de implementación: [funciones Supabase](https://supabase.com/docs/guides/database/functions)
y [bloqueos PostgreSQL 17](https://www.postgresql.org/docs/17/explicit-locking.html).
