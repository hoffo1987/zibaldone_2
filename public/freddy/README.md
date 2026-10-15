# Modello dell'easter egg del podio

Derivato da `freddy fazbear.blend` e dalle texture fornite dall'utente per questo progetto.
Il personaggio è Freddy Fazbear (Five Nights at Freddy's). L'autore e la licenza del modello
non erano specificati nei file forniti; questi asset non sono dichiarati originali del progetto.

La geometria conserva tutti i 27.336 triangoli e le UV del file originale. La posa usa lo
scheletro originale: la mano libera, a destra per chi guarda, saluta; quella con il microfono
rimane abbassata. Un secondo campione della posa anima dolcemente il polso.

`freddy.json` descrive gli intervalli dei quattro materiali. `freddy.bin` contiene vertici
float32 (posizione, normale, UV, delta posizione, delta normale: 56 byte) e indici uint32.
Ogni file di texture `.bin` contiene una catena mip di immagini WebP lossless; ogni immagine
è preceduta dalla sua lunghezza uint32 little-endian. Le mappe colore usano sRGB, le normali
sono lineari. Risoluzioni base: corpo 2048, endoscheletro 1024, occhi e microfono 512.
Le mappe sono ridimensionate offline per l'inquadratura nella sala; nessuna texture preesistente
dell'app è stata modificata.

Rigenerazione (Blender 4.5, senza eseguire script incorporati nel file):

```sh
blender --background --factory-startup --disable-autoexec --python scripts/export-freddy.py -- "source/freddy fazbear.blend" textures public/freddy
node scripts/freddy-textures.cjs textures public/freddy
```

Gli originali restano nella cartella dell'utente, senza modifiche.
