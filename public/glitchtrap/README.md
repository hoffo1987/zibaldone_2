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
a quattro passi a passo costante, all'85% della velocità, 60 fotogrammi al secondo, più un breve seguito
del passo successivo (l'attore non si ferma mai: `stop` in `walk.json` dice dove si fermano le gambe di
Glitchtrap; busto e braccia proseguono in quel seguito rallentando, senza ralenti e senza blocchi). Ogni osso
riceve la rotazione dell'attore corretta per la diversa posa a riposo (l'attore in T, Glitchtrap in
A); il percorso è scalato sulla lunghezza delle gambe e non viene mai curvato (girarlo con un piede a
terra lo farebbe scivolare). La presa è appena levigata; busto, testa e braccia un po' di più, perché
i loro marcatori tremano (la schiena dà un colpo a metà camminata che le mani ripeterebbero); posizioni
e rotazioni sono interpolate su curve continue tra un fotogramma e l'altro. I piedi del costume sono il
doppio di quelli dell'attore: durante l'appoggio il piede di Glitchtrap rotola sul proprio tallone o sul proprio
avampiede a partire dall'impronta piatta, non scivola e non attraversa il pavimento.
`walk.json` elenca i giunti; `walk.bin` contiene per fotogramma (float32) il punto medio delle anche,
le due caviglie e la rotazione globale di ogni giunto, nel sistema della camminata (metri della posa a
riposo, +z lungo il percorso).

## L'interpretazione

`src/podium/glitchtrapPose.ts` mette sopra la camminata i gesti del personaggio, presi dal finale
«Pizza Party» di Help Wanted (si sporge dalla tenda e fa cenno di avvicinarsi) e dalle animazioni
della lobby di Dead by Daylight (saluto lento a mano aperta, testa inclinata), ingrandito di quasi una
volta e mezzo perché regga le proporzioni della sala: si sporge dalla colonna, esce verso destra dietro di
essa, abbastanza lontano da non toccarne la base, fino all'angolo posteriore della pedana, e si ferma girandosi
verso la camera in un solo movimento: appena l'ultimo passo tocca terra il corpo prosegue sul piede
davanti, che fa perno sull'avampiede, mentre l'altro si stacca e gli si affianca; anche e bacino
partono dalla velocità che la camminata aveva e rallentano fino a fermarsi. Poi saluta con la mano
destra aperta all'altezza degli occhi, accanto alla testa inclinata (alzata, la sinistra finirebbe
dietro la targhetta del secondo posto), richiama con le dita, respira. Mentre accade la camera si
avvicina e gira verso la navata (`src/podium/Podium3D.tsx`): da lì lui, colonne e targhette non si
coprono, anche sui telefoni, dove scivola nella navata e la guarda di lungo. Da
fermo non è mai immobile: il peso passa piano da un piede all'altro, oscilla appena avanti e indietro,
lo sguardo ha piccoli scarti attorno alla camera e annuisce col saluto; la mano libera pende come un
pendolo in ritardo sul corpo, il gomito morbido, e ogni tanto le dita tamburellano a partire dal
mignolo. Le gambe sono risolte su caviglie e bacino: le
ginocchia seguono la punta dei piedi, non la torsione della coscia dell'attore, la parte più rumorosa
di una presa. Le mani pendono rilassate, seguono in ritardo l'oscillazione dell'avambraccio e le dita
non stanno mai ferme. Cosce e pancia del costume sono molto più larghe di quelle dell'attore: sono
descritte come tubi ellittici misurati sulla mesh e, dove dita, palmo o polso le sfiorerebbero, il
braccio si allarga quanto basta per passare (le distanze sono funzioni lisce, perché il braccio non
scatti). La testa cerca la camera reale; le orecchie sono molle smorzate spinte dai movimenti della
testa. Il bagliore degli occhi resta sull'iride (la mappa emissiva pubblicata è più larga): lo shader
lo limita ai pixel viola del colore di base.

## Il glitch e la luce

Come in Help Wanted lo si vede attraverso un fosforo verde (`src/podium/glitchtrap.ts`): luci e ombre
del costume restano, i bordi della sagoma bruciano di verde, linee di scansione gli salgono addosso e
qualche blocco di pixel si corrompe. A ogni scatto della testa, e in piccolo anche tra uno e l'altro,
l'immagine si strappa in fasce orizzontali che saltano di lato e si sdoppiano nei colori, e qualche
blocco sparisce; frammenti quadrati verdi gli galleggiano attorno e lampeggiano. Il suo bagliore
verde illumina colonna, pavimento e gradini vicini e fa un alone nella nebbia.

Dopo il primo saluto, ogni quindici secondi un glitch pesante lo porta altrove nella sala
(`TELEPORT` e `SPOTS` in `src/podium/glitchtrapPose.ts`): dietro l'angolo sinistro o destro della
pedana, oppure davanti a sinistra, vicinissimo; mai due volte di fila nello stesso posto, in un ordine
che sembra casuale ma è sempre lo stesso. I posti sono stati cercati su tutta la pianta: lì sta ad
almeno 14 cm da colonne, pedana, gradini e muri e, dall'inquadratura che la camera prende per
ciascuno (su computer e telefono), nessuna colonna, targhetta o bordo dello schermo gli copre la testa
o la mano che saluta. Prima si tende (spalle alzate, mani ad artiglio, tremito) mentre il glitch lo
strappa sempre di più; poi l'immagine si schiaccia in una riga di luce e la riga in un punto, come un
vecchio televisore spento, tra frammenti che esplodono; la camera intanto si sposta sul nuovo posto,
dove la stessa riga si riapre e lui si rialza da accucciato. Il faro si spegne con lui e si riaccende a
fatica sopra il nuovo posto. Tecnicamente è uno spostamento rigido dell'intera posa (la stessa
recitazione, ruotata e posata altrove, con la camera riportata nel suo riferimento): orecchie e
sguardo non saltano.

Quando appare la luna si vela e la sala scurisce (`src/podium/engine.ts`). Mentre arriva, un faro
freddo sopra il punto dove si ferma si accende a fatica, come un vecchio tubo, e cala a ogni glitch:
lo prende di tre quarti, metà viso nella luce e metà in penombra, con un'ombra morbida tutta sua
(`spotShadow` in `src/podium/shaders.ts`: mappa d'ombra dal faro, penombra che si allarga lontano dal
corpo) su di sé, sul pavimento e sul muro; il cono si vede nella polvere. Di lui la sala prende meno
luce rimbalzata, così la penombra resta profonda.

## Rigenerazione

Dal file scaricato da Sketchfab (cartella con `scene.gltf`, `scene.bin`, `textures/`) e dalla presa
CMU `139_29.bvh`:

```sh
node scripts/export-glitchtrap.cjs <cartella> public/glitchtrap
node scripts/bake-glitchtrap-walk.cjs <139_29.bvh> public/glitchtrap
```
