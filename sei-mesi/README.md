# I 6 mesi di Giulia e Davide

Un regalo in 3D: dallo spazio si scende su Milano, si apre un album di
fotografie da sfogliare e alla fine la Terra torna a girare, con le frasi
per i prossimi viaggi.

Stack: Vite · Three.js · GSAP + ScrollTrigger · Lenis · postprocessing ·
Supabase Storage (solo lettura).

## Avvio in locale

```bash
npm install
cp .env.example .env   # e riempi i valori (vedi sotto)
npm run dev            # http://localhost:5173 (anche dal telefono sulla stessa Wi‑Fi)
```

Per provare la versione ottimizzata: `npm run build && npm run preview`.

Parametri utili nell'URL: `?q=low` / `?q=high` forzano la qualità,
`?calm` simula "riduci movimento".

## Variabili d'ambiente

| Variabile | Valore |
| --- | --- |
| `VITE_SUPABASE_URL` | URL del progetto Supabase |
| `VITE_SUPABASE_ANON_KEY` | chiave **anon / publishable** (mai la service_role) |
| `VITE_SUPABASE_BUCKET` | nome del bucket con le foto (`foto`) |
| `VITE_SUPABASE_FOLDER` | cartella nel bucket (vuota = radice) |

Le foto vengono lette in ordine di nome (`01_…`, `02_…`). I file che iniziano
con `_` o `.` vengono ignorati. Per aggiungere foto basta caricarle nel bucket
con il numero giusto davanti: il sito le impagina da solo.

### Accesso al bucket

Il bucket è **privato**: il sito chiede URL firmati (validi 12 ore) con la
chiave anon. Per funzionare serve una policy di **sola lettura** per il ruolo
`anon` sul bucket:

```sql
create policy "foto_select" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'foto');
```

Le trasformazioni immagine di Supabase (ridimensionamento) sono una funzione
del piano Pro: il sito controlla da solo se sono attive e, se non lo sono,
scarica gli originali in modo progressivo (prima le prime pagine).

## Pubblicazione su Vercel

1. Metti la cartella su GitHub (anche dentro un repo più grande).
2. Su [vercel.com](https://vercel.com) → **Add New… → Project** → importa il repo.
3. Se il sito è in una sottocartella, imposta **Root Directory** = `sei-mesi`.
   Framework: *Vite* (build `npm run build`, output `dist`).
4. In **Settings → Environment Variables** aggiungi le quattro variabili
   `VITE_SUPABASE_…` (per Production e Preview), poi **Deploy**.
5. Il link `https://<nome>.vercel.app` è quello da mandare a Giulia.

In alternativa da terminale: `npx vercel` (prima volta) e `npx vercel --prod`.

Su Netlify è uguale: build `npm run build`, publish `dist`, stesse variabili.

Il sito non viene indicizzato dai motori di ricerca (`noindex` + `robots.txt`),
ma chiunque abbia il link può vedere le foto.

## Musica (facoltativa)

Metti un file `public/musica.mp3`: comparirà il pulsante 🔈 in alto a destra.
La musica parte solo dopo un tocco.

## Texture della Terra

In `public/textures/` ci sono texture NASA di pubblico dominio (Blue Marble,
luci notturne, nuvole, rilievo e oceani) in 2K e 4K. Si rigenerano con
`npm run textures` (serve ImageMagick).

## Struttura

```
src/
  main.js          avvio, render loop, collegamento dei moduli
  quality.js       rilevamento telefono / qualità / movimento ridotto
  scroll.js        Lenis + timeline GSAP legata allo scroll + blocco sull'album
  cameraRig.js     pose della camera (spazio → Italia → Milano → finale)
  globe.js         Terra (shader giorno/notte), nuvole, atmosfera, pin a cuore
  stars.js         stelle a strati e nebulosa
  arcs.js          rotte luminose del finale
  post.js          bloom, tone mapping, vignettatura, grana
  album/
    album.js       libro 3D, viste, gesti (swipe, rotellina, frecce)
    pageFlip.js    curvatura realistica della pagina
    pageTextures.js copertina in pelle e oro, carta, polaroid
    layout.js      impaginazione delle foto
  photos.js        dimensioni, download progressivo, decodifica
  supabase.js      elenco e URL delle foto
  loader.js        schermata di caricamento (cuore che si riempie)
  audio.js         musica facoltativa
  finale.js        pulsante "Ricomincia"
```
