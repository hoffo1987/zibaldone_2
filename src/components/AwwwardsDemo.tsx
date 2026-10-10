import React from 'react';
import { Hero3D } from './Hero3D';
import { SmoothScrollProvider } from './SmoothScrollProvider';
import { ScrollSection, ParallaxLayer, ScrollTextReveal, PinSection } from './ScrollAnimations';
import { ParticleTrail } from './ParticleTrail';
import { PhysicsCard } from './PhysicsCard';
import { PageTransitionProvider, Page, TransitionLink } from './PageTransitions';
import { CustomCursor } from './CustomCursor';
import { motion } from 'framer-motion';

/**
 * 🚀 ESEMPIO COMPLETO DI INTEGRAZIONE
 *
 * Questo componente dimostra come usare tutti e 5 i sistemi avanzati:
 * 1. Hero 3D con WebGL + Shaders
 * 2. Smooth Scroll + GSAP Animations
 * 3. Editor con Physics (Particle Trail + Magnetic Cursor)
 * 4. Physics Cards con repulsione magnetica
 * 5. Page Transitions cinematiche
 */

export const AwwwardsDemo: React.FC = () => {
  return (
    <PageTransitionProvider initialPage="home">
      <SmoothScrollProvider speed={1} smoothWheel={true}>
        {/* Custom Cursor Magnetico */}
        <CustomCursor enabled={true} magneticElements="[data-magnetic]" />

        {/* Particle Trail durante il movimento */}
        <ParticleTrail
          enabled={true}
          maxParticles={60}
          particleLife={1200}
          colors={['#17C3AE', '#FBBF24', '#6366F1']}
        />

        {/* Pagina HOME */}
        <Page id="home" transitionType="morph">
          <div className="relative">
            {/* ===== COMPONENTE 1: HERO 3D ===== */}
            <Hero3D>
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 1 }}
                className="max-w-4xl"
              >
                <h1 className="text-6xl md:text-8xl font-bold text-white mb-6 tracking-tight">
                  Il Circuito
                </h1>
                <p className="text-xl md:text-2xl text-white/80 mb-8">
                  Archivio di scrittura immersivo con tecnologie pionieristiche
                </p>

                {/* Pulsanti magnetici */}
                <div className="flex gap-4 justify-center">
                  <TransitionLink to="archive" className="no-underline">
                    <motion.button
                      data-magnetic
                      className="px-8 py-4 bg-[#17C3AE] text-white rounded-full font-semibold text-lg hover:shadow-2xl transition-shadow"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      Esplora l'Archivio
                    </motion.button>
                  </TransitionLink>

                  <TransitionLink to="editor" className="no-underline">
                    <motion.button
                      data-magnetic
                      className="px-8 py-4 bg-white/10 backdrop-blur-sm text-white rounded-full font-semibold text-lg border-2 border-white/30 hover:bg-white/20 transition-colors"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      Inizia a Scrivere
                    </motion.button>
                  </TransitionLink>
                </div>
              </motion.div>
            </Hero3D>

            {/* ===== COMPONENTE 2: SCROLL STORYTELLING ===== */}
            <div className="relative bg-[#EDF2F1] py-32">
              {/* Sezione con Parallax */}
              <ScrollSection animationType="fade" className="container mx-auto px-6 mb-32">
                <div className="grid md:grid-cols-2 gap-16 items-center">
                  <ParallaxLayer speed={0.3}>
                    <div className="aspect-square bg-gradient-to-br from-[#17C3AE] to-[#0A4F49] rounded-3xl shadow-2xl" />
                  </ParallaxLayer>

                  <div>
                    <ScrollTextReveal
                      text="Scrivi con la potenza della fisica"
                      className="text-5xl font-bold mb-6 text-[#0E1F1D]"
                      stagger={0.03}
                    />
                    <p className="text-xl text-[#5B706D] leading-relaxed">
                      Ogni interazione è guidata da spring physics avanzate.
                      Il cursore magnetico, le particelle fluide e le animazioni
                      naturali creano un'esperienza sensoriale unica.
                    </p>
                  </div>
                </div>
              </ScrollSection>

              {/* Sezione pinned (resta fissa mentre scorri) */}
              <PinSection pinSpacing={true} className="h-screen flex items-center justify-center bg-white/50 backdrop-blur-lg">
                <ScrollSection animationType="scale">
                  <h2 className="text-6xl font-bold text-center text-[#0E1F1D] max-w-4xl mx-auto">
                    Tecnologia che si sente
                  </h2>
                  <p className="text-2xl text-center text-[#5B706D] mt-6 max-w-2xl mx-auto">
                    WebGL shaders, GSAP ScrollTrigger, Framer Motion spring physics
                  </p>
                </ScrollSection>
              </PinSection>

              {/* ===== COMPONENTE 4: PHYSICS CARDS ===== */}
              <ScrollSection animationType="fade" className="container mx-auto px-6 py-32">
                <h2 className="text-5xl font-bold text-center mb-16 text-[#0E1F1D]">
                  Archivio Fluidodinamico
                </h2>

                <div className="grid md:grid-cols-3 gap-8">
                  {[
                    { title: 'Racconto 1', excerpt: 'Un viaggio attraverso memorie digitali...' },
                    { title: 'Poesia Moderna', excerpt: 'Versi che danzano nello spazio...' },
                    { title: 'Saggio Tecnico', excerpt: 'Analisi delle reti neurali...' },
                  ].map((item, index) => (
                    <PhysicsCard
                      key={index}
                      index={index}
                      className="bg-white p-8 rounded-3xl shadow-lg border border-[#DCE6E4]"
                      onTap={() => console.log(`Opened: ${item.title}`)}
                    >
                      <h3 className="text-2xl font-bold mb-4 text-[#0E1F1D]">{item.title}</h3>
                      <p className="text-[#5B706D]">{item.excerpt}</p>
                      <div className="mt-6 flex justify-between items-center">
                        <span className="text-sm text-[#0F8B7A]">Trascina per esplorare</span>
                        <motion.div
                          className="w-8 h-8 rounded-full bg-[#17C3AE]"
                          whileHover={{ scale: 1.2, rotate: 90 }}
                        />
                      </div>
                    </PhysicsCard>
                  ))}
                </div>

                <p className="text-center text-[#5B706D] mt-12 italic">
                  👆 Trascina le card - si respingono magneticamente tra loro
                </p>
              </ScrollSection>
            </div>
          </div>
        </Page>

        {/* ===== PAGINA ARCHIVIO ===== */}
        <Page id="archive" transitionType="slide">
          <div className="min-h-screen bg-[#EDF2F1] py-32 px-6">
            <div className="container mx-auto">
              <motion.h1
                className="text-6xl font-bold mb-12 text-[#0E1F1D]"
                initial={{ opacity: 0, x: -50 }}
                animate={{ opacity: 1, x: 0 }}
              >
                Archivio Completo
              </motion.h1>

              <TransitionLink to="home" className="inline-block mb-8">
                <button
                  data-magnetic
                  className="px-6 py-3 bg-[#17C3AE] text-white rounded-full font-semibold hover:shadow-lg transition-shadow"
                >
                  ← Torna alla Home
                </button>
              </TransitionLink>

              {/* Grid di Physics Cards */}
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 9 }).map((_, i) => (
                  <PhysicsCard key={i} index={i} className="bg-white p-6 rounded-2xl shadow-md">
                    <div className="h-40 bg-gradient-to-br from-[#17C3AE]/20 to-[#FBBF24]/20 rounded-xl mb-4" />
                    <h3 className="text-xl font-bold text-[#0E1F1D]">Documento {i + 1}</h3>
                    <p className="text-[#5B706D] text-sm mt-2">
                      Un esempio di contenuto dinamico con fisica realistica
                    </p>
                  </PhysicsCard>
                ))}
              </div>
            </div>
          </div>
        </Page>

        {/* ===== PAGINA EDITOR (con Particle Trail attivo) ===== */}
        <Page id="editor" transitionType="curl">
          <div className="min-h-screen bg-white py-32 px-6">
            <div className="container mx-auto max-w-4xl">
              <motion.h1
                className="text-6xl font-bold mb-12 text-[#0E1F1D]"
                initial={{ opacity: 0, rotateX: -90 }}
                animate={{ opacity: 1, rotateX: 0 }}
                transition={{ duration: 0.6 }}
              >
                Editor Neuro-Estetico
              </motion.h1>

              <TransitionLink to="home" className="inline-block mb-8">
                <button
                  data-magnetic
                  className="px-6 py-3 bg-[#17C3AE] text-white rounded-full font-semibold"
                >
                  ← Torna alla Home
                </button>
              </TransitionLink>

              <div className="bg-[#F4F8F7] p-8 rounded-3xl border border-[#DCE6E4] min-h-[500px]">
                <p className="text-[#5B706D] mb-6">
                  ✨ Muovi il cursore velocemente per vedere le particelle
                </p>

                <motion.div
                  className="bg-white p-6 rounded-2xl min-h-[300px] cursor-text"
                  data-magnetic
                  whileHover={{ scale: 1.02 }}
                  transition={{ type: 'spring', stiffness: 300 }}
                >
                  <p className="text-[#0E1F1D] leading-relaxed">
                    Inizia a scrivere qui... Il cursore magnetico e le particelle
                    reagiscono ai tuoi movimenti, creando un'esperienza di scrittura
                    completamente immersiva.
                  </p>
                </motion.div>

                <div className="flex gap-3 mt-6">
                  {['Grassetto', 'Corsivo', 'Colore'].map((tool) => (
                    <button
                      key={tool}
                      data-magnetic
                      className="px-4 py-2 bg-[#17C3AE] text-white rounded-lg font-medium hover:shadow-lg transition-shadow"
                    >
                      {tool}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Page>
      </SmoothScrollProvider>
    </PageTransitionProvider>
  );
};
