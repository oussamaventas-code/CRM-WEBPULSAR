import { useEffect } from 'react';
import { config } from '../config.js';

function setMeta(selector, attr, value) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement(selector.startsWith('link') ? 'link' : 'meta');
    const [, key, name] = selector.match(/\[(\w+(?::\w+)?)="([^"]+)"\]/) ?? [];
    if (key) el.setAttribute(key, name);
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

/** Título, descripción, canonical, Open Graph y BreadcrumbList por ruta. */
export function useSeo({ title, description, path = '/', noindex = false, breadcrumb }) {
  useEffect(() => {
    const url = `${config.siteUrl}${path}`;
    document.title = title;
    setMeta('meta[name="description"]', 'content', description);
    setMeta('link[rel="canonical"]', 'href', url);
    setMeta('meta[property="og:url"]', 'content', url);
    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', description);
    setMeta('meta[name="twitter:title"]', 'content', title);
    setMeta('meta[name="twitter:description"]', 'content', description);
    setMeta('meta[name="robots"]', 'content', noindex ? 'noindex, follow' : 'index, follow');

    let script;
    if (breadcrumb) {
      script = document.createElement('script');
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [{ name: 'Inicio', path: '/' }, { name: breadcrumb, path }].map((item, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: item.name,
          item: `${config.siteUrl}${item.path}`,
        })),
      });
      document.head.appendChild(script);
    }
    return () => script?.remove();
  }, [title, description, path, noindex, breadcrumb]);
}
