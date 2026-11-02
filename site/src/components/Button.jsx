import { useRef } from 'react';
import { Link } from 'react-router-dom';

// Nombres completos para que Tailwind los detecte al compilar.
const VARIANTS = { primary: 'btn-primary', secondary: 'btn-secondary', light: 'btn-light' };

const canHover = () => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Botón con hover magnético sutil (máx. 4px), escala 1.03 y capa deslizante (CSS .btn).
 * `to` → enlace interno (admite "/#seccion"), `href` → enlace externo, si no → <button>.
 */
export default function Button({ variant = 'primary', size, to, href, className = '', children, ...props }) {
  const ref = useRef(null);
  const cls = `btn ${VARIANTS[variant]} ${size === 'sm' ? 'btn-sm' : ''} ${className}`;

  const onPointerMove = (e) => {
    if (!canHover() || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    ref.current.style.setProperty('--mx', `${((e.clientX - r.left) / r.width - 0.5) * 8}px`);
    ref.current.style.setProperty('--my', `${((e.clientY - r.top) / r.height - 0.5) * 6}px`);
  };
  const onPointerLeave = () => {
    ref.current?.style.setProperty('--mx', '0px');
    ref.current?.style.setProperty('--my', '0px');
  };
  const shared = { ref, className: cls, onPointerMove, onPointerLeave, ...props };

  if (to) return <Link to={to} {...shared}>{children}</Link>;
  if (href) return <a href={href} {...shared}>{children}</a>;
  return <button type="button" {...shared}>{children}</button>;
}
