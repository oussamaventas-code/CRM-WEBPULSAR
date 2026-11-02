// Textos y datos editables de la web en un solo sitio.

export const SERVICE_OPTIONS = [
  'CRM personalizado',
  'Página web profesional',
  'Asistente de voz con IA',
  'Automatización de procesos',
  'Otra solución a medida',
  'Todavía no lo tengo claro',
];

// Planes y precios. Editar aquí: la sección los pinta tal cual (price = texto mostrado, from = "Desde").
// Las descripciones son generales a propósito: concreta qué incluye cada plan antes de publicar.
export const plans = [
  {
    id: 'basico',
    name: 'Básico',
    price: '100 – 200 €',
    from: false,
    note: '100, 150 o 200 € según el alcance',
    text: 'Para empezar con una necesidad concreta y acotada.',
    features: ['Ideal para autónomos y negocios pequeños', 'Alcance cerrado y claro desde el principio', 'Hablamos contigo para ajustar el precio exacto'],
    service: 'Todavía no lo tengo claro',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '700 €',
    from: false,
    note: null,
    text: 'Una solución con más alcance, pensada para tu forma de trabajar.',
    features: ['Adaptada a los procesos de tu negocio', 'Más funcionalidades y personalización', 'Acompañamiento durante el desarrollo'],
    service: 'Otra solución a medida',
    featured: true,
  },
  {
    id: 'ultra',
    name: 'Ultra',
    price: '1.200 €',
    from: true,
    note: 'El precio final depende del proyecto',
    text: 'Proyectos completos y a medida, con todas las piezas conectadas.',
    features: ['CRM, web, voz y automatización integrados', 'Desarrollo totalmente a medida', 'Presupuesto cerrado tras conocer tu caso'],
    service: 'CRM personalizado',
  },
];

export const process = [
  { n: '01', title: 'Escuchamos', text: 'Conocemos tu negocio, sus necesidades y los problemas que quieres resolver.' },
  { n: '02', title: 'Diseñamos', text: 'Definimos una solución adaptada a tus objetivos y a tu forma de trabajar.' },
  { n: '03', title: 'Desarrollamos', text: 'Construimos, probamos y ajustamos cada detalle.' },
  { n: '04', title: 'Evolucionamos', text: 'Te acompañamos para mejorar y ampliar la solución cuando tu negocio lo necesite.' },
];

export const faq = [
  {
    q: '¿Trabajáis con cualquier tipo de negocio?',
    a: 'Trabajamos con autónomos, restaurantes, pequeños negocios, pymes y empresas más grandes. Lo que de verdad importa es entender cómo funciona tu negocio; a partir de ahí vemos juntos si podemos ayudarte y te lo decimos con sinceridad si no somos la mejor opción.',
  },
  {
    q: '¿Desarrolláis CRM desde cero?',
    a: 'Sí. Diseñamos el CRM alrededor de tus procesos: qué datos guardas, cómo haces el seguimiento de tus clientes y qué tareas se repiten. No partimos de una plantilla genérica a la que tengas que adaptarte.',
  },
  {
    q: '¿Podéis integrar un CRM con una página web?',
    a: 'Sí. Por ejemplo, los formularios de tu web pueden llegar directamente a tu CRM como nuevos contactos, sin copiar nada a mano. Es justo lo que hace esta web con el nuestro.',
  },
  {
    q: '¿Cómo funciona un asistente de voz con IA?',
    a: 'Es un sistema que atiende llamadas y mantiene una conversación natural: responde preguntas frecuentes, recoge datos o deriva la llamada cuando hace falta una persona. Lo configuramos con la información de tu negocio y decidimos contigo qué puede hacer y qué no.',
  },
  {
    q: '¿Cuánto cuesta desarrollar una solución a medida?',
    a: 'Depende de lo que necesites. Tenemos planes desde 100 €, con el Pro en 700 € y los proyectos Ultra desde 1.200 €, pero preferimos no fijar la cifra final sin conocer tu caso. Tras una primera conversación te preparamos un presupuesto cerrado y detallado, sin compromiso.',
  },
  {
    q: '¿Podéis mejorar o ampliar sistemas existentes?',
    a: 'En muchos casos, sí. Primero revisamos lo que ya tienes para ver qué se puede aprovechar, y te explicamos con claridad si conviene ampliarlo, conectarlo con otras herramientas o rehacer alguna parte. Los plazos los acordamos después de analizarlo.',
  },
];

// Demostración del asistente de voz. Mientras src sea null se muestra el estado "en preparación".
export const voiceDemo = {
  src: null, // '/audio/demo-asistente.mp3'
  type: 'audio', // 'audio' | 'video'
  poster: null, // para vídeo
  title: 'Asistente de voz · Demostración',
  description: 'Una llamada real atendida por un asistente configurado para un negocio de hostelería.',
  transcript: null, // [{ speaker: 'Asistente' | 'Cliente', text: '…' }]
};

// Modalidades de contratación. Los precios NO van aquí: llegan del CRM (GET /api/public/services).
export const hiringModes = [
  {
    id: 'custom',
    title: 'Servicio personalizado',
    text: 'CRM a medida, desarrollos especiales y soluciones empresariales.',
    service: 'CRM personalizado',
    category: null,
  },
  {
    id: 'web',
    title: 'Servicios web',
    text: 'Páginas web profesionales y mantenimiento.',
    service: 'Página web profesional',
    category: 'web',
  },
  {
    id: 'voice',
    title: 'Automatización y asistentes de voz',
    text: 'Soluciones de voz e inteligencia artificial.',
    service: 'Asistente de voz con IA',
    category: 'voice',
  },
];

// Datos legales: RELLENAR antes de publicar. Mientras haya un valor null, la página legal lo marca como pendiente.
export const legalEntity = {
  owner: null, // Nombre y apellidos o razón social
  taxId: null, // NIF / CIF
  address: null, // Domicilio fiscal
  registry: null, // Datos registrales (si es sociedad)
  email: null, // Email de contacto legal
  phone: null,
  domain: 'webpulsar.es',
  updatedAt: null, // 'AAAA-MM-DD' de la última revisión legal
};

// Contacto y redes: solo se muestran si tienen valor real.
export const contact = {
  email: null,
  phone: null,
  socials: [], // { label: 'Instagram', href: 'https://…' }
};
