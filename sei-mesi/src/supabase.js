/**
 * Accesso alle foto su Supabase Storage (solo lettura, solo chiave anon).
 *
 * - elenca i file del bucket con storage.list(folder)
 * - tiene solo le immagini e le ordina per nome (01_, 02_, …)
 * - bucket pubblico → getPublicUrl, bucket privato → createSignedUrls
 * - se il progetto ha le trasformazioni immagine, chiede versioni ridotte
 */
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_CONFIG } from './config.js';

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)$/i;
const SIGNED_TTL = 60 * 60 * 12; // 12 ore

let client = null;
function getClient() {
  if (!client) {
    const { url, anonKey } = SUPABASE_CONFIG;
    if (!url || !anonKey) throw new Error('Configurazione Supabase mancante (.env)');
    client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return client;
}

/** Rifiuta la promessa se Supabase non risponde in tempo. */
function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label}: Supabase non risponde`)), ms);
    }),
  ]);
}

const natural = new Intl.Collator('it', { numeric: true, sensitivity: 'base' });

/**
 * Elenco delle foto, ordinato per nome, con un URL leggibile per ciascuna.
 * @returns {Promise<{name:string, path:string, url:string, size:number}[]>}
 */
export async function fetchPhotoList() {
  const sb = getClient();
  const { bucket, folder } = SUPABASE_CONFIG;
  const storage = sb.storage.from(bucket);

  const { data, error } = await withTimeout(
    storage.list(folder, { limit: 1000, sortBy: { column: 'name', order: 'asc' } }),
    12000,
    'Elenco foto',
  );
  if (error) throw error;

  const files = (data || [])
    .filter((f) => f.id && !f.name.startsWith('.') && !f.name.startsWith('_'))
    .filter((f) => (f.metadata?.mimetype || '').startsWith('image/') || IMAGE_EXT.test(f.name))
    .filter((f) => !/hei[cf]$/i.test(f.name)) // HEIC: i browser (tranne Safari) non lo leggono
    .sort((a, b) => natural.compare(a.name, b.name));

  if (!files.length) throw new Error('Nessuna foto trovata nel bucket');

  const paths = files.map((f) => (folder ? `${folder}/${f.name}` : f.name));
  const urls = await resolveUrls(storage, paths);

  return files.map((f, i) => ({
    name: f.name,
    path: paths[i],
    url: urls[i],
    size: f.metadata?.size || 0,
  }));
}

/** Chiede gli URL nel modo giusto per un bucket pubblico o privato. */
async function resolveUrls(storage, paths) {
  // 1) Bucket privato (il nostro caso): URL firmati in un'unica richiesta
  const signed = await withTimeout(storage.createSignedUrls(paths, SIGNED_TTL), 12000, 'URL firmati');
  if (!signed.error && signed.data?.every((d) => d.signedUrl)) {
    // Trasformazioni disponibili? Proviamo su un file: se l'URL restituito
    // passa da /render/image/ il server le supporta (piano Pro).
    if (await transformsAvailable(storage, paths[0])) {
      const resized = await Promise.all(
        paths.map((p) =>
          storage
            .createSignedUrl(p, SIGNED_TTL, { transform: { width: 1600, height: 1600, resize: 'contain', quality: 82 } })
            .then((r) => r.data?.signedUrl),
        ),
      );
      if (resized.every(Boolean)) return resized;
    }
    return signed.data.map((d) => d.signedUrl);
  }

  // 2) Bucket pubblico: URL diretti
  return paths.map((p) => storage.getPublicUrl(p).data.publicUrl);
}

async function transformsAvailable(storage, path) {
  try {
    const { data } = await storage.createSignedUrl(path, 60, { transform: { width: 64, height: 64 } });
    if (!data?.signedUrl || !data.signedUrl.includes('/render/image/')) return false;
    const res = await fetch(data.signedUrl, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}
