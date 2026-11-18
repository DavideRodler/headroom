/**
 * Costanti condivise: coordinate, testi, palette, destinazioni dei "voli".
 */

/** Milano, dove tutto è cominciato. */
export const MILANO = { lat: 45.4642, lon: 9.19 };

/** Direzione del Sole nello spazio del mondo (fissa rispetto alla camera iniziale). */
export const SUN_DIRECTION = [-0.9, 0.3, 0.2];

/** Titolo sulla copertina dell'album (due righe). */
export const COVER_TITLE = ['I 6 mesi di', 'Giulia e Davide'];

/** Palette condivisa tra 3D e DOM. */
export const COLORS = {
  night: 0x04060f,
  pink: 0xff6f9c,
  rose: 0xffb3c7,
  gold: 0xf3c98b,
  cream: 0xfff4e6,
  leather: '#5b1a2b',
};

/**
 * Possibili prossime destinazioni: gli archi del finale partono da Milano
 * verso questi punti (in ordine casuale).
 */
export const DESTINATIONS = [
  { name: 'Parigi', lat: 48.8566, lon: 2.3522 },
  { name: 'Tokyo', lat: 35.6762, lon: 139.6503 },
  { name: 'New York', lat: 40.7128, lon: -74.006 },
  { name: 'Reykjavík', lat: 64.1466, lon: -21.9426 },
  { name: 'Città del Capo', lat: -33.9249, lon: 18.4241 },
  { name: 'Rio de Janeiro', lat: -22.9068, lon: -43.1729 },
  { name: 'Sydney', lat: -33.8688, lon: 151.2093 },
  { name: 'Bali', lat: -8.4095, lon: 115.1889 },
  { name: 'Santorini', lat: 36.3932, lon: 25.4615 },
  { name: 'Marrakech', lat: 31.6295, lon: -7.9811 },
  { name: 'Kyoto', lat: 35.0116, lon: 135.7681 },
  { name: 'Lapponia', lat: 68.0, lon: 25.0 },
  { name: 'Buenos Aires', lat: -34.6037, lon: -58.3816 },
  { name: 'Lisbona', lat: 38.7223, lon: -9.1393 },
  { name: 'Il Cairo', lat: 30.0444, lon: 31.2357 },
  { name: 'San Francisco', lat: 37.7749, lon: -122.4194 },
  { name: 'Maldive', lat: 3.2028, lon: 73.2207 },
  { name: 'Cape Cod', lat: 41.6688, lon: -70.2962 },
];

/** Configurazione Supabase letta dalle variabili d'ambiente di Vite. */
export const SUPABASE_CONFIG = {
  url: import.meta.env.VITE_SUPABASE_URL || '',
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  bucket: import.meta.env.VITE_SUPABASE_BUCKET || '',
  folder: (import.meta.env.VITE_SUPABASE_FOLDER || '').replace(/^\/+|\/+$/g, ''),
};

export const DEG = Math.PI / 180;
