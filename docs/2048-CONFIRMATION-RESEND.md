# 2048 v0.1.1 — reenvío de confirmación sin sesión

Incremento de cuentas sobre v0.1.0. La candidata se valida en CI y desarrollo;
producción, su Auth, base de datos y configuración no forman parte del despliegue.
Rewarded sigue en demostración, el ticket informativo no está disponible para
compra y el catálogo público sigue limitado a 2048 gratuito.

El alta pendiente muestra un formulario de reenvío con el correo en estado React.
/verify-email permite introducirlo desde un navegador nuevo sin sesión; un enlace
vencido ofrece ese recorrido desde el login. El correo no se coloca en URLs ni se
persiste en almacenamiento de la aplicación. Los mensajes no confirman la existencia
de una cuenta ni exponen errores internos de Auth.

POST /api/auth/resend-confirmation admite sólo email y next interno. Comprueba origen
canónico, Content-Type, cuerpo de hasta 2 KiB, email de hasta 254 caracteres y destino
de hasta 1024. Usa cuotas distribuidas existentes, con claves hash: tres solicitudes
por IP en cinco minutos, una por correo en un minuto y cinco por correo en una hora.
Si no puede comprobarlas, responde 503 sin llamar al proveedor. Cuota agotada: 429,
Retry-After y espera en pantalla. No requiere cambios de esquema ni nuevas tablas.

El transporte de Supabase usa sólo la clave pública y /auth/v1/resend con type signup:
no crea usuarios, no reintenta signUp, no consulta usuarios administrativos ni escribe
actividad, progreso o resultados. Cuenta inexistente/confirmada tienen respuesta
neutral 202. El cooldown específico del proveedor también es neutral, para evitar
revelar ese estado; las cuotas propias siguen aplicándose a todos los correos.
Fallas operativas/red devuelven un error genérico reintentable, sin afirmar entrega.

El SDK instalado no añade PKCE al reenviar. Por ello se genera challenge S256 y un
verificador aleatorio de un solo uso en cookie dedicada HttpOnly, SameSite=Lax,
Secure en HTTPS, host-only y limitada a /auth/confirm durante una hora. No reemplaza
el verificador de alta o recuperación del SDK. El callback del reenvío exige su ID
y cookie, intercambia el código con el SDK público en storage de memoria y persiste
la sesión mediante SSR. Enlace viejo, repetido, expirado o abierto en otro navegador
no crea perfiles ni actividad; un callback viejo no borra un flujo nuevo. El correo
debe abrirse en el navegador que solicitó el reenvío. Los flujos normales de alta y
recuperación se conservan. Los redirects llevan no-store y no-referrer.

La interfaz bloquea submits simultáneos y usa AbortController, timeout de 15 segundos
y estado de operación para ignorar callbacks tardíos, cambios de email y unmount.
El estado aceptado sólo indica una solicitud condicional; la recepción se comprueba
por separado en QA. Las pruebas de SDK con transporte simulado no acreditan SMTP.

La verificación operativa debe identificar commit/inventario idénticos entre CI y
deployment DEV, probar reenvío desde navegador nuevo y consumir el enlace recibido
realmente, comprobar reintentos/cuenta confirmada/inexistente sin duplicados y
retirar exclusivamente la cuenta QA propia con revocación previa de sesiones.
La medición de juego debe permanecer a cero; QA no cuenta como retorno D1/D7 humano.

Para revertir el incremento de DEV, reasignar sólo torneos-dev.vercel.app al deployment
anterior registrado en el recibo operativo; conservar RM14 y producción. No hay down
migrations ni cambios Auth/template que revertir.
