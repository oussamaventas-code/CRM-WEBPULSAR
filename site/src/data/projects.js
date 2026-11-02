// Portfolio: solo proyectos reales. Para añadir capturas o el vídeo, rellena los campos y la web los mostrará.
// Las imágenes van en /public/img/portfolio (WebP, máx. ~1200 px de ancho).

export const projects = [
  {
    id: 'nonno',
    number: '01',
    name: 'La Pizza de Nonno',
    shortName: 'Nonno',
    category: 'Hostelería · Pizzería',
    location: 'Sangonera la Verde y Santo Ángel · Murcia',
    intro: 'Una pizzería tiene su propia personalidad, sus clientes y su manera de trabajar. Nonno es uno de los negocios con los que colaboramos.',
    // Trabajo realizado (sistema en producción para el negocio)
    work: [
      'Web de pedidos con carta, carrito, recogida o entrega y seguimiento del pedido',
      'Panel del local para mostrador, teléfono, cobro, cierre de caja, carta y stock',
      'Portal del repartidor y pantalla de pedidos para la TV del local',
      'Impresión automática de comandas y tickets',
    ],
    accent: '#E5484D',
    images: [
      { src: '/img/portfolio/nonno-local.webp', alt: 'Fachada de La Pizza de Nonno de noche, con su rótulo de neón', width: 384, height: 510 },
      { src: '/img/portfolio/nonno-pizza.webp', alt: 'Pizza de la carta de La Pizza de Nonno', width: 800, height: 800 },
    ],
    screenshots: [], // { src, alt, width, height } — capturas del proyecto digital cuando estén disponibles
    video: {
      src: null, // '/video/nonno.mp4' (H.264, sin sonido automático)
      poster: '/img/portfolio/nonno-local.webp',
      captions: null, // '/video/nonno.es.vtt'
      title: 'Web Pulsar × Nonno',
      comingSoon: 'Próximamente · Proyecto audiovisual',
    },
  },
  {
    id: 'kasino',
    number: '02',
    name: 'La Roll de Kasino',
    shortName: 'Kasino Rolls',
    category: 'Hostelería · Kebab',
    location: 'Puente Tocinos y Alhama de Murcia · Murcia',
    intro: 'Cada negocio gastronómico tiene sus propios procesos y necesidades. Kasino Rolls forma parte de nuestros proyectos reales.',
    work: [
      'Web de pedidos con carta, recogida o entrega y seguimiento del pedido',
      'Panel del local con pedidos del día, cobro, carta, agotados y reparto',
      'Portal del repartidor y pantalla de pedidos para el local',
      'Impresión automática de comandas y tickets',
    ],
    accent: '#F59E0B',
    images: [
      { src: '/img/portfolio/kasino-roll.webp', alt: 'Roll de la carta de La Roll de Kasino', width: 400, height: 320 },
      { src: '/img/portfolio/kasino-tremendo.webp', alt: 'Otro producto de la carta de La Roll de Kasino', width: 400, height: 320 },
    ],
    screenshots: [],
    video: null,
  },
];
