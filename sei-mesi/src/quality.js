/**
 * Rilevamento del dispositivo e livelli di qualità.
 *
 * Su telefono riduciamo texture, geometrie, stelle e post-processing per
 * restare fluidi (obiettivo: 60 fps su un iPhone recente).
 * Per i test si può forzare con ?q=low oppure ?q=high nell'URL.
 */

const params = new URLSearchParams(window.location.search);
const forced = params.get('q');

const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
const mobileUA = /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent);

export const isMobile = forced ? forced === 'low' : coarsePointer || mobileUA;

export const isIOS =
  /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const reducedMotion =
  params.has('calm') || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const HIGH = {
  name: 'high',
  textureSize: '4k',
  maxPixelRatio: 2,
  sphereSegments: [160, 96],
  starCounts: [1600, 2600, 4200],
  multisampling: 4,
  bloomScale: 0.5,
  bloomLevels: 7,
  pageCanvas: [1400, 1904],
  pageSegments: [44, 14],
  pageMipmaps: true,
  pageWindow: 3,
};

const LOW = {
  name: 'low',
  textureSize: '2k',
  maxPixelRatio: 2,
  sphereSegments: [96, 64],
  starCounts: [700, 1100, 1700],
  multisampling: 0,
  bloomScale: 0.4,
  bloomLevels: 5,
  pageCanvas: [1024, 1392],
  pageSegments: [30, 10],
  pageMipmaps: false,
  pageWindow: 2,
};

export const quality = isMobile ? { ...LOW } : { ...HIGH };

/** Pixel ratio effettivo (limitato a 2, eventualmente ridotto a runtime). */
export function targetPixelRatio() {
  return Math.min(window.devicePixelRatio || 1, quality.maxPixelRatio);
}
