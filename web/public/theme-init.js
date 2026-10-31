// Aplica el tema antes del primer pintado para evitar el parpadeo claro -> oscuro.
// Es un archivo externo (no inline) porque la CSP del servidor solo permite scripts de 'self'.
(function () {
  try {
    var mode = localStorage.getItem('wp-theme');
    var dark = mode === 'dark' || (mode !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    }
  } catch (e) {}
})();
