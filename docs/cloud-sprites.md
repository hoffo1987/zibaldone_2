# Cloud — nuovo sistema sprite

Cloud usa un atlante PNG trasparente con 36 pose (30 disegnate, di cui 12 per la corsa, e 6 intermedie generate), 64 colori e pixel interi. Il rendering bitmap è separato dallo scheletro usato dal gameplay: danni, collisioni, combo e velocità mantengono i valori precedenti. Clive e Sephiroth continuano a usare il renderer esistente.

## Sviluppo e verifica

- `npm run sprites:tweens`: rigenera i fotogrammi intermedi (richiede Python con `numpy`, `pillow`, `opencv-python-headless`); serve solo se cambiano le pose disegnate.
- `npm run sprites:cloud`: ricompila l'atlante dalle sorgenti in `src/egg/assets/source`.
- `npm run preview:egg`: apre un server locale su http://127.0.0.1:4173, con lo stesso componente del gioco, senza richiedere login o connessioni Firebase. Scegli “Galleria animazioni” per controllare ogni posa.
- `npm run typecheck:egg`: verifica TypeScript per il minigioco. Limita i tipi ambientali al componente: il TypeScript 4.4.4 della repository non interpreta alcuni dei nuovi tipi Node/Babel scaricati transitivamente da un'installazione senza lockfile.
- `CI=true npm test -- --watch=false --runInBand`: test di timing, loop, caricamento, rendering e integrazione del gameplay.
- `npm run build`: build di produzione.

## Come aggiungere o rifinire uno sprite

Le sorgenti sono i PNG trasparenti generati, così come sono. Il compilatore isola ogni personaggio usando componenti connessi: non assume che i fogli siano griglie perfette e non include frammenti degli sprite vicini. I punti e gli ancoraggi in `scripts/build-cloud-atlas.cjs` sono in pixel della sorgente. Il compilatore rifiuta sprite vuoti o tagliati ai bordi e produce `cloud.png` e `cloud-frames.ts`.

Le sorgenti sono illustrazioni morbide alte circa 350 px, ridotte di 4-5 volte (13 per la posa di danno). Prendere un solo pixel per blocco dava rumore, capelli virati all'arancio e viso illeggibile, quindi ogni posa passa per questi passaggi:

1. riduzione Lanczos con un leggero sharpen;
2. alpha netta (copertura ≥ 50%);
3. palette comune di 64 colori con k-means deterministico, senza dithering: i fogli restano coerenti fra loro e l'oro dei capelli, l'azzurro degli occhi, il rosso dell'impugnatura e il cuoio non si perdono;
4. pulizia dei pixel isolati;
5. occhi: le iridi vengono cercate nella sorgente (piccoli gruppi di pixel blu/azzurri fra pelle e capelli, al massimo 22 pixel finali sotto la cima dei capelli; quelle grigio-azzurre solo se accanto c'è il bianco dell'occhio; se l'occhio è disegnato senza iride blu, il bianco dell'occhio con la pupilla scura vicina) e ridipinte nei pixel finali con un azzurro acceso più un riflesso, altrimenti la riduzione le mescolerebbe alle ciglia e al blu del maglione;
6. contorno scuro di 1 px dove il disegno non ne ha già uno, per leggere la sagoma sullo sfondo del gioco.

Le sorgenti sono in `src/egg/assets/source/` (`cloud-locomotion.png`, `cloud-combat.png`, `cloud-hurt.png`, `cloud-run.png`).

La corsa viene da `cloud-run.png`: un ciclo di 12 pose in sequenza (passo di contatto, appoggio, passaggio, spinta, volo, allungo, ripetuti), ridotto di 3. Il foglio originale aveva la scacchiera della trasparenza disegnata nell'immagine: è stato scontornato togliendo il grigio neutro chiaro collegato ai bordi, più un ulteriore pixel grigio sul contorno. Le pose sono ancorate alla testa e alla linea di terra di ogni riga, così nei fotogrammi di volo Cloud si stacca davvero da terra. Il ciclo dura 0,48 s (25 fotogrammi al secondo): il passo disegnato corrisponde alla velocità di corsa e i piedi non scivolano.

Ogni cella finale misura 160×128, con radice/piedi in (80,110). Le pose vengono dipinte 1:1 su coordinate intere; la direzione viene specchiata sull'intero sprite, insieme a flash e scie. Le esposizioni `cels` in `cloud.ts` hanno tempi in secondi: i tre colpi mostrano il fendente esattamente all'inizio della rispettiva finestra di danno. Le pose aeree e le capriole sono fotogrammi dedicati, senza rotazione interpolata del bitmap.

La galleria avanza tra le esposizioni effettive, mantiene l'ultima posa dei clip non ciclici e nasconde il comando di interpolazione per i personaggi bitmap. In verticale sui telefoni i controlli sono separati dall'anteprima. Gli asset vengono caricati prima di avviare il motore, con gestione degli errori e pulsante Riprova.

## Fotogrammi intermedi

`scripts/tween-cloud.py` genera 12 pose intermedie dalle pose disegnate con il flusso ottico (OpenCV DIS) a piena risoluzione: due nel respiro della guardia, una fra salto e caduta e tre nei recuperi dopo i colpi (la corsa ora ha pose disegnate). Per ogni coppia le due pose vengono deformate verso l'istante intermedio; dove coincidono si fondono, altrove vale solo la più vicina, così non compaiono arti doppi o semitrasparenti. Il risultato va in `cloud-tween-<riduzione>.png` e `tweens.json`, che il compilatore aggiunge all'atlante. Per i fendenti ampi (la spada ruota di mezzo giro fra due pose) il flusso non trova corrispondenze e l'intermedio sarebbe quasi identico alla prima posa, quindi lì restano le pose disegnate con le loro scie.

## Provenienza e prompt

Creato con lo strumento integrato `image_gen`, usando il “Foglio Sprite di Cloud Strife.png” fornito dall'utente come riferimento visivo. Il primo foglio esplorativo è stato usato come riferimento per le due tavole definitive; la posa di danno è stata rifatta separatamente per mantenere la Buster Sword visibile. Nessun asset viene richiesto a un servizio generativo durante il gioco. Solo l'atlante finale è importato dal bundle; le sorgenti di lavorazione restano nella repository.

### Prima esplorazione (non inclusa nel bundle)

Use case: stylized-concept. Asset type: production pixel-art spritesheet for a side-scrolling action game.
The attached image is a CHARACTER AND ART STYLE REFERENCE. Create a new, polished Cloud Strife spritesheet inspired by its beautiful detailed pixel art. Preserve iconic swept spiky gold hair, side profile cyan eye, sleeveless dark navy ribbed turtleneck, single steel pauldron, leather harness/belt, broad dark trousers, studded wrist guards, heavy dark boots, huge rectangular Buster Sword with steel beveled edge and two holes near the hilt. Mature athletic proportions, not chibi. Every sprite faces RIGHT except upside-down tumble poses.
CRITICAL technical layout: landscape 1536x1024, exactly SIX columns and FOUR rows = 24 equal 256x256 cells. One complete separate character in each cell, full sword visible, no overlap between cells, at least 12px transparent clearance to cell edges. No grid lines, no labels, no text, no portrait, no background, no ground shadow. TRUE transparent alpha background.
Every standing character is approximately 150px tall (hair to soles); identical body proportions and consistent palette throughout. Ground baseline at y=226 relative to each cell, body/pelvis horizontally near x=112; sword may extend ahead or behind. Keep same scale for crouched or rotated poses, do not enlarge them. Clean deliberate pixel clusters, controlled shading, dark 1px outline, crisp pixel edges, restrained highlights. No blur, no anti-aliased painterly rendering, no gradients. Beautiful readable arcade/SNES-era high detail pixel art.
Exact cell sequence left to right:
Row 1: (1) idle alert guard, sword held low forward nearly horizontal; (2) second breathing idle guard, tiny lower shoulders, same feet/sword silhouette; (3) run right contact pose front leg forward back leg extended, sword trailing low behind; (4) run right down pose front knee bent, sword trailing behind; (5) run right passing pose one knee raised; (6) run right flight pose feet separated.
Row 2: (7) run right opposite contact legs reversed; (8) run right opposite passing/recovery; (9) jump rising knees tucked sword diagonally behind; (10) falling controlled legs lowering sword behind; (11) low landing crouch feet planted, sword angled low behind; (12) attack windup sword overhead behind head, legs braced.
Row 3: (13) horizontal sword slash extended forward, one thin cyan-white blade arc to the right; (14) low follow-through sword forward/down; (15) rising uppercut sword above head with thin cyan-white rising arc to the right; (16) heavy overhead sword windup airborne, both hands on handle; (17) powerful descending diagonal strike with thin cyan-white crescent in front, lunging; (18) heavy strike recovery low stance sword tip near floor ahead.
Row 4: (19) dodge forward tightly tucked somersault, head angled down, sword kept close pointing diagonally back; (20) dodge inverted somersault head down feet up and sword close; (21) aerial spin slash horizontal body with sword extended and subtle cyan-white arc; (22) hurt recoil leaning back still standing; (23) defeated lying horizontal on the ground with sword resting ahead; (24) victory upright with Buster Sword resting over shoulder behind head.
Art quality and consistency are the absolute priority. Keep all 24 cells populated exactly as described.

### Locomozione

Edit target: attached generated Cloud Strife spritesheet. Create ONLY the EIGHT locomotion frames as a new transparent sheet. Keep the same character identity, mature proportions, detailed crisp pixel art, gold hair, navy clothes, steel pauldron, dark leather boots. Asset production, no backdrop or glow.
Layout: EXACTLY FOUR COLUMNS and TWO ROWS, eight completely separated sprites with large transparent gutters. Landscape 1536x1024, 384x512 per cell. All bodies same size, 220px tall from gold hair to feet, baseline at 420px inside each cell. All face right. Center each torso horizontally in its cell. Every sprite MUST hold a FULL VISIBLE BUSTER SWORD in his right hand, broad rectangular steel blade, silver cutting edge and two dark holes near hilt. All sword tips and hair fully inside cell bounds. No silhouettes without swords. No text, labels, grid, background, shadow, glow or soft effects.
Row1 col1: idle guard sword held forward low nearly horizontal as in first original reference pose.
Row1 col2: second idle breath, shoulders 2px lower, SAME feet and same sword held forward low.
Row1 col3: run contact: near leg extended forward heel landing, far leg extended back toe pushing, sword trailing diagonally back/low attached to near hand behind hip.
Row1 col4: run down: near leg bent supporting weight, far knee swinging forward, sword trailing back low.
Row2 col1: run passing: near leg behind support, far knee raised high in front, sword trailing back low.
Row2 col2: run opposite contact: far leg forward heel landing, near leg back toe pushing, sword trailing back low.
Row2 col3: run opposite down: far leg bent supporting weight, near knee swinging forward, sword trailing back low.
Row2 col4: run opposite passing: far leg behind support, near knee high in front, sword trailing back low.
Make a believable sequential running cycle with alternating legs. Single consistent sword angle at about 15 degrees below horizontal behind, never disappearing. Tight outline, pixel clusters, no anti-aliasing. Actual transparent alpha.

### Combattimento

Create a production combat sprite atlas using the attached Cloud Strife art as character/style reference. Exactly 16 complete isolated sprites in FOUR COLUMNS and FOUR ROWS, square canvas 2048x2048, equal 512x512 cells. Large 40-pixel EMPTY TRANSPARENT gutters between sprites. Character approximately 220px tall when standing, identical physical proportions in all poses. Every body and entire Buster Sword and attack arc completely inside its cell. Cloud faces RIGHT in profile. Do not fill all cell space by enlarging sprites. Clean detailed pixel art, no blur/gradient/soft bloom, no portrait or text. Gold spiky hair, navy sleeveless knit and loose pants, steel pauldron/studded wristguards, dark leather boots/harness. Distinct expressive silhouettes, natural anatomy, broad steel rectangular Buster Sword with beveled silver edge, TWO holes by hilt. True transparent background with crisp edges, no checkerboard.
Row 1: (1) rising jump, knees tucked sword trailing diagonally behind; (2) controlled fall, legs lowering sword trailing behind; (3) landing low crouch feet planted, sword trailing behind; (4) grounded attack anticipation, sword held overhead behind head, legs braced.
Row 2: (5) strong horizontal slash sword extended right with crisp cyan-white curved trail in front; (6) slash follow-through with sword angled down toward right; (7) rising uppercut sword high above head with crisp cyan-white crescent to right; (8) heavy attack windup in air, knees bent, both hands hold sword overhead.
Row 3: (9) heavy downward slash sword diagonal right/down with crisp cyan-white crescent in front; (10) heavy slash recovery low stance, sword near floor in front; (11) tightly tucked forward dodge somersault head toward right and down, sword close to back; (12) inverted dodge somersault feet up head down sword tucked closely.
Row 4: (13) aerial spinning slash body stretched horizontal face right and sword extended right, compact cyan-white arc around body; (14) hurt recoil leaning backward with sword still in hand; (15) KO lying horizontal facing ground sword resting right on ground; (16) proud victory standing with sword resting on shoulder behind head.
CRITICAL: All 16 cells fully populated and well separated. Preserve palette and scale across poses. Full blades, no missing swords. No shadows or decorative background.

### Reazione al danno

Use attached sheet as character/style reference. Create ONE isolated pixel-art sprite of Cloud Strife recoiling from damage facing right. Same detailed crisp pixel clusters, same realistic athletic proportions as the reference, golden swept spiky hair, cyan eye, navy sleeveless turtleneck and pants, steel pauldron, brown harness, dark boots. Full body, feet planted apart, torso leaning back, head tilted back slightly, expression of pain. His right hand MUST keep holding the complete Buster Sword, broad rectangular beveled steel blade with two holes near hilt, sword angled forward and low, blade tip off ground, sword never detached. The left arm reacts behind him. Actual transparent alpha background, no shadows, no glow, no blur, no text. Keep a clean 1px dark outline, restrained color palette, hard-edged pixel art consistent with the reference. Leave generous transparent clearance around the complete character and entire sword. SINGLE FULL BODY SPRITE ONLY.

