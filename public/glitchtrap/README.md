# Modello della sorpresa notturna del podio

This work is based on "Glitchtrap | Help Wanted"
(https://sketchfab.com/3d-models/glitchtrap-help-wanted-59f7e4fcece54c229441bf169eb14634) by JuztAndy
(https://sketchfab.com/JuztAndy) licensed under CC-BY-ND-4.0 (http://creativecommons.org/licenses/by-nd/4.0/).

Il personaggio è Glitchtrap (Five Nights at Freddy's: Help Wanted). Il modello e le texture sono
dell'autore indicato sopra e non sono originali del progetto. La licenza CC BY-ND 4.0 chiede di
citare l'autore e non permette di distribuire versioni modificate: qui ci sono solo le modifiche
tecniche necessarie per il web, consentite dalla licenza (unità di misura, formato dei vertici,
risoluzione e codifica delle texture). Mesh, UV, pesi dello scheletro e scheletro sono quelli
pubblicati; la posa e l'animazione sono calcolate dall'app mentre la sala è aperta.

`glitchtrap.json` contiene il numero di vertici e indici e lo scheletro: per ogni giunto il nome,
il genitore e la posizione di riposo in metri (y in alto, il personaggio guarda verso +z, la sua
sinistra è +x). `glitchtrap.bin` contiene i vertici da 40 byte (posizione, normale, UV in float32;
quattro indici di giunto uint8; quattro pesi unorm8 che sommano a 255) seguiti dagli indici uint16.
Ogni texture `.bin` è una catena mip di immagini WebP lossless, ognuna preceduta dalla sua lunghezza
uint32 little-endian: `color` (sRGB, 2048), `normal` (lineare, 2048) e `material` (1024; R la mappa
di ruvidità pubblicata, G e B il rosso e il blu della mappa emissiva delle iridi).

L'animazione (`src/podium/glitchtrapPose.ts`) si ispira ai movimenti del personaggio nel finale
«Pizza Party» di Help Wanted (si sporge dalla tenda e fa cenno di avvicinarsi) e nelle animazioni
della lobby di Dead by Daylight (saluto lento a mano aperta, testa inclinata, camminata curva).
Passi corti e felpati (appoggio sull'avampiede, poi il tallone; piede basso che rallenta prima del
contatto), piedi fermi sul pavimento, binari alla larghezza delle anche e braccia staccate dal corpo
perché il costume non si compenetri, bacino a velocità quasi costante, cinematica inversa di gambe e
braccia, dita che seguono la mano nel saluto, testa che cerca la camera reale, orecchie simulate come
molle smorzate spinte dai movimenti della testa. Il bagliore degli occhi resta sull'iride (la mappa
emissiva pubblicata è più larga): lo shader lo limita ai pixel viola del colore di base.

Rigenerazione dal file scaricato da Sketchfab (cartella con `scene.gltf`, `scene.bin`, `textures/`):

```sh
node scripts/export-glitchtrap.cjs <cartella> public/glitchtrap
```
