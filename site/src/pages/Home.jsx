import Hero from '../sections/Hero.jsx';
import Philosophy from '../sections/Philosophy.jsx';
import Services from '../sections/Services.jsx';
import Portfolio from '../sections/Portfolio.jsx';
import VoiceSection from '../sections/VoiceSection.jsx';
import Process from '../sections/Process.jsx';
import Plans from '../sections/Plans.jsx';
import Pricing from '../sections/Pricing.jsx';
import { FaqSection, FinalCTA, ContactSection } from '../sections/Closing.jsx';
import { useSeo } from '../hooks/useSeo.js';

export default function Home() {
  useSeo({
    title: 'Web Pulsar · Desarrollo de CRM a medida, páginas web y asistentes de voz con IA',
    description: 'No hay dos negocios iguales. Desarrollamos CRM a medida, diseño web profesional, asistentes de voz con IA y automatización para autónomos, restaurantes y pymes.',
    path: '/',
  });
  return (
    <>
      <Hero />
      <Philosophy />
      <Services />
      <Portfolio />
      <VoiceSection />
      <Process />
      <Plans />
      <Pricing />
      <FaqSection />
      <FinalCTA />
      <ContactSection />
    </>
  );
}
