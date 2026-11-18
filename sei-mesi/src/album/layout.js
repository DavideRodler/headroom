/**
 * Impaginazione: decide quali foto vanno su ogni pagina e dove.
 *
 * Regola: una foto per pagina; due foto orizzontali consecutive condividono
 * la stessa pagina (una sopra l'altra). Il numero di pagine è sempre pari,
 * perché ogni foglio ha un fronte e un retro.
 */

const LANDSCAPE = 1.15;

/** Pseudo-casuale deterministico (stessa impaginazione a ogni visita). */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {{aspect:number}[]} items foto in ordine
 * @returns {{photos:number[], decor?:string}[]} pagine
 */
export function paginate(items) {
  const pages = [];
  let i = 0;
  while (i < items.length) {
    const a = items[i];
    const b = items[i + 1];
    if (b && a.aspect >= LANDSCAPE && b.aspect >= LANDSCAPE) {
      pages.push({ photos: [i, i + 1] });
      i += 2;
    } else {
      pages.push({ photos: [i] });
      i += 1;
    }
  }
  if (pages.length % 2 === 1) pages.push({ photos: [], decor: 'heart' });
  return pages;
}

/**
 * Posizione delle polaroid sulla pagina, in coordinate normalizzate
 * (0..1 sulla larghezza e sull'altezza della pagina).
 * @param {{photos:number[]}} page
 * @param {{aspect:number}[]} items
 * @param {number} pageIndex
 * @param {number} pageAspect larghezza/altezza della pagina
 */
export function placePhotos(page, items, pageIndex, pageAspect) {
  const rnd = seeded(1234 + pageIndex * 97);
  const r = (min, max) => min + rnd() * (max - min);
  const boxes =
    page.photos.length === 2
      ? [
          { cx: 0.5 + r(-0.03, 0.01), cy: 0.27 + r(-0.01, 0.01), w: 0.84, h: 0.44, rot: r(-3, -1) },
          { cx: 0.5 + r(-0.01, 0.03), cy: 0.73 + r(-0.01, 0.01), w: 0.84, h: 0.44, rot: r(1, 3) },
        ]
      : [{ cx: 0.5 + r(-0.015, 0.015), cy: 0.49 + r(-0.01, 0.01), w: 0.82, h: 0.86, rot: r(-2.6, 2.6) }];

  return page.photos.map((idx, k) => {
    const box = boxes[k];
    const aspect = items[idx]?.aspect || 0.75;
    // cornice polaroid: bordi sottili, fascia più alta in basso
    const side = 0.045;
    const bottom = 0.15;
    // larghezza della foto (in unità di larghezza pagina) che fa stare la cornice nel box
    const boxW = box.w;
    const boxH = box.h / pageAspect; // altezza del box in unità di larghezza
    let photoW = boxW / (1 + 2 * side);
    let frameH = photoW / aspect + photoW * (side + bottom);
    if (frameH > boxH) {
      photoW = boxH / (1 / aspect + side + bottom);
      frameH = boxH;
    }
    const frameW = photoW * (1 + 2 * side);
    return {
      index: idx,
      cx: box.cx,
      cy: box.cy,
      rot: box.rot,
      frameW, // unità di larghezza pagina
      frameH,
      photoW,
      photoH: photoW / aspect,
      border: photoW * side,
      tape: rnd() < 0.42 ? { angle: r(-8, 8), hue: rnd() < 0.5 ? 'rose' : 'gold' } : null,
    };
  });
}
