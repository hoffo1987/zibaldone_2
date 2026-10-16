# Modello dell'easter egg del podio

Derivato da `freddy fazbear.blend` e dalle texture fornite dall'utente per questo progetto.
Il personaggio è Freddy Fazbear (Five Nights at Freddy's). L'autore e la licenza del modello
non erano specificati nei file forniti; questi asset non sono dichiarati originali del progetto.

La geometria conserva tutti i 27.336 triangoli e le UV del file originale. La posa usa lo
scheletro originale: la mano libera, a destra per chi guarda, saluta; quella con il microfono
rimane abbassata dietro la colonna. Il busto si inclina dalla vita; un secondo campione
della posa anima dolcemente il polso. La testa ruota attorno al collo verso la camera reale,
con la stessa trasformazione anche nelle ombre e nei riflessi.

`freddy.json` descrive gli intervalli dei quattro materiali. `freddy.bin` contiene vertici
float32 (posizione, normale, UV, delta posizione, delta normale, peso della testa: 60 byte)
e indici uint32. Il formato versione 2 include `headPivot` e i pesi ricavati dallo scheletro.
Ogni file di texture `.bin` contiene una catena mip di immagini WebP lossless; ogni immagine
è preceduta dalla sua lunghezza uint32 little-endian. Le mappe colore usano sRGB, le normali
sono lineari. Risoluzioni base: corpo 2048, endoscheletro 1024, occhi e microfono 512.
Le mappe sono ridimensionate offline per l'inquadratura nella sala; nessuna texture preesistente
dell'app è stata modificata.

Il materiale usa lo stesso shader della sala: sonde GI, luce lunare, ombre PCSS,
riflessi e nebbia. Durante l'apparizione un rinforzo locale della luce riflessa interessa
anche colonna e pavimento; non sono presenti luci fisse o emissioni riservate al modello.

Rigenerazione (Blender 4.5, senza eseguire script incorporati nel file):

```sh
blender --background --factory-startup --disable-autoexec --python scripts/export-freddy.py -- "source/freddy fazbear.blend" textures public/freddy
node scripts/freddy-textures.cjs textures public/freddy
```

Gli originali restano nella cartella dell'utente, senza modifiche.
