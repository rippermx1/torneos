# Primer release gratuito de 2048 — v0.1.0

Alcance: práctica gratuita con recuperación en el navegador, desafío diario y
actividad de cuentas por día de Chile con informe D1/D7. El entrenamiento rewarded
es una demostración; el ticket muestra condiciones propuestas sin compra disponible.
El catálogo público contiene sólo 2048. Este release no configura cobros ni anuncios.

La fuente deriva de la candidata DEV c480a8d mediante overlays explícitos y se
valida en CI antes de asignar el dominio productivo. DEV y producción mantienen
proyectos, cuentas y datos separados; no se copia la base de usuarios de DEV.

## Integración de base de datos

Sobre el baseline productivo de agosto, aplicar en orden las migraciones:

1. 20261016123611_player_2048_account_activity_retention.sql
2. 20261016161709_community_free_2048_v4.sql
3. 20261016163652_guard_community_free_registration_clock.sql
4. 20261021130028_block_free_release_kyc_storage_capture.sql
5. 20261021221853_free_2048_production_contract_only.sql

No ejecutar indiscriminadamente migraciones de otros juegos o dinero real.
Las migraciones conservan filas históricas y alinean aceptación nueva a términos
1.4 sin modificar aceptaciones antiguas. Las cargas KYC de clientes y escrituras
monetarias de clientes quedan cerradas también en la base de datos. Las cuentas
normales usan las APIs de la web; los secretos de servidor no se exponen al cliente.

No crear ni convocar retos comunitarios en este primer lanzamiento: el cierre
oficial aún requiere integrar la revisión de integridad ausente en el baseline
productivo. Práctica, diario y retorno no dependen de ese cierre. Los procesos
automáticos financieros antiguos quedan pausados y no se sustituyen por cobros.

## Publicación y reversión

Compilar con identidad production-free-2048, Supabase productivo, origen canónico
https://www.torneosplay.cl y Google deshabilitado. No incluir credenciales de Flow,
Mercado Pago ni anuncios. Preparar con --prod --skip-domain, comprobar el build y
promover ese mismo deployment. El preflight no debe deshabilitarse.

Hay un deployment estático de mantenimiento separado, sin formularios, APIs ni
operaciones de dinero, identificado en el recibo operativo del release. Ante fallos
de acceso, actividad, carga o bloqueo monetario, promover ese deployment. Conservar
las nuevas tablas, los datos y las restricciones; no ejecutar DROP ni reactivar
dinero. No usar como reversión automática el deployment histórico de pagos.

La comprobación técnica utiliza cuentas QA propias y verifica confirmación,
login, recuperación, práctica, diario y ausencia de duplicados al recargar. Las
cuentas, sesiones y actividad QA se retiran al terminar para no contaminar cohortes.
La evidencia operativa del despliegue identifica commit, inventario, CI, deployment,
pruebas, limpieza y destino de reversión.

## Límites

La identidad jurídica pospuesta por el usuario, el proceso de conservación y
eliminación central y la prueba en teléfono físico siguen pendientes. Este release
no acredita demanda ni retorno humano: las primeras sesiones reales y la maduración
D1/D7 se medirán después. QA y una consulta de ticket no representan jugadores ni ventas.
