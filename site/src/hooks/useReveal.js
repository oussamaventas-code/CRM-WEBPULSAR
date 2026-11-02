import { useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Ejecuta animaciones GSAP dentro de gsap.context() ligado a `scope` y las revierte al desmontar.
 * Si el usuario prefiere menos movimiento, no se anima nada: el contenido queda visible tal cual.
 */
export function useGsap(scope, setup, deps = []) {
  useEffect(() => {
    if (!scope.current || prefersReducedMotion()) return undefined;
    const ctx = gsap.context(() => setup(gsap, ScrollTrigger), scope);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Entrada estándar al hacer scroll: fade-up de los elementos [data-reveal] con stagger. */
export function useReveal(scope, { stagger = 0.08, y = 28 } = {}) {
  useGsap(scope, (g) => {
    const items = g.utils.toArray('[data-reveal]');
    if (!items.length) return;
    g.from(items, {
      y,
      opacity: 0,
      duration: 0.9,
      ease: 'power3.out',
      stagger,
      scrollTrigger: { trigger: scope.current, start: 'top 78%', once: true },
    });
  });
}

export { gsap, ScrollTrigger };
