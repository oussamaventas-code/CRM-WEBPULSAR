import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import Footer from './components/Footer.jsx';
import CookieConsent from './components/CookieConsent.jsx';
import Home from './pages/Home.jsx';
import { ScrollTrigger } from './hooks/useReveal.js';

const legal = () => import('./pages/Legal.jsx');
const payment = () => import('./pages/Payment.jsx');
const AvisoLegal = lazy(() => legal().then((m) => ({ default: m.AvisoLegal })));
const Privacidad = lazy(() => legal().then((m) => ({ default: m.Privacidad })));
const Cookies = lazy(() => legal().then((m) => ({ default: m.Cookies })));
const Condiciones = lazy(() => legal().then((m) => ({ default: m.Condiciones })));
const PaymentSuccess = lazy(() => payment().then((m) => ({ default: m.PaymentSuccess })));
const PaymentCancelled = lazy(() => payment().then((m) => ({ default: m.PaymentCancelled })));
const NotFound = lazy(() => payment().then((m) => ({ default: m.NotFound })));

/** Enlaces "/#seccion": hace scroll a la sección; al cambiar de página, vuelve arriba. */
function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      return undefined;
    }
    // Espera a que la página (y sus secciones) estén montadas.
    const t = setTimeout(() => {
      document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      ScrollTrigger.refresh();
    }, 60);
    return () => clearTimeout(t);
  }, [pathname, hash]);
  return null;
}

export default function App() {
  return (
    <>
      <div className="site-backdrop" aria-hidden="true" />
      <ScrollManager />
      <Navbar />
      <main id="contenido" tabIndex={-1} className="outline-none">
        <Suspense fallback={<div className="min-h-[100dvh]" />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/aviso-legal" element={<AvisoLegal />} />
            <Route path="/privacidad" element={<Privacidad />} />
            <Route path="/cookies" element={<Cookies />} />
            <Route path="/condiciones-de-contratacion" element={<Condiciones />} />
            <Route path="/pago/exito" element={<PaymentSuccess />} />
            <Route path="/pago/cancelado" element={<PaymentCancelled />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
      <Footer />
      <CookieConsent />
    </>
  );
}
