import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Política de Privacidad — TorneosPlay',
  description: 'Datos de la práctica gratuita de 2048, la cuenta opcional y las demostraciones.',
}

export default function PrivacidadPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">
      <div>
        <Link href="/play" className="text-sm text-muted-foreground hover:text-foreground">← Práctica gratuita</Link>
        <h1 className="text-3xl font-bold mt-4">Política de Privacidad</h1>
        <p className="text-sm text-muted-foreground mt-1">Servicio gratuito de 2048 · 21 de octubre de 2026</p>
      </div>

      <Section title="1. Alcance y operador">
        <p>
          Esta política describe la práctica y el diario gratuitos de 2048, los retos comunitarios
          gratuitos que se publiquen, el entrenamiento de demostración y la ficha informativa de ticket.
          TorneosPlay es el nombre del servicio, administrado por su equipo operador.
        </p>
        <p>
          El contacto declarado para consultas de privacidad es{' '}
          <a href="mailto:privacidad@torneosplay.cl" className="underline underline-offset-2">privacidad@torneosplay.cl</a>;
          para consultas del servicio,{' '}
          <a href="mailto:contacto@torneosplay.cl" className="underline underline-offset-2">contacto@torneosplay.cl</a>.
        </p>
      </Section>

      <Section title="2. Jugar sin cuenta y datos del navegador">
        <p>
          Puedes practicar y jugar el diario sin registrarte. El navegador conserva marcas,
          últimas partidas, progreso del diario y días de juego. La práctica normal puede
          guardar tablero, semilla, puntaje y movimientos para continuar tras recargar.
          Ese guardado no se sincroniza con una cuenta ni entre dispositivos y no se incluye
          en la exportación de observaciones.
        </p>
        <p>
          También se conservan observaciones locales de sesiones, primeros movimientos e hitos,
          entrenamiento demo, solicitudes y aplicaciones demo, y consultas de la ficha de ticket.
          Estas últimas indican una consulta local y su origen, no una reserva, venta o persona única.
          Los cupos de la demostración se controlan en este navegador.
        </p>
        <p>
          El diagnóstico de carga conserva intentos, fechas, duración y resultados técnicos,
          con identificadores locales para enlazar los hitos ya observados. No conserva mensajes
          originales de error, direcciones web, contactos, tableros ni semillas.
          Su cobertura empieza al preparar el juego; una carga inconclusa no prueba abandono.
        </p>
        <p>
          Las observaciones y diagnósticos se descargan sólo si lo eliges. No se suben automáticamente.
          Importar un archivo en el informe administrativo lo procesa en memoria; si compartes
          voluntariamente una exportación con el operador, éste recibe el contenido que compartas.
          Los datos locales no se vinculan retrospectivamente a una cuenta.
        </p>
      </Section>

      <Section title="3. Datos de una cuenta opcional">
        <ul>
          <li><strong>Acceso:</strong> email y contraseña enviados a Supabase Auth para crear y proteger el acceso, confirmar el correo y recuperar la cuenta. Si eliges Google cuando esté disponible, se reciben los datos de cuenta que autorices en ese proveedor.</li>
          <li><strong>Perfil:</strong> nombre de usuario, fecha de nacimiento para comprobar el requisito de al menos 18 años, nombre completo opcional y fecha y versión de aceptación de las condiciones.</li>
          <li><strong>Actividad gratuita:</strong> con sesión iniciada se registran días con un movimiento válido, primera y última observación del día y si hubo práctica o diario. Este registro central no recibe tablero, semilla ni puntuación. Cargar, exportar o retomar sin mover no acredita juego; una continuación asistida no añade retorno.</li>
          <li><strong>Reto comunitario:</strong> al inscribirte se registra la participación y, si juegas, los movimientos y el resultado validado necesarios para su clasificación.</li>
          <li><strong>Soporte:</strong> se recibe la información que envíes voluntariamente al contactar o usar el formulario con cuenta. Comparte sólo lo necesario para explicar el problema.</li>
        </ul>
        <p>
          Los reportes de actividad de cuentas son observaciones técnicas, no una verificación
          de personas únicas o de interés comercial. Las pruebas QA se distinguen cuando están identificadas.
        </p>
      </Section>

      <Section title="4. Aviso de alta y finalidades">
        <p>
          Antes de enviar tus datos de registro se muestra el aviso y se solicita tu confirmación
          para crear y proteger la cuenta y enviar los correos necesarios para el acceso.
          La aceptación versionada de las condiciones y esta política se registra después,
          al completar los datos de cuenta. Crear la cuenta ya transmite los datos de acceso;
          la aceptación posterior no se presenta como si hubiera ocurrido antes.
        </p>
        <p>
          Los datos descritos se usan para prestar esas funciones gratuitas, proteger el acceso,
          resolver consultas y observar el uso y regreso a la práctica. No se solicita consentimiento
          publicitario o financiero. La práctica gratuita no necesita RUT, cédula ni datos bancarios;
          no los envíes para acceder a ella.
        </p>
      </Section>

      <Section title="5. Proveedores y datos técnicos">
        <p>
          La web utiliza Vercel para alojamiento y Supabase para autenticación, base de datos
          y almacenamiento. Las solicitudes transmiten datos técnicos como IP, navegador y
          cookies de sesión a la infraestructura que las atiende. El acceso con Google sólo
          interviene si eliges ese proveedor y está habilitado.
        </p>
        <p>
          Se utilizan cookies necesarias para el acceso y funcionamiento. En este servicio no
          se carga un SDK de anuncios reales ni se usa la demostración como consentimiento
          para publicidad comportamental. No se venden datos personales.
        </p>
        <p>
          Los pagos y el envío de datos a un proveedor de cobros no forman parte de este
          recorrido gratuito. Las regiones efectivas de procesamiento y los plazos de los
          registros de cada proveedor requieren confirmación del operador; no se presume que
          todos los datos permanezcan en Chile.
        </p>
      </Section>

      <Section title="6. Información pública y datos históricos">
        <p>
          En un reto comunitario, el nombre de usuario y el resultado pueden aparecer en la
          clasificación pública. Elige un alias sin datos privados. El perfil permite cambiar
          el nombre de usuario; la práctica y sus marcas locales no se publican como ranking oficial.
        </p>
        <p>
          Esta versión gratuita no requiere nuevas verificaciones financieras ni habilita pagos.
          Si existen datos o trámites de versiones anteriores, este texto no afirma que hayan
          sido eliminados ni que los controles de esas operaciones hayan cambiado.
          Su finalidad, acceso y conservación deben revisarse por separado; no justifican
          recopilar nuevos documentos o datos bancarios para jugar gratis.
        </p>
      </Section>

      <Section title="7. Conservación y eliminación">
        <p>
          El almacenamiento local usa límites por tipo de registro: por ejemplo, las últimas
          cinco partidas personales y hasta 200 intentos de diagnóstico. Puede truncarse o
          perderse por los ajustes del navegador. No hay un plazo uniforme de conservación
          para todos estos datos; puedes borrarlos desde los ajustes del sitio en tu navegador.
          Hacerlo también puede perder una práctica guardada y los límites locales de la demostración.
        </p>
        <p>
          No hay borrado automático de cuentas o actividad por antigüedad en esta versión.
          La cuenta, la actividad gratuita y las consultas de soporte se distinguen de los
          registros financieros históricos, si existen; su conservación no se trata como si
          todas las partidas gratuitas fueran transacciones tributarias.
        </p>
        <p>
          Puedes solicitar revisión, acceso, corrección o eliminación por el contacto de privacidad.
          Una solicitud no borra automáticamente datos que deban conservarse por una razón
          legal aplicable; el operador debe explicar qué conserva y por qué en el caso concreto.
        </p>
      </Section>

      <Section title="8. Consultas y seguridad">
        <p>
          Para pedir información sobre tus datos o ejercer los derechos que correspondan según
          la normativa aplicable, escribe a{' '}
          <a href="mailto:privacidad@torneosplay.cl" className="underline underline-offset-2">privacidad@torneosplay.cl</a>.
          Indica la cuenta o el asunto y la solicitud con los datos mínimos necesarios.
          No envíes contraseñas ni datos bancarios por correo.
          La solicitud se revisará según los derechos y plazos legales aplicables.
        </p>
        <p>
          El servicio utiliza autenticación y controles de acceso para proteger las cuentas
          y restringir la consulta de datos privados.
        </p>
      </Section>

      <div className="border-t pt-6 flex flex-wrap gap-6 text-sm text-muted-foreground">
        <Link href="/legal/terminos" className="underline underline-offset-2">Términos y Condiciones</Link>
        <Link href="/play" className="underline underline-offset-2">Jugar gratis</Link>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="space-y-2 text-sm text-muted-foreground leading-relaxed [&_ul]:list-disc [&_ul]:list-inside [&_ul]:space-y-2 [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  )
}
