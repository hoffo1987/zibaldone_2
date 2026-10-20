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

## La camminata

La camminata è reale: una presa di motion capture del CMU Graphics Lab Motion Capture Database
(http://mocap.cs.cmu.edu), soggetto 139, prova 29 «Sneaking» (camminata furtiva), nella conversione
BVH di Bruce Hahne (cgspeed). The data used in this project was obtained from mocap.cs.cmu.edu. The
database was created with funding from NSF EIA-0196217. CMU non pone restrizioni all'uso dei dati e la
conversione BVH non ne aggiunge.

`scripts/bake-glitchtrap-walk.cjs` la trasferisce sullo scheletro di Glitchtrap: dall'attore fermo
a cinque passi e un arresto rallentato, al 85% della velocità, 60 fotogrammi al secondo. Ogni osso
riceve la rotazione dell'attore corretta per la diversa posa a riposo (l'attore in T, Glitchtrap in
A); il percorso è scalato sulla lunghezza delle gambe. I piedi del costume sono il doppio di quelli
dell'attore: durante l'appoggio il piede di Glitchtrap rotola sul proprio tallone o sul proprio
avampiede a partire dall'impronta piatta, non scivola e non attraversa il pavimento.
`walk.json` elenca i giunti; `walk.bin` contiene per fotogramma (float32) il punto medio delle anche,
le due caviglie e la rotazione globale di ogni giunto, nel sistema della camminata (metri della posa a
riposo, +z lungo il percorso).

## L'interpretazione

`src/podium/glitchtrapPose.ts` mette sopra la camminata i gesti del personaggio, presi dal finale
«Pizza Party» di Help Wanted (si sporge dalla tenda e fa cenno di avvicinarsi) e dalle animazioni
della lobby di Dead by Daylight (saluto lento a mano aperta, testa inclinata): si sporge dalla colonna,
una volta fermo gira bacino e busto verso la camera, saluta, richiama con le dita, respira. Le braccia
dell'attore sono tenute un po' più larghe, così le mani non entrano nella pancia e nelle cosce del
costume. La testa cerca la camera reale; le orecchie sono molle smorzate spinte dai movimenti della
testa. Il bagliore degli occhi resta sull'iride (la mappa emissiva pubblicata è più larga): lo shader
lo limita ai pixel viola del colore di base.

## Rigenerazione

Dal file scaricato da Sketchfab (cartella con `scene.gltf`, `scene.bin`, `textures/`) e dalla presa
CMU `139_29.bvh`:

```sh
node scripts/export-glitchtrap.cjs <cartella> public/glitchtrap
node scripts/bake-glitchtrap-walk.cjs <139_29.bvh> public/glitchtrap
```
