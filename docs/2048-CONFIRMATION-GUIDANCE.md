# v0.1.2 — guía y recuperación de confirmación

El formulario de reenvío explica que el enlace más reciente se abre en el mismo
navegador, perfil y ventana privada que solicitó la confirmación. Si la aplicación
de correo abre otro navegador, indica copiar el enlace y pegarlo en la barra de
direcciones de la ventana solicitante. La guía sigue visible después de la respuesta
neutral, de un límite o de un error operativo. Registro y verificación comparten el
mismo formulario y la misma guía.

El error de confirmación en inicio de sesión explica, sin diagnosticar el estado de
la cuenta, que el enlace pudo vencer, usarse o abrirse en otro navegador. Ofrece
iniciar sesión con email y contraseña si ya se confirmó; para cuentas pendientes,
permite solicitar otro enlace desde ese navegador sin volver a registrarse.
El destino de regreso se conserva sólo si es interno y válido; ausentes, externos
o bucles de onboarding vuelven a la práctica gratuita. No se muestra información
del proveedor ni se completa el email desde la URL.

Esto es presentación y navegación. El callback, la comprobación PKCE, su cookie,
el transporte de reenvío y las cuotas distribuidas no cambian. Abrir un enlace no
programa otro envío ni crea una cuenta. La cuenta puede quedar confirmada en el
proveedor aunque la aplicación rechace instalar una sesión por falta de verificador;
en ese caso el acceso con contraseña es la recuperación prevista.

## Validación del incremento

Las pruebas focales cubren visibilidad antes/después de 202, 429 y 503, ausencia de
envíos automáticos, mensajes neutrales y destino seguro. La fuente comprometida se
valida con el flujo existente de CI y se publica únicamente en el proyecto DEV.
La comprobación operativa debe usar correo real con una cuenta QA propia, seguir
la recuperación en un navegador sin su verificador, comprobar un único usuario y
perfil, actividad cero y retirar sólo esa cuenta con revocación de sus sesiones.
Los errores controlados se distinguen de expiración natural o aceptación humana.

Rewarded permanece en demostración, ticket informativo sin compra, catálogo público
sólo 2048 y dinero bloqueado. No requiere migraciones ni cambios de configuración
Auth, SMTP, templates o variables compartidas. No se publica en producción.
La evidencia operativa separada identifica commit, inventario, CI, deployment,
recorridos, limpieza y reversión de DEV, conservando producción y RM14.
