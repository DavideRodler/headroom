/**
 * Libreria delle foto: elenco da Supabase, dimensioni lette dall'intestazione
 * dei file (per impaginare l'album senza scaricare tutto), download progressivo
 * con priorità alle prime pagine e decodifica on-demand.
 */
import { fetchPhotoList } from './supabase.js';

/**
 * Elenco alternativo (facoltativo): se VITE_PHOTO_MANIFEST punta a un JSON
 * pubblicato insieme al sito, le foto arrivano da lì invece che da Supabase.
 * Serve per le anteprime ospitate dove le richieste esterne sono bloccate.
 * Formato: [{ "name": "01_x.jpg", "file": "photos/01_x.jpg", "w": 1200, "h": 1600 }]
 */
async function fetchManifest(path) {
  const url = new URL(`${import.meta.env.BASE_URL}${path}`, window.location.href);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Elenco foto non trovato (${res.status})`);
  const list = await res.json();
  if (!Array.isArray(list) || !list.length) throw new Error('Elenco foto vuoto');
  return list.map((p) => ({
    name: p.name,
    path: p.file,
    url: new URL(p.file, url).href,
    size: 0,
    w: p.w,
    h: p.h,
  }));
}

const PROBE_BYTES = 131072; // 128 KB bastano per l'intestazione di un JPEG
const BACKGROUND_CONCURRENCY = 3;

export class PhotoLibrary {
  constructor(loader) {
    this.loader = loader;
    /** @type {{name,path,url,size,w,h,aspect,blob?:Blob}[]} */
    this.items = [];
    this.error = null;
    this.ready = false;
    this._pending = new Map(); // indice → promessa del blob
    this._queue = [];
    this._active = 0;
  }

  /** Carica elenco, dimensioni e le prime foto. Non lancia mai: imposta this.error. */
  async init(firstCount = 4) {
    const report = this.loader?.task('photos', 3) || (() => {});
    try {
      const manifest = import.meta.env.VITE_PHOTO_MANIFEST;
      this.items = manifest ? await fetchManifest(manifest) : await fetchPhotoList();
      report(0.15);

      let probed = 0;
      await mapLimit(this.items, 6, async (item) => {
        await this.#probe(item);
        report(0.15 + (0.35 * ++probed) / this.items.length);
      });

      // prime foto (per le prime pagine) prima di partire
      const first = Math.min(firstCount, this.items.length);
      let got = 0;
      await Promise.all(
        Array.from({ length: first }, (_, i) =>
          this.blob(i, true).then(() => report(0.5 + (0.5 * ++got) / first)),
        ),
      );
      report(1);
      this.ready = true;
      // tutte le altre in sottofondo, nell'ordine dell'album
      for (let i = first; i < this.items.length; i++) this.blob(i);
    } catch (err) {
      console.warn('[foto]', err);
      this.error = err;
      report(1);
    }
  }

  /** Riprova dopo un errore. */
  async retry() {
    this.error = null;
    this.items = [];
    this._pending.clear();
    this._queue = [];
    await this.init();
    return !this.error;
  }

  /** Legge larghezza/altezza (e orientamento EXIF) dai primi byte del file. */
  async #probe(item) {
    if (item.w > 0 && item.h > 0) {
      // dimensioni già note (elenco con misure)
      item.aspect = item.w / item.h;
      return;
    }
    item.w = 3;
    item.h = 4; // ripiego: verticale
    try {
      const res = await fetch(item.url, { headers: { Range: `bytes=0-${PROBE_BYTES - 1}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      // il server ha ignorato il Range: abbiamo già il file intero, teniamolo
      if (res.status === 200) item.blob = new Blob([buf], { type: res.headers.get('content-type') || 'image/jpeg' });
      const dims = readImageSize(buf);
      if (dims) {
        item.w = dims.w;
        item.h = dims.h;
      } else if (!item.blob) {
        // formato non riconosciuto: scarichiamo l'intera immagine per misurarla
        const blob = await this.blob(this.items.indexOf(item), true);
        const bmp = await decode(blob);
        item.w = bmp.width;
        item.h = bmp.height;
        bmp.close?.();
      }
    } catch (err) {
      console.warn('[foto] dimensioni non lette per', item.name, err);
    }
    item.aspect = item.w / item.h;
  }

  /**
   * Blob della foto i (scaricato una volta sola).
   * @param {number} i
   * @param {boolean} urgent salta la coda (serve subito per una pagina)
   */
  blob(i, urgent = false) {
    const item = this.items[i];
    if (!item) return Promise.reject(new Error('foto inesistente'));
    if (item.blob) return Promise.resolve(item.blob);
    let entry = this._pending.get(i);
    if (!entry) {
      entry = {};
      entry.promise = new Promise((resolve, reject) => {
        entry.start = () =>
          fetch(item.url)
            .then((r) => {
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
              return r.blob();
            })
            .then((b) => {
              item.blob = b;
              resolve(b);
            }, reject);
      });
      this._pending.set(i, entry);
      this._queue.push(entry);
    }
    if (urgent && !entry.started) {
      // passa davanti a tutti
      this._queue = this._queue.filter((e) => e !== entry);
      this.#run(entry);
    } else {
      this.#pump();
    }
    return entry.promise;
  }

  #pump() {
    while (this._active < BACKGROUND_CONCURRENCY && this._queue.length) {
      this.#run(this._queue.shift());
    }
  }

  #run(entry) {
    if (entry.started) return;
    entry.started = true;
    this._active++;
    entry.start();
    entry.promise
      .catch(() => {})
      .finally(() => {
        this._active--;
        this.#pump();
      });
  }

  /** Decodifica la foto i in un'immagine pronta da disegnare. */
  async bitmap(i) {
    const blob = await this.blob(i, true);
    return decode(blob);
  }
}

/* ------------------------------------------------------------ utilità */

async function decode(blob) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch {
      /* ripiego sotto */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Esegue fn su ogni elemento con al massimo `limit` operazioni in parallelo. */
async function mapLimit(items, limit, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(workers);
}

/** Dimensioni di JPEG / PNG dai primi byte (tiene conto della rotazione EXIF). */
function readImageSize(buf) {
  const v = new DataView(buf);
  if (v.byteLength < 24) return null;
  // PNG
  if (v.getUint32(0) === 0x89504e47) return { w: v.getUint32(16), h: v.getUint32(20) };
  // JPEG
  if (v.getUint16(0) !== 0xffd8) return null;
  let off = 2;
  let orientation = 1;
  while (off + 9 < v.byteLength) {
    if (v.getUint8(off) !== 0xff) {
      off++;
      continue;
    }
    const marker = v.getUint8(off + 1);
    if (marker === 0xff) {
      off++;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      off += 2;
      continue;
    }
    const len = v.getUint16(off + 2);
    if (marker === 0xe1) orientation = readExifOrientation(v, off + 4, len - 2) || orientation;
    const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSOF) {
      const h = v.getUint16(off + 5);
      const w = v.getUint16(off + 7);
      return orientation >= 5 && orientation <= 8 ? { w: h, h: w } : { w, h };
    }
    off += 2 + len;
  }
  return null;
}

function readExifOrientation(v, start, length) {
  try {
    if (v.getUint32(start) !== 0x45786966) return 0; // "Exif"
    const tiff = start + 6;
    const little = v.getUint16(tiff) === 0x4949;
    const ifd = tiff + v.getUint32(tiff + 4, little);
    const entries = v.getUint16(ifd, little);
    for (let i = 0; i < entries; i++) {
      const e = ifd + 2 + i * 12;
      if (e + 12 > start + length) break;
      if (v.getUint16(e, little) === 0x0112) return v.getUint16(e + 8, little);
    }
  } catch {
    /* EXIF non leggibile */
  }
  return 0;
}
