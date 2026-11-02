import { Link } from 'react-router-dom';
import Logo from './Logo.jsx';
import { contact } from '../data/content.js';
import { openCookieSettings } from '../hooks/useConsent.js';

const columns = [
  {
    title: 'Soluciones',
    links: [
      { label: 'CRM personalizados', to: '/#crm' },
      { label: 'Páginas web', to: '/#web' },
      { label: 'Asistentes de voz', to: '/#voz' },
      { label: 'Automatización', to: '/#integraciones' },
    ],
  },
  {
    title: 'Empresa',
    links: [
      { label: 'Inicio', to: '/#inicio' },
      { label: 'Proyectos', to: '/#proyectos' },
      { label: 'Cómo trabajamos', to: '/#proceso' },
      { label: 'Contacto', to: '/#contacto' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Aviso legal', to: '/aviso-legal' },
      { label: 'Política de privacidad', to: '/privacidad' },
      { label: 'Política de cookies', to: '/cookies' },
      { label: 'Condiciones de contratación', to: '/condiciones-de-contratacion' },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="noise relative overflow-hidden bg-brand-deep text-white">
      <div aria-hidden="true" className="pointer-events-none absolute -right-40 -top-40 h-[480px] w-[480px] rounded-full bg-brand/40 blur-[90px]" />
      <div className="section relative grid gap-12 py-16 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo light />
          <p className="mt-4 max-w-xs text-[15px] text-white/70">Tecnología pensada para negocios reales.</p>
          {(contact.email || contact.phone) && (
            <ul className="mt-6 space-y-1.5 text-[14px] text-white/80">
              {contact.email && <li><a className="hover:text-white" href={`mailto:${contact.email}`}>{contact.email}</a></li>}
              {contact.phone && <li><a className="hover:text-white" href={`tel:${contact.phone.replace(/\s/g, '')}`}>{contact.phone}</a></li>}
            </ul>
          )}
          {contact.socials.length > 0 && (
            <ul className="mt-4 flex gap-3 text-[13px]">
              {contact.socials.map((s) => (
                <li key={s.href}><a className="text-white/70 hover:text-white" href={s.href} target="_blank" rel="noopener noreferrer">{s.label}</a></li>
              ))}
            </ul>
          )}
        </div>
        {columns.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/50">{col.title}</h2>
            <ul className="mt-4 space-y-2.5 text-[14px]">
              {col.links.map((l) => (
                <li key={l.to}><Link className="text-white/80 transition-colors hover:text-white" to={l.to}>{l.label}</Link></li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="section relative flex flex-col gap-3 border-t border-white/10 py-6 text-[12.5px] text-white/55 sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} Web Pulsar · webpulsar.es</p>
        <button type="button" onClick={openCookieSettings} className="self-start rounded text-white/70 underline-offset-4 hover:text-white hover:underline sm:self-auto">
          Configurar cookies
        </button>
      </div>
    </footer>
  );
}
