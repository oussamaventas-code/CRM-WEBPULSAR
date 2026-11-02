import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import Logo from './Logo.jsx';
import Button from './Button.jsx';

export const NAV_LINKS = [
  { label: 'Inicio', to: '/#inicio' },
  { label: 'Soluciones', to: '/#soluciones' },
  { label: 'Proyectos', to: '/#proyectos' },
  { label: 'Cómo trabajamos', to: '/#proceso' },
  { label: 'Precios', to: '/#precios' },
  { label: 'Contacto', to: '/#contacto' },
];

/** Isla flotante: transparente sobre el hero, panel glass al salir de él. */
export default function Navbar() {
  const { pathname } = useLocation();
  const [solid, setSolid] = useState(pathname !== '/');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (pathname !== '/') return setSolid(true);
    const onScroll = () => setSolid(window.scrollY > window.innerHeight * 0.6);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [pathname]);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const island = solid || open;

  return (
    <header className="fixed inset-x-0 top-3 z-50 px-3 sm:top-4">
      <a href="#contenido" className="sr-only-focusable btn btn-primary btn-sm absolute left-4 top-0">Saltar al contenido</a>
      <nav
        aria-label="Principal"
        className={`relative mx-auto max-w-[1080px] rounded-[22px] transition-all duration-500 ${
          island ? 'glass-strong shadow-float' : 'border border-transparent'
        }`}
        style={{ transitionTimingFunction: 'var(--ease)' }}
      >
        <div className="flex items-center justify-between gap-4 py-2 pl-4 pr-2">
          <Link to="/#inicio" aria-label="Web Pulsar, ir al inicio" className="rounded-lg">
            <Logo />
          </Link>
          <ul className="hidden items-center gap-1 lg:flex">
            {NAV_LINKS.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="rounded-full px-3.5 py-2 text-[13.5px] text-ink/80 transition-colors hover:bg-white/60 hover:text-ink">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <Button to="/#contacto" size="sm" className="hidden sm:inline-flex">Hablemos de tu proyecto</Button>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] text-ink hover:bg-white/60 lg:hidden"
              aria-expanded={open}
              aria-controls="menu-movil"
              aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        <div id="menu-movil" hidden={!open} className="border-t border-white/60 px-3 pb-3 pt-2 lg:hidden">
          <ul className="grid gap-1">
            {NAV_LINKS.map((l) => (
              <li key={l.to}>
                <Link to={l.to} onClick={() => setOpen(false)} className="block rounded-[12px] px-3 py-3 text-[15px] text-ink hover:bg-white/70">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <Button to="/#contacto" className="mt-2 w-full" onClick={() => setOpen(false)}>Hablemos de tu proyecto</Button>
        </div>
      </nav>
    </header>
  );
}
