/**
 * Tutto ciò che si disegna nei canvas dell'album:
 * carta delle pagine, polaroid con ombra, copertina in pelle con angoli
 * e titolo dorati (mappe colore / rilievo / ruvidità-metallo), risguardi.
 */
import * as THREE from 'three';
import { COVER_TITLE } from '../config.js';
import { placePhotos, seeded } from './layout.js';

/* ------------------------------------------------------------- carta */

let paperCache = null;

/** Base della carta (avorio, grana finissima, bordi appena più scuri). */
function paperBase(w, h) {
  if (paperCache && paperCache.width === w && paperCache.height === h) return paperCache;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#f5ede0';
  g.fillRect(0, 0, w, h);

  // grana
  const rnd = seeded(42);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 9;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n * 0.9;
  }
  g.putImageData(img, 0, 0);

  // fibre leggere
  g.globalAlpha = 0.035;
  g.strokeStyle = '#8a6a4a';
  for (let i = 0; i < 260; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const len = 6 + rnd() * 22;
    const a = rnd() * Math.PI;
    g.lineWidth = 0.6 + rnd();
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  g.globalAlpha = 1;

  // bordo appena ingiallito
  const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(120,80,40,0)');
  v.addColorStop(1, 'rgba(120,80,40,0.10)');
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);

  paperCache = c;
  return c;
}

/** Ombra della piega centrale (lato rilegatura). */
function drawGutter(g, w, h, spineOnLeft) {
  const gw = w * 0.11;
  const grd = spineOnLeft
    ? g.createLinearGradient(0, 0, gw, 0)
    : g.createLinearGradient(w, 0, w - gw, 0);
  grd.addColorStop(0, 'rgba(70,45,25,0.30)');
  grd.addColorStop(0.35, 'rgba(70,45,25,0.10)');
  grd.addColorStop(1, 'rgba(70,45,25,0)');
  g.fillStyle = grd;
  g.fillRect(spineOnLeft ? 0 : w - gw, 0, gw, h);
}

/** Pagina vuota (segnaposto finché la foto non è pronta). */
export function blankPageCanvas(w, h, spineOnLeft = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.drawImage(paperBase(w, h), 0, 0);
  drawGutter(g, w, h, spineOnLeft);
  return c;
}

/** Piccolo cuore dorato disegnato (per la pagina decorativa e il retro). */
function drawHeart(g, cx, cy, size, fill) {
  g.save();
  g.translate(cx, cy);
  g.scale(size / 2, size / 2);
  g.beginPath();
  g.moveTo(0, -0.42);
  g.bezierCurveTo(-0.08, -0.78, -0.62, -0.95, -0.9, -0.6);
  g.bezierCurveTo(-1.18, -0.22, -0.92, 0.2, -0.55, 0.5);
  g.bezierCurveTo(-0.3, 0.7, -0.08, 0.85, 0, 1.0);
  g.bezierCurveTo(0.08, 0.85, 0.3, 0.7, 0.55, 0.5);
  g.bezierCurveTo(0.92, 0.2, 1.18, -0.22, 0.9, -0.6);
  g.bezierCurveTo(0.62, -0.95, 0.08, -0.78, 0, -0.42);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  g.restore();
}

/**
 * Compone una pagina con le sue polaroid.
 * @param {HTMLCanvasElement} canvas canvas di destinazione (riusato)
 * @param {object} page {photos, decor}
 * @param {number} pageIndex
 * @param {boolean} spineOnLeft fronte del foglio (pagina destra) = rilegatura a sinistra
 * @param {import('../photos.js').PhotoLibrary} photos
 */
export async function composePage(canvas, page, pageIndex, spineOnLeft, photos) {
  const w = canvas.width;
  const h = canvas.height;
  const placements = placePhotos(page, photos.items, pageIndex, w / h);

  // decodifica prima (in parallelo), poi disegna tutto in un colpo
  const bitmaps = await Promise.all(placements.map((p) => photos.bitmap(p.index).catch(() => null)));

  const g = canvas.getContext('2d');
  g.drawImage(paperBase(w, h), 0, 0);

  if (page.decor === 'heart') {
    drawHeart(g, w / 2, h / 2, w * 0.12, 'rgba(201,150,72,0.85)');
    drawHeart(g, w / 2, h / 2, w * 0.12, 'rgba(255,111,156,0.15)');
  }

  placements.forEach((p, k) => {
    const bmp = bitmaps[k];
    const fw = p.frameW * w;
    const fh = p.frameH * w;
    const pw = p.photoW * w;
    const ph = p.photoH * w;
    const b = p.border * w;
    g.save();
    g.translate(p.cx * w, p.cy * h);
    g.rotate((p.rot * Math.PI) / 180);

    // cornice bianca con ombra morbida
    g.shadowColor = 'rgba(55,35,20,0.38)';
    g.shadowBlur = w * 0.028;
    g.shadowOffsetY = w * 0.011;
    g.shadowOffsetX = w * 0.004;
    g.fillStyle = '#fdfbf6';
    g.fillRect(-fw / 2, -fh / 2, fw, fh);
    g.shadowColor = 'transparent';

    // leggera sfumatura della cornice (carta fotografica)
    const sheen = g.createLinearGradient(-fw / 2, -fh / 2, fw / 2, fh / 2);
    sheen.addColorStop(0, 'rgba(255,255,255,0.0)');
    sheen.addColorStop(1, 'rgba(180,165,150,0.12)');
    g.fillStyle = sheen;
    g.fillRect(-fw / 2, -fh / 2, fw, fh);

    // foto
    const px = -fw / 2 + b;
    const py = -fh / 2 + b;
    if (bmp) {
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.drawImage(bmp, px, py, pw, ph);
      bmp.close?.();
    } else {
      g.fillStyle = '#e8ddd0';
      g.fillRect(px, py, pw, ph);
      drawHeart(g, px + pw / 2, py + ph / 2, pw * 0.12, 'rgba(255,111,156,0.35)');
    }
    // velatura interna (dà profondità alla stampa)
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    g.lineWidth = Math.max(1, w * 0.0015);
    g.strokeRect(px, py, pw, ph);

    // nastro adesivo decorativo su alcune foto
    if (p.tape) {
      g.save();
      g.translate(0, -fh / 2);
      g.rotate((p.tape.angle * Math.PI) / 180);
      const tw = fw * 0.3;
      const th = fw * 0.075;
      g.fillStyle = p.tape.hue === 'rose' ? 'rgba(255,170,190,0.55)' : 'rgba(236,206,150,0.55)';
      g.fillRect(-tw / 2, -th / 2, tw, th);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(-tw / 2, -th / 2, tw, th * 0.35);
      g.restore();
    }
    g.restore();
  });

  drawGutter(g, w, h, spineOnLeft);
}

/* ------------------------------------------------------------- copertina */

const GOLD_STOPS = [
  [0, '#fff1c4'],
  [0.35, '#e6bd6e'],
  [0.6, '#b8862f'],
  [1, '#f3d48a'],
];

function goldGradient(g, x0, y0, x1, y1) {
  const grd = g.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of GOLD_STOPS) grd.addColorStop(o, c);
  return grd;
}

/**
 * Disegna le stesse forme su tre canvas:
 *  - color: pelle bordeaux + oro
 *  - bump: grana della pelle, oro impresso (più basso) e angoli in rilievo
 *  - rm: G = ruvidità, B = metallo (convenzione di three.js)
 */
function makeLeatherSet(w, h, seed) {
  const make = () => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };
  const color = make();
  const bump = make();
  const rm = make();
  const gc = color.getContext('2d');
  const gb = bump.getContext('2d');
  const gr = rm.getContext('2d');
  const rnd = seeded(seed);

  // base pelle
  const base = gc.createRadialGradient(w * 0.45, h * 0.4, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.8);
  base.addColorStop(0, '#5c1627');
  base.addColorStop(1, '#2c0810');
  gc.fillStyle = base;
  gc.fillRect(0, 0, w, h);
  gb.fillStyle = 'rgb(128,128,128)';
  gb.fillRect(0, 0, w, h);
  gr.fillStyle = 'rgb(0,195,0)'; // ruvidità ~0.76, metallo 0
  gr.fillRect(0, 0, w, h);

  // grana della pelle: tante piccole "celle"
  const cells = Math.round((w * h) / 90);
  for (let i = 0; i < cells; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 1 + rnd() * 2.6;
    const v = rnd();
    gb.fillStyle = `rgba(${v < 0.5 ? '0,0,0' : '255,255,255'},${0.12 + rnd() * 0.12})`;
    gb.beginPath();
    gb.arc(x, y, r, 0, Math.PI * 2);
    gb.fill();
    if (i % 3 === 0) {
      gc.fillStyle = `rgba(${v < 0.5 ? '20,0,5' : '140,60,80'},${0.05 + rnd() * 0.05})`;
      gc.beginPath();
      gc.arc(x, y, r * 1.4, 0, Math.PI * 2);
      gc.fill();
    }
  }
  // macchie morbide (pelle vera non è uniforme)
  for (let i = 0; i < 26; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = w * (0.08 + rnd() * 0.2);
    const grd = gc.createRadialGradient(x, y, 0, x, y, r);
    const dark = rnd() < 0.5;
    grd.addColorStop(0, dark ? 'rgba(25,0,8,0.12)' : 'rgba(150,70,90,0.08)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    gc.fillStyle = grd;
    gc.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return { color, bump, rm, gc, gb, gr, w, h };
}

/** Applica una forma "dorata" ai tre canvas (oro lucido, impresso o in rilievo). */
function gilt(set, drawPath, { relief = -60, fill = true, stroke = 0 } = {}) {
  const { gc, gb, gr, w, h } = set;
  const apply = (g, style) => {
    g.save();
    drawPath(g);
    if (fill) {
      g.fillStyle = style;
      g.fill();
    }
    if (stroke) {
      g.lineWidth = stroke;
      g.strokeStyle = style;
      g.stroke();
    }
    g.restore();
  };
  apply(gc, goldGradient(gc, 0, 0, w, h));
  const b = Math.max(0, Math.min(255, 128 + relief));
  apply(gb, `rgb(${b},${b},${b})`);
  apply(gr, 'rgb(0,110,255)'); // ruvidità ~0.43, metallo 1
}

function cornerPath(corner, w, h, size) {
  return (g) => {
    g.beginPath();
    const [x, y, sx, sy] = {
      tl: [0, 0, 1, 1],
      tr: [w, 0, -1, 1],
      bl: [0, h, 1, -1],
      br: [w, h, -1, -1],
    }[corner];
    g.moveTo(x, y);
    g.lineTo(x + sx * size, y);
    g.quadraticCurveTo(x + sx * size * 0.55, y + sy * size * 0.45, x, y + sy * size);
    g.closePath();
  };
}

function framePath(w, h, inset, radius) {
  return (g) => {
    const x = inset;
    const y = inset;
    const ww = w - inset * 2;
    const hh = h - inset * 2;
    g.beginPath();
    g.roundRect(x, y, ww, hh, radius);
  };
}

/** Testo dorato impresso: disegnato direttamente sui tre canvas. */
function giltText(set, text, x, y, font, relief = -55) {
  const { gc, gb, gr, w, h } = set;
  const draw = (g, style, shadow) => {
    g.save();
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (shadow) {
      g.shadowColor = 'rgba(20,0,6,0.65)';
      g.shadowBlur = w * 0.006;
      g.shadowOffsetY = w * 0.003;
    }
    g.fillStyle = style;
    g.fillText(text, x, y);
    g.restore();
  };
  draw(gc, goldGradient(gc, x - w * 0.3, y - h * 0.04, x + w * 0.3, y + h * 0.04), true);
  const b = 128 + relief;
  draw(gb, `rgb(${b},${b},${b})`);
  draw(gr, 'rgb(0,100,255)');
}

/** Ornamento: due svolazzi e un cuoricino tra le righe del titolo. */
function flourish(set, cx, cy, span) {
  const line = (dir) => (g) => {
    g.beginPath();
    g.moveTo(cx + dir * span * 0.08, cy);
    g.bezierCurveTo(cx + dir * span * 0.3, cy - span * 0.05, cx + dir * span * 0.42, cy + span * 0.05, cx + dir * span * 0.62, cy);
    g.lineCap = 'round';
  };
  gilt(set, line(-1), { fill: false, stroke: Math.max(2, set.w * 0.004), relief: -40 });
  gilt(set, line(1), { fill: false, stroke: Math.max(2, set.w * 0.004), relief: -40 });
  const heart = (g) => {
    g.beginPath();
    const s = span * 0.035;
    g.translate(cx, cy);
    g.scale(s, s);
    g.moveTo(0, -0.42);
    g.bezierCurveTo(-0.08, -0.78, -0.62, -0.95, -0.9, -0.6);
    g.bezierCurveTo(-1.18, -0.22, -0.92, 0.2, -0.55, 0.5);
    g.bezierCurveTo(-0.3, 0.7, -0.08, 0.85, 0, 1.0);
    g.bezierCurveTo(0.08, 0.85, 0.3, 0.7, 0.55, 0.5);
    g.bezierCurveTo(0.92, 0.2, 1.18, -0.22, 0.9, -0.6);
    g.bezierCurveTo(0.62, -0.95, 0.08, -0.78, 0, -0.42);
    g.closePath();
  };
  gilt(set, heart, { relief: -45 });
}

function toTextures(set, anisotropy) {
  const map = new THREE.CanvasTexture(set.color);
  map.colorSpace = THREE.SRGBColorSpace;
  const bump = new THREE.CanvasTexture(set.bump);
  const rm = new THREE.CanvasTexture(set.rm);
  for (const t of [map, bump, rm]) t.anisotropy = anisotropy;
  return { map, bump, rm };
}

/** Copertina anteriore con titolo calligrafico. */
export function makeFrontCover(w, h, anisotropy) {
  const set = makeLeatherSet(w, h, 7);
  const inset = w * 0.075;
  gilt(set, framePath(w, h, inset, w * 0.02), { fill: false, stroke: Math.max(2, w * 0.0045), relief: -50 });
  gilt(set, framePath(w, h, inset + w * 0.018, w * 0.014), { fill: false, stroke: Math.max(1, w * 0.002), relief: -40 });

  const corner = w * 0.16;
  for (const c of ['tl', 'tr', 'bl', 'br']) gilt(set, cornerPath(c, w, h, corner), { relief: 90 });

  const [line1, line2] = COVER_TITLE;
  const f1 = Math.round(w * 0.105);
  const f2 = Math.round(w * 0.118);
  giltText(set, line1, w / 2, h * 0.39, `${f1}px "Allura", "Great Vibes", cursive`);
  flourish(set, w / 2, h * 0.47, w * 0.62);
  giltText(set, line2, w / 2, h * 0.555, `${f2}px "Allura", "Great Vibes", cursive`);

  return toTextures(set, anisotropy);
}

/** Copertina posteriore: pelle, cornice e un piccolo cuore. */
export function makeBackCover(w, h, anisotropy) {
  const set = makeLeatherSet(w, h, 19);
  const inset = w * 0.075;
  gilt(set, framePath(w, h, inset, w * 0.02), { fill: false, stroke: Math.max(2, w * 0.0045), relief: -50 });
  const corner = w * 0.16;
  for (const c of ['tl', 'tr', 'bl', 'br']) gilt(set, cornerPath(c, w, h, corner), { relief: 90 });
  const heart = (g) => {
    g.beginPath();
    const s = w * 0.05;
    g.translate(w / 2, h / 2);
    g.scale(s, s);
    g.moveTo(0, -0.42);
    g.bezierCurveTo(-0.08, -0.78, -0.62, -0.95, -0.9, -0.6);
    g.bezierCurveTo(-1.18, -0.22, -0.92, 0.2, -0.55, 0.5);
    g.bezierCurveTo(-0.3, 0.7, -0.08, 0.85, 0, 1.0);
    g.bezierCurveTo(0.08, 0.85, 0.3, 0.7, 0.55, 0.5);
    g.bezierCurveTo(0.92, 0.2, 1.18, -0.22, 0.9, -0.6);
    g.bezierCurveTo(0.62, -0.95, 0.08, -0.78, 0, -0.42);
    g.closePath();
  };
  gilt(set, heart, { relief: -50 });
  return toTextures(set, anisotropy);
}

/** Risguardo (interno copertina): carta rosa antico con piccoli cuori dorati. */
export function makeEndpaper(w, h, anisotropy) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const base = g.createLinearGradient(0, 0, w, h);
  base.addColorStop(0, '#e9c7c4');
  base.addColorStop(1, '#ddb2b4');
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  const rnd = seeded(5);
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 8;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const step = w / 7;
  for (let y = step / 2, row = 0; y < h + step; y += step * 0.86, row++) {
    for (let x = (row % 2 ? step / 2 : 0); x < w + step; x += step) {
      drawHeart(g, x, y, step * 0.13, 'rgba(184,134,47,0.55)');
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

/** Bordo dei fogli (blocco pagine visto di lato). */
export function makePageEdgeTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const g = c.getContext('2d');
  for (let y = 0; y < 64; y++) {
    const v = y % 4 === 0 ? 205 : 238;
    g.fillStyle = `rgb(${v},${v - 6},${v - 18})`;
    g.fillRect(0, y, 4, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

