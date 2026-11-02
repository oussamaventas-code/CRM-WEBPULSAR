import { Link } from 'react-router-dom';
import LegalPage, { Field } from './LegalPage.jsx';
import { legalEntity as L } from '../data/content.js';
import { openCookieSettings } from '../hooks/useConsent.js';

// BORRADORES: estructura habitual para un prestador de servicios digitales en España (LSSI-CE, RGPD, LOPDGDD).
// Deben revisarse por un profesional antes de publicar. Los datos del titular se rellenan en src/data/content.js.

const Owner = () => (
  <ul>
    <li>Titular: <Field value={L.owner} label="nombre o razón social" /></li>
    <li>NIF/CIF: <Field value={L.taxId} label="NIF o CIF" /></li>
    <li>Domicilio: <Field value={L.address} label="domicilio fiscal" /></li>
    <li>Email: <Field value={L.email} label="email de contacto" /></li>
    {L.registry !== undefined && <li>Datos registrales: <Field value={L.registry} label="datos registrales, si es sociedad" /></li>}
    <li>Sitio web: {L.domain}</li>
  </ul>
);

export function AvisoLegal() {
  return (
    <LegalPage title="Aviso legal" path="/aviso-legal" description="Información legal sobre el titular y las condiciones de uso de webpulsar.es.">
      <h2>1. Datos identificativos</h2>
      <p>En cumplimiento del artículo 10 de la Ley 34/2002, de Servicios de la Sociedad de la Información y de Comercio Electrónico (LSSI-CE), se informa de los datos del titular de este sitio web:</p>
      <Owner />
      <h2>2. Objeto</h2>
      <p>Este sitio web presenta los servicios de Web Pulsar: desarrollo de CRM a medida, diseño y desarrollo de páginas web, asistentes de voz con inteligencia artificial, automatización de procesos y soluciones informáticas a medida.</p>
      <h2>3. Condiciones de uso</h2>
      <p>El acceso a la web es gratuito y atribuye la condición de usuario, que se compromete a hacer un uso adecuado de los contenidos y a no emplearlos para actividades ilícitas o contrarias a la buena fe.</p>
      <h2>4. Propiedad intelectual e industrial</h2>
      <p>Los contenidos, diseños, textos, código y marcas de este sitio pertenecen a su titular o se usan con autorización. Las marcas e imágenes de los proyectos mostrados pertenecen a sus respectivos titulares. No se permite su reproducción sin autorización expresa.</p>
      <h2>5. Responsabilidad</h2>
      <p>El titular no se hace responsable de los daños derivados de un uso indebido de la web ni de los contenidos de sitios de terceros enlazados.</p>
      <h2>6. Legislación aplicable</h2>
      <p>Estas condiciones se rigen por la legislación española. <Field value={null} label="juzgados competentes, a definir en la revisión legal" /></p>
    </LegalPage>
  );
}

export function Privacidad() {
  return (
    <LegalPage title="Política de privacidad" path="/privacidad" description="Cómo trata Web Pulsar los datos personales que nos envías a través de la web.">
      <h2>1. Responsable del tratamiento</h2>
      <Owner />
      <h2>2. Qué datos tratamos</h2>
      <p>Los que nos facilitas en el formulario de contacto: nombre, email y, si quieres, teléfono, empresa, el servicio que te interesa y tu mensaje. Si contratas un servicio online, también los datos necesarios para gestionarlo. Los datos de tu tarjeta los trata directamente Stripe; nosotros no los recibimos ni los guardamos.</p>
      <h2>3. Para qué los usamos</h2>
      <ul>
        <li>Responder a tu solicitud y, si lo deseas, preparar un presupuesto.</li>
        <li>Gestionar la relación contractual si contratas un servicio.</li>
        <li>Cumplir obligaciones legales, como las fiscales y contables.</li>
      </ul>
      <p>No usamos tus datos para enviarte publicidad sin tu consentimiento ni tomamos decisiones automatizadas que te afecten.</p>
      <h2>4. Base legal</h2>
      <p>Tu consentimiento, al enviar el formulario; la aplicación de medidas precontractuales o la ejecución del contrato; y el cumplimiento de obligaciones legales.</p>
      <h2>5. Cuánto tiempo los conservamos</h2>
      <p>Mientras sea necesario para atender tu solicitud o mantener la relación y, después, durante los plazos legales de conservación. <Field value={null} label="plazos concretos de conservación" /></p>
      <h2>6. Con quién los compartimos</h2>
      <p>No los cedemos a terceros salvo obligación legal. Trabajamos con proveedores que los tratan por nuestra cuenta: alojamiento del servidor (<Field value={null} label="proveedor de alojamiento" />), Cloudflare (seguridad y verificación anti-spam) y Stripe (pagos online).</p>
      <h2>7. Tus derechos</h2>
      <p>Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a <Field value={L.email} label="email para derechos" />. También puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).</p>
      <h2>8. Seguridad</h2>
      <p>Aplicamos medidas técnicas y organizativas para proteger tus datos: conexión cifrada, acceso restringido y registro de actividad.</p>
    </LegalPage>
  );
}

export function Cookies() {
  return (
    <LegalPage title="Política de cookies" path="/cookies" description="Qué cookies y almacenamiento local usa webpulsar.es y cómo cambiar tus preferencias.">
      <h2>1. Qué usamos ahora mismo</h2>
      <p>Esta web solo utiliza almacenamiento técnico imprescindible:</p>
      <ul>
        <li><code>wp-cookie-consent-v1</code> (almacenamiento local de tu navegador): guarda tus preferencias de cookies. Necesaria.</li>
        <li>Cloudflare Turnstile, en el formulario de contacto: verificación anti-spam necesaria para proteger el formulario. Puede usar almacenamiento técnico propio de Cloudflare.</li>
      </ul>
      <p>No usamos cookies analíticas ni de marketing.</p>
      <h2>2. Categorías</h2>
      <ul>
        <li><strong>Necesarias:</strong> imprescindibles para el funcionamiento y la seguridad. Siempre activas.</li>
        <li><strong>Analíticas:</strong> nos ayudarían a entender el uso de la web. Solo se activarían con tu permiso.</li>
        <li><strong>Marketing:</strong> permitirían mostrar publicidad relevante. Solo se activarían con tu permiso.</li>
      </ul>
      <h2>3. Cambiar tus preferencias</h2>
      <p>Puedes cambiar tu elección en cualquier momento:</p>
      <p><button type="button" className="btn btn-secondary btn-sm" onClick={openCookieSettings}>Configurar cookies</button></p>
      <p>También puedes borrar el almacenamiento desde la configuración de tu navegador.</p>
    </LegalPage>
  );
}

export function Condiciones() {
  return (
    <LegalPage title="Condiciones de contratación" path="/condiciones-de-contratacion" description="Condiciones aplicables a la contratación de servicios digitales de Web Pulsar, incluidos los pagos online.">
      <h2>1. Prestador</h2>
      <Owner />
      <h2>2. Servicios</h2>
      <p>Web Pulsar presta servicios digitales: desarrollo de software y CRM a medida, diseño y desarrollo de páginas web, mantenimiento, asistentes de voz con inteligencia artificial y automatización de procesos.</p>
      <h2>3. Proyectos a medida</h2>
      <p>Los proyectos a medida se rigen por el presupuesto y la propuesta aceptados por el cliente, donde se detallan alcance, plazos, entregables y forma de pago.</p>
      <h2>4. Contratación y pago online</h2>
      <p>Algunos servicios con tarifa cerrada o recurrente pueden contratarse online. El precio, la periodicidad y las características se muestran antes de pagar. El pago se procesa mediante Stripe; Web Pulsar no recibe ni almacena los datos de tu tarjeta. La contratación se considera completada cuando el pago queda confirmado.</p>
      <h2>5. Suscripciones y cancelación</h2>
      <p><Field value={null} label="condiciones de renovación, cancelación y permanencia de los servicios recurrentes" /></p>
      <h2>6. Desistimiento y reembolsos</h2>
      <p><Field value={null} label="política de desistimiento (14 días para consumidores, excepciones de servicios digitales ya iniciados) y reembolsos" /></p>
      <h2>7. Precios e impuestos</h2>
      <p><Field value={null} label="indicar si los precios incluyen IVA" /></p>
      <h2>8. Responsabilidad y garantías</h2>
      <p><Field value={null} label="garantías, soporte y limitación de responsabilidad" /></p>
      <h2>9. Datos personales</h2>
      <p>El tratamiento de tus datos se explica en la <Link to="/privacidad" className="text-brand hover:underline">política de privacidad</Link>.</p>
      <h2>10. Legislación y resolución de conflictos</h2>
      <p>Legislación española. <Field value={null} label="jurisdicción y referencia a la plataforma de resolución de litigios en línea, si aplica" /></p>
    </LegalPage>
  );
}
