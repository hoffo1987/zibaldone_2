import React from 'react';
import App from './App';
import { SmoothScrollProvider } from './components/SmoothScrollProvider';
import { CustomCursor } from './components/CustomCursor';
import { ParticleTrail } from './components/ParticleTrail';

/**
 * Enhanced App Wrapper con tutti i componenti Awwwards
 *
 * ✅ Attivi globalmente:
 * - Custom Cursor magnetico
 * - Particle Trail reattivo
 * - Smooth Scroll fluido
 *
 * 📦 Disponibili per integrazione nell'App:
 * - HeroBackground (da components/HeroBackground)
 * - EnhancedCard (da components/EnhancedCard)
 * - PageTransitionWrapper (da components/PageTransitionWrapper)
 * - ScrollSection, ParallaxLayer (da components/ScrollAnimations)
 */
export const EnhancedApp: React.FC = () => {
  return (
    <>
      {/* Custom Cursor Magnetico - attivo su tutti gli elementi con data-magnetic */}
      <CustomCursor enabled={true} magneticElements="[data-magnetic], button, a" />

      {/* Particle Trail - scia di particelle al movimento del mouse */}
      <ParticleTrail
        enabled={true}
        maxParticles={50}
        particleLife={1000}
        colors={['#17C3AE', '#FBBF24', '#6366F1']}
      />

      {/* Smooth Scroll Provider - scroll fluido su tutta l'app */}
      <SmoothScrollProvider speed={1.2} smoothWheel={true}>
        <App />
      </SmoothScrollProvider>
    </>
  );
};

// Esporta anche i componenti per uso diretto nell'App
export { HeroBackground } from './components/HeroBackground';
export { EnhancedCard } from './components/EnhancedCard';
export { PageTransitionWrapper, usePageTransitions } from './components/PageTransitionWrapper';
export { ScrollSection, ParallaxLayer } from './components/ScrollAnimations';
