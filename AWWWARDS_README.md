# 🚀 Il Circuito - Awwwards Transformation

> Archivio di scrittura immersivo con tecnologie pionieristiche: WebGL, Physics Engine, Smooth Scroll Storytelling e Transizioni Cinematiche.

---

## ✨ Features Implementate

### 1️⃣ **Hero 3D Immersivo (React Three Fiber + GLSL Shaders)**
- **2000+ particelle** interattive che reagiscono al mouse (attract/repel)
- **Liquid Glass Sphere** con shader custom (Fresnel, iridescenza, refraction)
- **Noise procedurale 3D** (Simplex) per distorsioni organiche
- Illuminazione dinamica con 3 point lights

### 2️⃣ **Smooth Scroll Storytelling (GSAP + Lenis)**
- **Lenis smooth scroll** con easing custom
- **ScrollTrigger** per animazioni sincronizzate allo scroll
- **Parallax layers** con velocità indipendenti
- **Text reveal** parola per parola con stagger
- **Pin sections** che restano fisse durante lo scroll

### 3️⃣ **Editor Neuro-Estetico**
- **Cursore magnetico** con attrazione verso elementi interattivi
- **Particle trail** generato dalla velocità del movimento
- **Spring physics** (Framer Motion) per transizioni fluide
- Fisica realistica: gravità, air resistance, bounce

### 4️⃣ **Physics Cards (Fluidodinamica)**
- **Drag & throw** con inerzia e spring-back
- **Repulsione magnetica** tra card vicine
- **Rotazione 3D** basata sulla posizione
- Animazioni indipendenti per ogni card (stagger)

### 5️⃣ **Transizioni Cinematiche**
- **View Transitions API** con fallback a Framer Motion
- **Circular reveal** dal punto di click
- 6 tipi di transizione: fade, slide, scale, rotate, morph, curl
- **Shared element transitions** tra pagine

---

## 📦 Installazione

### 1. Installa le dipendenze

```bash
npm install
```

### 2. Avvia il dev server

```bash
npm start
```

### 3. Build per produzione

```bash
npm build
```

---

## 🎯 Come Usare i Componenti

### Esempio Base: Hero 3D

```tsx
import { Hero3D } from './components/Hero3D';

function App() {
  return (
    <Hero3D>
      <h1>Il Circuito</h1>
      <p>Archivio di scrittura immersivo</p>
    </Hero3D>
  );
}
```

### Esempio: Scroll Storytelling

```tsx
import { SmoothScrollProvider } from './components/SmoothScrollProvider';
import { ScrollSection, ParallaxLayer } from './components/ScrollAnimations';

function App() {
  return (
    <SmoothScrollProvider speed={1}>
      <ScrollSection animationType="fade">
        <ParallaxLayer speed={0.5}>
          <h2>Contenuto con parallasse</h2>
        </ParallaxLayer>
      </ScrollSection>
    </SmoothScrollProvider>
  );
}
```

### Esempio: Physics Cards

```tsx
import { PhysicsCard } from './components/PhysicsCard';

function Archive() {
  const items = [
    { title: 'Racconto 1', excerpt: '...' },
    { title: 'Poesia', excerpt: '...' },
  ];

  return (
    <div className="grid md:grid-cols-3 gap-8">
      {items.map((item, i) => (
        <PhysicsCard key={i} index={i} onTap={() => console.log(item.title)}>
          <h3>{item.title}</h3>
          <p>{item.excerpt}</p>
        </PhysicsCard>
      ))}
    </div>
  );
}
```

### Esempio: Page Transitions

```tsx
import {
  PageTransitionProvider,
  Page,
  TransitionLink,
} from './components/PageTransitions';

function App() {
  return (
    <PageTransitionProvider initialPage="home">
      <Page id="home" transitionType="morph">
        <h1>Home</h1>
        <TransitionLink to="about">
          <button>Vai a About</button>
        </TransitionLink>
      </Page>

      <Page id="about" transitionType="slide">
        <h1>About</h1>
        <TransitionLink to="home">
          <button>Torna a Home</button>
        </TransitionLink>
      </Page>
    </PageTransitionProvider>
  );
}
```

### Esempio: Custom Cursor + Particle Trail

```tsx
import { CustomCursor } from './components/CustomCursor';
import { ParticleTrail } from './components/ParticleTrail';

function App() {
  return (
    <>
      <CustomCursor enabled={true} magneticElements="[data-magnetic]" />
      <ParticleTrail enabled={true} maxParticles={60} />

      <button data-magnetic>Pulsante Magnetico</button>
    </>
  );
}
```

---

## 🔧 Custom Hooks Disponibili

### `useMousePosition`
Traccia posizione e coordinate normalizzate del mouse.

```tsx
import { useMousePosition } from './hooks/useMousePosition';

function Component() {
  const { x, y, normalizedX, normalizedY } = useMousePosition(16);
  
  return <div>Mouse: {x}, {y}</div>;
}
```

### `useScrollVelocity`
Calcola velocità e direzione dello scroll.

```tsx
import { useScrollVelocity } from './hooks/useScrollVelocity';

function Component() {
  const { velocity, direction, progress } = useScrollVelocity(0.1);
  
  return <div>Velocità: {velocity.toFixed(2)}</div>;
}
```

### `useGSAP`
Hook ufficiale GSAP con cleanup automatico.

```tsx
import { useGSAP } from './hooks/useGSAP';
import gsap from 'gsap';

function Component() {
  const containerRef = useRef(null);

  useGSAP(() => {
    gsap.to('.box', { x: 100, rotation: 360 });
  }, []);

  return <div ref={containerRef}><div className="box" /></div>;
}
```

---

## 🎨 Architettura Tecnica

### Stack Tecnologico
- **React 18** con TypeScript
- **Framer Motion 11** (spring physics, layout animations)
- **React Three Fiber 8** (WebGL)
- **Three.js 0.160** (rendering 3D)
- **GSAP 3.12** con ScrollTrigger
- **Lenis 1.0** (smooth scrolling)

### Struttura File

```
src/
├── hooks/
│   ├── useMousePosition.ts        # Tracciamento mouse
│   ├── useScrollVelocity.ts       # Velocità scroll
│   ├── useReducedMotion.ts        # Accessibilità
│   ├── useGSAP.ts                 # GSAP context
│   └── useMagneticCursor.ts       # Cursore magnetico
│
├── components/
│   ├── Hero3D.tsx                 # Hero WebGL
│   ├── ParticleField.tsx          # Sistema particellare
│   ├── LiquidGlassSphere.tsx      # Shader GLSL
│   ├── SmoothScrollProvider.tsx   # Lenis wrapper
│   ├── ScrollAnimations.tsx       # GSAP scroll
│   ├── ParticleTrail.tsx          # Scia particelle
│   ├── CustomCursor.tsx           # Cursore custom
│   ├── PhysicsCard.tsx            # Card fisica
│   ├── PageTransitions.tsx        # Transizioni pagina
│   └── AwwwardsDemo.tsx           # Demo completo
│
└── awwwards-system.ts             # Export centrale
```

---

## ⚡ Performance

### Ottimizzazioni Implementate
- ✅ **RAF (requestAnimationFrame)** per tutte le animazioni
- ✅ **useMemo** e **useCallback** per calcoli pesanti
- ✅ **GSAP ticker** invece di React re-render
- ✅ **WebGL rendering** offload alla GPU
- ✅ **Lazy particle creation** basata sulla velocità
- ✅ **Throttle** su mouse tracking (16ms default)
- ✅ **Passive event listeners**

### Target Performance
- **60 FPS** costanti durante scroll e animazioni
- **< 100ms** risposta interazioni utente
- **< 3s** First Contentful Paint

---

## ♿ Accessibilità

Tutti i componenti rispettano:
- ✅ **prefers-reduced-motion**: disabilita animazioni complesse
- ✅ **Keyboard navigation**: focus visibile e tab order
- ✅ **ARIA attributes**: label, expanded, pressed
- ✅ **Semantic HTML**: heading hierarchy, landmark
- ✅ **Color contrast**: WCAG AA compliant

---

## 🎯 Demo Completo

Per vedere tutti i componenti integrati:

```tsx
import { AwwwardsDemo } from './components/AwwwardsDemo';

function App() {
  return <AwwwardsDemo />;
}
```

Il demo include:
- Hero 3D con particelle interattive
- 3 pagine con transizioni cinematiche
- Scroll storytelling con parallasse
- Physics cards trascinabili
- Cursore magnetico + particle trail

---

## 📚 Risorse e Riferimenti

### Shader GLSL
- [The Book of Shaders](https://thebookofshaders.com/)
- [Simplex Noise](https://github.com/stegu/webgl-noise)

### React Three Fiber
- [R3F Docs](https://docs.pmnd.rs/react-three-fiber)
- [Three.js Journey](https://threejs-journey.com/)

### GSAP
- [GSAP Docs](https://greensock.com/docs/)
- [ScrollTrigger](https://greensock.com/docs/v3/Plugins/ScrollTrigger)

### Framer Motion
- [Motion Docs](https://www.framer.com/motion/)
- [Spring Physics](https://www.framer.com/motion/transition/)

---

## 🐛 Troubleshooting

### WebGL non funziona
**Soluzione**: Controlla che il browser supporti WebGL 2.0
```tsx
const gl = canvas.getContext('webgl2');
if (!gl) {
  console.error('WebGL 2.0 not supported');
}
```

### Performance scarse
**Soluzione**: Riduci il numero di particelle
```tsx
<ParticleField count={1000} /> {/* invece di 2000 */}
```

### Smooth scroll non attivo
**Soluzione**: Verifica che Lenis sia inizializzato
```tsx
// In console
window.lenis // dovrebbe esistere
```

---

## 📝 License

MIT © 2024 Il Circuito

---

## 🚀 Prossimi Step

Per estendere ulteriormente il progetto:

1. **Post-processing WebGL**: bloom, chromatic aberration
2. **Sound design**: audio reattivo alle interazioni
3. **Advanced shaders**: fluid simulation, ray marching
4. **Mobile gestures**: pinch-to-zoom, swipe transitions
5. **Real-time collaboration**: cursori multiplayer con WebRTC

---

**Costruito con ❤️ da un Lead Creative Technologist**
