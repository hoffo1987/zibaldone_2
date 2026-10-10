/**
 * 🚀 IL CIRCUITO - AWWWARDS TRANSFORMATION
 * Advanced React Components with WebGL, Physics & Cinematic Transitions
 *
 * =============================================================================
 * COMPONENTI DISPONIBILI:
 * =============================================================================
 *
 * 1️⃣ HERO 3D (WebGL + Shaders)
 *    - Hero3D: Hero section immersiva con R3F
 *    - ParticleField: Sistema particellare interattivo
 *    - LiquidGlassSphere: Sfera con shader GLSL custom
 *
 * 2️⃣ SMOOTH SCROLL (GSAP + Lenis)
 *    - SmoothScrollProvider: Wrapper per smooth scrolling
 *    - ScrollSection: Animazioni scroll-triggered
 *    - ParallaxLayer: Layer con parallasse
 *    - ScrollTextReveal: Reveal testuale parola per parola
 *    - PinSection: Sezione pinned durante lo scroll
 *
 * 3️⃣ EDITOR NEURO-ESTETICO
 *    - ParticleTrail: Scia di particelle al movimento
 *    - CustomCursor: Cursore magnetico personalizzato
 *    - useMagneticCursor: Hook per elementi magnetici
 *
 * 4️⃣ PHYSICS CARDS
 *    - PhysicsCard: Card con spring physics e repulsione magnetica
 *
 * 5️⃣ PAGE TRANSITIONS
 *    - PageTransitionProvider: Context per transizioni
 *    - Page: Wrapper per pagine con effetti
 *    - TransitionLink: Link con transizione cinematica
 *
 * =============================================================================
 * CUSTOM HOOKS:
 * =============================================================================
 *
 * - useMousePosition: Traccia posizione e velocità del mouse
 * - useScrollVelocity: Velocità e direzione dello scroll
 * - useReducedMotion: Rispetta preferenze accessibilità
 * - useGSAP: Hook ufficiale per GSAP con cleanup automatico
 * - useMagneticCursor: Gestisce elementi magnetici
 *
 * =============================================================================
 * ESEMPIO DI UTILIZZO:
 * =============================================================================
 *
 * import { AwwwardsDemo } from './components/AwwwardsDemo';
 *
 * function App() {
 *   return <AwwwardsDemo />;
 * }
 *
 * =============================================================================
 * PERFORMANCE & ACCESSIBILITÀ:
 * =============================================================================
 *
 * ✅ Tutti i componenti rispettano prefers-reduced-motion
 * ✅ Animazioni eseguite fuori dal ciclo React (RAF, GSAP)
 * ✅ WebGL con fallback a gradienti CSS
 * ✅ Lazy loading e Suspense boundaries
 * ✅ Tree-shakeable exports
 *
 */

// ===== COMPONENTI 3D =====
export { Hero3D } from './components/Hero3D';
export { ParticleField } from './components/ParticleField';
export { LiquidGlassSphere } from './components/LiquidGlassSphere';

// ===== SCROLL ANIMATIONS =====
export { SmoothScrollProvider } from './components/SmoothScrollProvider';
export {
  ScrollSection,
  ParallaxLayer,
  ScrollTextReveal,
  PinSection,
} from './components/ScrollAnimations';

// ===== PHYSICS & INTERACTIONS =====
export { ParticleTrail } from './components/ParticleTrail';
export { CustomCursor } from './components/CustomCursor';
export { PhysicsCard } from './components/PhysicsCard';

// ===== PAGE TRANSITIONS =====
export {
  PageTransitionProvider,
  Page,
  TransitionLink,
  usePageTransition,
} from './components/PageTransitions';

// ===== HOOKS =====
export { useMousePosition } from './hooks/useMousePosition';
export { useScrollVelocity } from './hooks/useScrollVelocity';
export { useReducedMotion } from './hooks/useReducedMotion';
export { useGSAP } from './hooks/useGSAP';
export { useMagneticCursor } from './hooks/useMagneticCursor';

// ===== DEMO COMPLETO =====
export { AwwwardsDemo } from './components/AwwwardsDemo';
