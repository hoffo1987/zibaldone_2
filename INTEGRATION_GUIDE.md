# 🎨 GUIDA INTEGRAZIONE COMPONENTI AWWWARDS

Tutti i componenti sono **già attivi globalmente** (cursore, particelle, smooth scroll).
Questa guida spiega come aggiungere gli effetti rimanenti nell'App.tsx.

---

## ✅ **GIÀ ATTIVI (nessuna modifica necessaria)**

1. **Custom Cursor magnetico** → funziona su tutti i button e link
2. **Particle Trail** → muovi velocemente il mouse per vedere le particelle
3. **Smooth Scroll** → scroll fluido su tutta l'app

---

## 📦 **COMPONENTI DISPONIBILI PER INTEGRAZIONE**

### 1️⃣ **Hero 3D Background** (WebGL + Particelle)

Avvolgi il pannello hero esistente con `HeroBackground`:

```tsx
// In App.tsx, importa il componente:
import { HeroBackground } from './EnhancedApp';

// Trova questa riga (circa linea 2359):
<div className="pn brandpanel hero p-8 md:p-12" onPointerMove={heroMove} onPointerLeave={heroLeave}>

// Avvolgila così:
<HeroBackground enabled={true}>
  <div className="pn brandpanel hero p-8 md:p-12" onPointerMove={heroMove} onPointerLeave={heroLeave}>
    {/* ... contenuto hero esistente ... */}
  </div>
</HeroBackground>
```

**Risultato:** Sfondo 3D con particelle interattive e sfera liquid glass dietro al testo.

---

### 2️⃣ **Enhanced Cards** (Physics + Drag & Throw)

Avvolgi le card delle statistiche con `EnhancedCard`:

```tsx
// In App.tsx, importa il componente:
import { EnhancedCard } from './EnhancedApp';

// Trova questa riga (circa linea 2370):
{stats.map((x, i) => <Reveal key={x.l} delay={i * 70} className="h-full">
  <button type="button" onClick={x.a} className="pn card stat p-5 h-full w-full">
    {/* ... contenuto card ... */}
  </button>
</Reveal>)}

// Cambia in:
{stats.map((x, i) => <Reveal key={x.l} delay={i * 70} className="h-full">
  <EnhancedCard
    enabled={true}
    index={i}
    onClick={x.a}
    className="pn card stat p-5 h-full w-full"
  >
    <ArrowUpRight size={18} className="go" aria-hidden="true" />
    <x.i size={18} className="mu" />
    <div className="hd text-4xl font-bold mt-3">{x.v}</div>
    <div className="mu text-sm">{x.l}</div>
  </EnhancedCard>
</Reveal>)}
```

**Risultato:** Le card si possono trascinare, lanciare e si respingono magneticamente tra loro.

---

### 3️⃣ **Page Transitions** (Transizioni Cinematiche)

Avvolgi ogni vista principale con `PageTransitionWrapper`:

```tsx
// In App.tsx, importa il componente:
import { PageTransitionWrapper } from './EnhancedApp';

// Trova le diverse viste (homeView, profilePage, etc.) e avvolgile:

// ESEMPIO con homeView (circa linea 2357):
const homeView = (
  <PageTransitionWrapper pageKey="home" transitionType="fade">
    <div className="space-y-8">
      {/* ... contenuto esistente ... */}
    </div>
  </PageTransitionWrapper>
);

// ESEMPIO con profilePage (circa linea 2332):
const profilePage = (
  <PageTransitionWrapper pageKey="profile" transitionType="scale">
    <div className="max-w-2xl mx-auto space-y-5">
      {/* ... contenuto esistente ... */}
    </div>
  </PageTransitionWrapper>
);

// Ripeti per ogni vista: write, my_pages, read, podio, authors
```

**Tipi di transizione disponibili:**
- `fade` → dissolvenza (consigliato per home)
- `slide` → scorrimento laterale (consigliato per navigazione)
- `scale` → zoom (consigliato per profilo)
- `blur` → sfocatura (consigliato per modali)

---

### 4️⃣ **Scroll Animations** (Parallax & Reveal)

Aggiungi animazioni scroll dove vuoi:

```tsx
// Importa i componenti:
import { ScrollSection, ParallaxLayer } from './EnhancedApp';

// ESEMPIO: animazione fade-in al scroll
<ScrollSection animationType="fade">
  <div>Questo contenuto appare gradualmente</div>
</ScrollSection>

// ESEMPIO: parallax su immagini/sezioni
<ParallaxLayer speed={0.5} direction="vertical">
  <div>Questo si muove più lentamente dello scroll</div>
</ParallaxLayer>

// ESEMPIO combinato:
<ScrollSection animationType="slide">
  <ParallaxLayer speed={0.3}>
    <div className="grid md:grid-cols-2 gap-8">
      {/* contenuto con parallax e slide */}
    </div>
  </ParallaxLayer>
</ScrollSection>
```

**Tipi di animazione disponibili:**
- `fade` → dissolvenza in entrata
- `slide` → scorrimento da sinistra
- `scale` → zoom in
- `rotate` → rotazione 3D
- `parallax` → movimento verticale
- `reveal` → reveal da destra a sinistra

---

## 🚀 **INTEGRAZIONE RAPIDA (1 MINUTO)**

Vuoi vedere tutto subito? Aggiungi solo queste 3 righe:

```tsx
// In cima ad App.tsx:
import { HeroBackground, EnhancedCard, PageTransitionWrapper } from './EnhancedApp';

// Nella homeView (linea ~2359), avvolgi il pannello hero:
<HeroBackground enabled={true}>
  <div className="pn brandpanel hero p-8 md:p-12" onPointerMove={heroMove} onPointerLeave={heroLeave}>
    {/* ... tutto il contenuto hero ... */}
  </div>
</HeroBackground>

// Nelle card statistiche (linea ~2370), sostituisci button con EnhancedCard:
{stats.map((x, i) => (
  <Reveal key={x.l} delay={i * 70} className="h-full">
    <EnhancedCard enabled={true} index={i} onClick={x.a} className="pn card stat p-5 h-full w-full">
      {/* contenuto card */}
    </EnhancedCard>
  </Reveal>
))}
```

---

## 🎛️ **OPZIONI DI CONFIGURAZIONE**

### HeroBackground
```tsx
<HeroBackground
  enabled={true}          // attiva/disattiva (rispetta prefers-reduced-motion)
>
```

### EnhancedCard
```tsx
<EnhancedCard
  enabled={true}          // attiva/disattiva fisica
  index={0}               // indice per stagger animation
  onClick={() => {}}      // callback al click/tap
  className=""            // classi CSS
>
```

### PageTransitionWrapper
```tsx
<PageTransitionWrapper
  pageKey="home"          // chiave univoca pagina
  transitionType="fade"   // fade | slide | scale | blur
>
```

### ScrollSection
```tsx
<ScrollSection
  animationType="fade"    // fade | slide | scale | rotate | parallax | reveal
  triggerStart="top 80%"  // quando inizia animazione
  triggerEnd="bottom 20%" // quando finisce animazione
  scrub={1}               // smooth scrubbing (true/false/numero)
>
```

---

## 🐛 **TROUBLESHOOTING**

**Non vedo gli effetti?**
- Controlla che `prefers-reduced-motion` non sia attivo nel browser
- Apri DevTools Console per vedere eventuali errori
- Verifica che i componenti siano importati correttamente

**Performance scarse?**
- Riduci `count` in ParticleField (da 1500 a 800)
- Disabilita HeroBackground su mobile
- Usa `transitionType="fade"` invece di "scale" o "blur"

**WebGL non funziona?**
- Il browser potrebbe non supportare WebGL 2.0
- HeroBackground ha fallback automatico (mostra solo il contenuto)

---

## 📚 **ESEMPI COMPLETI**

Vedi `src/components/AwwwardsDemo.tsx` per un esempio completo di integrazione di tutti i 5 sistemi insieme.

---

**Hai bisogno di aiuto?** Chiedi pure e integro direttamente io! 🚀
