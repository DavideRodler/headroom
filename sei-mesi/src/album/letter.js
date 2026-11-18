/**
 * La lettera sulla copertina dell'album.
 *
 * Una busta con sigillo di ceralacca è appoggiata sulla copertina: finché non
 * la si tocca l'album resta chiuso. Al tocco il lembo si apre, la lettera
 * scivola fuori e si apre a tutto schermo (in HTML, così si legge bene);
 * chiudendola la busta sparisce e si può sfogliare l'album.
 */
import * as THREE from 'three';
import gsap from 'gsap';
import { LETTER } from '../config.js';
import { reducedMotion } from '../quality.js';
import { seeded } from './layout.js';

// Misure della busta (unità del libro: larghezza pagina = 1)
const EW = 0.6;
const EH = 0.4;
// il foglio sta tutto dentro la busta finché non esce
const SW = EW * 0.9;
const SH = EH * 0.94;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function texture(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Carta avorio con grana leggera. */
function paper(g, w, h, base = '#f4e8d6', seed = 3) {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  const rnd = seeded(seed);
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * 10;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n * 0.9;
  }
  g.putImageData(img, 0, 0);
}

function heartPath(g, cx, cy, size) {
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
  g.restore();
}

/** Retro della busta: le pieghe laterali e in basso, e il nome. */
function makeEnvelopeBody() {
  const w = 768;
  const h = Math.round((w * EH) / EW);
  const c = canvas(w, h);
  const g = c.getContext('2d');
  paper(g, w, h, '#f3e5d0', 11);
  // pieghe: due triangoli laterali e quello in basso, appena più scuri
  g.fillStyle = 'rgba(120,80,45,0.07)';
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(w * 0.5, h * 0.56);
  g.lineTo(0, h);
  g.closePath();
  g.fill();
  g.beginPath();
  g.moveTo(w, 0);
  g.lineTo(w * 0.5, h * 0.56);
  g.lineTo(w, h);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(120,80,45,0.04)';
  g.beginPath();
  g.moveTo(0, h);
  g.lineTo(w * 0.5, h * 0.5);
  g.lineTo(w, h);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(110,70,40,0.22)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, h);
  g.lineTo(w * 0.5, h * 0.5);
  g.lineTo(w, h);
  g.stroke();
  // nome in basso
  g.fillStyle = 'rgba(92,22,39,0.85)';
  g.font = `${Math.round(h * 0.17)}px "Great Vibes", cursive`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(LETTER.envelope, w * 0.5, h * 0.82);
  // bordo
  g.strokeStyle = 'rgba(110,70,40,0.25)';
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, w - 3, h - 3);
  return texture(c);
}

/** Lembo triangolare con il sigillo di ceralacca a cuore. */
function makeFlap() {
  const w = 768;
  const h = Math.round((w * EH * 0.62) / EW);
  const c = canvas(w, h);
  const g = c.getContext('2d');
  g.save();
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(w, 0);
  g.lineTo(w * 0.5, h);
  g.closePath();
  g.clip();
  paper(g, w, h, '#f6eadb', 17);
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, 'rgba(120,80,45,0)');
  grd.addColorStop(1, 'rgba(120,80,45,0.10)');
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  g.restore();
  g.strokeStyle = 'rgba(110,70,40,0.25)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(w * 0.5, h);
  g.lineTo(w, 0);
  g.stroke();

  // ceralacca
  const sx = w * 0.5;
  const sy = h * 0.86;
  const r = h * 0.2;
  const wax = g.createRadialGradient(sx - r * 0.3, sy - r * 0.3, r * 0.1, sx, sy, r * 1.1);
  wax.addColorStop(0, '#d94a6a');
  wax.addColorStop(0.6, '#a5223f');
  wax.addColorStop(1, '#6e1028');
  g.fillStyle = wax;
  g.beginPath();
  // bordo irregolare, come la cera colata
  const rnd = seeded(29);
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const rr = r * (1 + (rnd() - 0.5) * 0.12);
    const x = sx + Math.cos(a) * rr;
    const y = sy + Math.sin(a) * rr;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(60,5,20,0.35)';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(sx, sy, r * 0.72, 0, Math.PI * 2);
  g.stroke();
  heartPath(g, sx, sy + r * 0.05, r * 0.7);
  g.fillStyle = 'rgba(255,190,205,0.55)';
  g.fill();
  const tex = texture(c);
  return { tex, h: (EH * 0.62) };
}

/** La lettera che scivola fuori dalla busta. */
function makeLetterSheet() {
  const w = 640;
  const h = Math.round((w * SH) / SW);
  const c = canvas(w, h);
  const g = c.getContext('2d');
  paper(g, w, h, '#fbf4e8', 23);
  g.strokeStyle = 'rgba(160,120,90,0.18)';
  g.lineWidth = 2;
  for (let y = h * 0.34; y < h * 0.95; y += h * 0.11) {
    g.beginPath();
    g.moveTo(w * 0.1, y);
    g.lineTo(w * 0.9, y);
    g.stroke();
  }
  g.fillStyle = 'rgba(92,22,39,0.85)';
  g.font = `${Math.round(w * 0.1)}px "Great Vibes", cursive`;
  g.textBaseline = 'middle';
  g.fillText(LETTER.greeting, w * 0.1, h * 0.17);
  return texture(c);
}

export class Letter {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'letter';

    const mat = (map, extra = {}) =>
      new THREE.MeshStandardMaterial({ map, roughness: 0.85, side: THREE.DoubleSide, ...extra });

    // foglio (dietro alla busta, sbuca dall'alto quando esce)
    this.sheet = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), mat(makeLetterSheet()));
    this.sheetRest = -EH * 0.02;
    this.sheet.position.set(0, this.sheetRest, 0.002);
    this.group.add(this.sheet);

    // corpo della busta
    this.body = new THREE.Mesh(new THREE.PlaneGeometry(EW, EH), mat(makeEnvelopeBody()));
    this.body.position.z = 0.004;
    this.group.add(this.body);

    // lembo: incernierato sul bordo superiore
    const flap = makeFlap();
    const flapGeo = new THREE.PlaneGeometry(EW, flap.h);
    flapGeo.translate(0, -flap.h / 2, 0);
    this.flapPivot = new THREE.Group();
    this.flapPivot.position.set(0, EH / 2, 0.006);
    this.flap = new THREE.Mesh(flapGeo, mat(flap.tex, { transparent: true, alphaTest: 0.5 }));
    this.flapPivot.add(this.flap);
    this.group.add(this.flapPivot);

    // area da toccare, più grande della busta (invisibile)
    this.hit = new THREE.Mesh(
      new THREE.PlaneGeometry(EW * 1.35, EH * 1.6),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
    );
    this.hit.position.z = 0.01;
    this.group.add(this.hit);

    this.group.traverse((o) => (o.renderOrder = 61));
    this.raycaster = new THREE.Raycaster();
    this.state = 'closed'; // closed → opening → open → gone
    this.#bindOverlay();
  }

  /** Appoggia la busta sulla copertina (sotto al titolo, un po' storta). */
  attachTo(coverMesh, coverThickness) {
    coverMesh.add(this.group);
    this.group.position.set(0.02, -0.34, coverThickness / 2 + 0.002);
    this.group.rotation.set(0, 0, 0.05);
    this.baseScale = 1;
  }

  get pending() {
    return this.state !== 'gone';
  }

  /** Il punto toccato (coordinate schermo normalizzate) è sulla busta? */
  hitTest(ndcX, ndcY, camera) {
    if (this.state !== 'closed' || !this.group.visible) return false;
    this.raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
    return this.raycaster.intersectObject(this.hit, false).length > 0;
  }

  /** Piccolo "saltello" per dire: tocca qui. */
  nudge() {
    if (this.state !== 'closed' || this._nudging) return;
    this._nudging = true;
    gsap.fromTo(
      this.group.rotation,
      { z: 0.05 },
      {
        z: 0.05,
        keyframes: [{ z: 0.11 }, { z: -0.02 }, { z: 0.08 }, { z: 0.05 }],
        duration: 0.6,
        ease: 'power1.inOut',
        onComplete: () => (this._nudging = false),
      },
    );
  }

  /** Apre la busta e poi la lettera a tutto schermo. */
  open(onOpened) {
    if (this.state !== 'closed') return;
    this.state = 'opening';
    const quick = reducedMotion ? 0.35 : 1;
    const tl = gsap.timeline({
      onComplete: () => {
        this.state = 'open';
        this.#showOverlay();
        onOpened?.();
      },
    });
    tl.to(this.flapPivot.rotation, { x: -Math.PI * 0.92, duration: 0.6 * quick, ease: 'power2.inOut' });
    tl.to(this.flapPivot.position, { z: 0.001, duration: 0.01 }, '>-0.15');
    tl.to(this.sheet.position, { y: EH * 0.62, z: 0.008, duration: 0.7 * quick, ease: 'power2.out' }, '>-0.05');
    tl.to(this.group.scale, { x: 1.08, y: 1.08, z: 1, duration: 0.5 * quick, ease: 'power2.out' }, '<');
  }

  /** Dopo aver letto: la busta scivola via e libera la copertina. */
  close(onClosed) {
    this.#hideOverlay(() => {
      gsap.to(this.group.position, { y: -0.95, duration: reducedMotion ? 0.3 : 0.8, ease: 'power2.in' });
      gsap.to(this.group.scale, {
        x: 0.6,
        y: 0.6,
        duration: reducedMotion ? 0.3 : 0.8,
        ease: 'power2.in',
        onComplete: () => {
          this.group.visible = false;
          this.state = 'gone';
          onClosed?.();
        },
      });
    });
  }

  /** Torna come all'inizio (per "Ricomincia"). */
  reset() {
    gsap.killTweensOf([this.group.position, this.group.scale, this.group.rotation, this.flapPivot.rotation, this.flapPivot.position, this.sheet.position]);
    this.state = 'closed';
    this.group.visible = true;
    this.group.position.y = -0.34;
    this.group.scale.setScalar(1);
    this.group.rotation.z = 0.05;
    this.flapPivot.rotation.x = 0;
    this.flapPivot.position.z = 0.006;
    this.sheet.position.set(0, this.sheetRest, 0.002);
    this.overlay.hidden = true;
  }

  /** Respiro leggero per attirare lo sguardo. */
  update(time) {
    if (this.state !== 'closed' || reducedMotion) return;
    const s = 1 + Math.sin(time * 2.2) * 0.018;
    this.group.scale.set(s, s, 1);
  }

  /* --------------------------------------------------------- testo HTML */

  #bindOverlay() {
    this.overlay = document.getElementById('letter');
    this.paperEl = this.overlay.querySelector('.letter-paper');
    const body = this.overlay.querySelector('.letter-body');
    this.overlay.querySelector('.letter-greeting').textContent = LETTER.greeting;
    body.replaceChildren(
      ...LETTER.paragraphs.map((t) => {
        const p = document.createElement('p');
        p.textContent = t;
        return p;
      }),
    );
    this.overlay.querySelector('.letter-closing').textContent = LETTER.closing;
    this.overlay.querySelector('.letter-sign').textContent = LETTER.signature;
    this.closeBtn = document.getElementById('letter-close');
    this.closeBtn.addEventListener('click', () => this.onCloseRequest?.());
    // sulla lettera lo scroll serve per leggere: non deve arrivare all'album
    for (const ev of ['wheel', 'touchmove', 'pointerdown']) {
      this.overlay.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    }
  }

  #showOverlay() {
    this.overlay.hidden = false;
    this.paperEl.scrollTop = 0;
    gsap.fromTo(this.overlay, { autoAlpha: 0 }, { autoAlpha: 1, duration: reducedMotion ? 0.2 : 0.6, ease: 'power2.out' });
    gsap.fromTo(
      this.paperEl,
      { y: 60, scale: 0.88, rotate: -2 },
      { y: 0, scale: 1, rotate: -0.6, duration: reducedMotion ? 0.2 : 0.9, ease: 'power3.out' },
    );
    setTimeout(() => this.closeBtn.focus({ preventScroll: true }), 400);
  }

  #hideOverlay(done) {
    gsap.to(this.paperEl, { y: 40, scale: 0.92, duration: reducedMotion ? 0.2 : 0.5, ease: 'power2.in' });
    gsap.to(this.overlay, {
      autoAlpha: 0,
      duration: reducedMotion ? 0.2 : 0.5,
      ease: 'power2.in',
      onComplete: () => {
        this.overlay.hidden = true;
        done?.();
      },
    });
  }
}
