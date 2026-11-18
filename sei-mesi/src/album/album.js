/**
 * L'album fotografico 3D.
 *
 * Struttura: copertina rigida (pelle e oro) + fogli che si piegano + retro.
 * Vive nello spazio della camera, così può nascere dal punto di Milano e
 * poi riempire lo schermo a qualsiasi aspect ratio.
 *
 * Tutto lo stato visivo dipende da un solo numero, `p`: la posizione lungo
 * la sequenza di "viste" (copertina, doppie pagine o pagine singole su
 * telefono in verticale, retro). Trascinare, la rotellina e le frecce
 * cambiano `p`; da `p` si ricavano quali fogli sono girati e di quanto.
 */
import * as THREE from 'three';
import gsap from 'gsap';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Leaf } from './pageFlip.js';
import { paginate } from './layout.js';
import {
  composePage,
  blankPageCanvas,
  makeFrontCover,
  makeBackCover,
  makeEndpaper,
  makePageEdgeTexture,
} from './pageTextures.js';
import { quality, isMobile, reducedMotion } from '../quality.js';

/* Misure del libro (unità del libro: larghezza pagina = 1) */
const W = 1;
const H = 1.36;
const EPS = 0.0055; // spessore di un foglio
const COVER_T = 0.03; // spessore della copertina rigida
const COVER_OVER_X = 0.035; // la copertina sporge un po' oltre le pagine
const COVER_OVER_Y = 0.04;
const DEPTH = 0.12; // distanza dell'album dalla camera

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (t) => t * t * (3 - 2 * t);

const DIM_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
// Sfondo che si abbassa dietro all'album, con un alone caldo al centro
const DIM_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  uniform float uAspect;
  varying vec2 vUv;
  void main() {
    vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
    float r = length(q);
    vec3 col = mix(vec3(0.12, 0.05, 0.09), vec3(0.01, 0.015, 0.045), smoothstep(0.0, 0.75, r));
    float a = uOpacity * mix(0.72, 0.96, smoothstep(0.05, 0.85, r));
    gl_FragColor = vec4(col, a);
  }
`;

export class Album {
  constructor({ camera, renderer, photos, state, globe, pointer }) {
    this.camera = camera;
    this.renderer = renderer;
    this.photos = photos;
    this.state = state;
    this.globe = globe;
    this.pointer = pointer;
    this.onExit = null;

    this.p = 0;
    this.active = false;
    this.views = [];
    this.items = [];
    this.leaves = [];
    this.pages = [];
    this.mode = this.#detectMode();
    this.fit = { s: 0.05, y: 0, pagePx: 300 };

    // Gerarchia: root (nascita) → tilt (mouse/telefono) → pan (centratura) → book
    this.root = new THREE.Group();
    this.root.name = 'album';
    this.root.visible = false;
    this.tilt = new THREE.Group();
    this.pan = new THREE.Group();
    this.book = new THREE.Group();
    this.root.add(this.tilt);
    this.tilt.add(this.pan);
    this.pan.add(this.book);
    camera.add(this.root);

    this.#buildLights();
    this.#buildBackdrop();

    this.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // DOM
    this.hit = document.getElementById('album-hit');
    this.ui = document.getElementById('album-ui');
    this.hintEl = document.getElementById('album-hint');
    this.counterEl = document.getElementById('page-counter');
    this.errorEl = document.getElementById('photo-error');
    document.getElementById('photo-retry').addEventListener('click', () => this.#retryPhotos());

    this.#bindInput();
  }

  /* ================================================================ build */

  #buildLights() {
    const key = new THREE.DirectionalLight(0xfff0e0, 2.7);
    key.position.set(-0.22, 0.32, 0.18);
    const target = new THREE.Object3D();
    target.position.set(0, 0, -DEPTH);
    key.target = target;
    const fill = new THREE.DirectionalLight(0xffd6e2, 0.7);
    fill.position.set(0.3, -0.15, 0.1);
    fill.target = target;
    this.camera.add(key, fill, target);
    this.hemi = new THREE.HemisphereLight(0xfff3ea, 0x3a2030, 1.05);
    this.camera.add(this.hemi);
    this.lights = [key, fill, this.hemi];
  }

  #buildBackdrop() {
    this.dim = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({
        vertexShader: DIM_VERTEX,
        fragmentShader: DIM_FRAGMENT,
        uniforms: { uOpacity: { value: 0 }, uAspect: { value: 1 } },
        transparent: true,
        depthWrite: false,
      }),
    );
    // dietro all'album (che è opaco e lo copre), davanti alla Terra
    this.dim.position.z = -0.2;
    this.dim.renderOrder = 50;
    this.dim.visible = false;
    this.camera.add(this.dim);
    // l'album va disegnato dopo il velo scuro
    this.root.traverse((o) => (o.renderOrder = 60));
  }

  /** Copertine, risguardi e materiali condivisi (una volta sola). */
  #buildCovers() {
    const [cw, ch] = isMobile ? [1024, 1392] : [1536, 2088];
    const front = makeFrontCover(cw, ch, this.anisotropy);
    const back = makeBackCover(cw, ch, this.anisotropy);
    const endpaper = makeEndpaper(768, 1044, this.anisotropy);

    const leather = (t) =>
      new THREE.MeshStandardMaterial({
        map: t.map,
        bumpMap: t.bump,
        bumpScale: 1.2,
        roughnessMap: t.rm,
        metalnessMap: t.rm,
        roughness: 1,
        metalness: 1,
        envMap: this.envMap,
        envMapIntensity: 0.55,
      });
    this.mats = {
      front: leather(front),
      back: leather(back),
      endpaper: new THREE.MeshStandardMaterial({ map: endpaper, roughness: 0.85 }),
      edge: new THREE.MeshStandardMaterial({ color: 0x4a1322, roughness: 0.55, envMap: this.envMap, envMapIntensity: 0.4 }),
      block: new THREE.MeshStandardMaterial({ color: 0xf1e7d6, roughness: 0.92, map: makePageEdgeTexture() }),
    };
    this.mats.block.map.repeat.set(1, 6);

    // Segnaposto delle pagine (carta senza foto)
    const [pw, ph] = quality.pageCanvas;
    this.placeholderFront = this.#pageTexture(blankPageCanvas(pw / 4, ph / 4, true), false);
    this.placeholderBack = this.#pageTexture(blankPageCanvas(pw / 4, ph / 4, false), true);
  }

  /** Texture di pagina: il retro è specchiato in UV perché si legge da sinistra. */
  #pageTexture(canvas, isBack) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.anisotropy;
    if (!quality.pageMipmaps) {
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
    }
    if (isBack) {
      tex.repeat.x = -1;
      tex.offset.x = 1;
    }
    return tex;
  }

  /** (Ri)costruisce copertine, fogli e blocchi pagina in base alle foto. */
  #buildBook() {
    // pulizia della versione precedente
    for (const leaf of this.leaves) {
      leaf.dispose();
      leaf.front.material.dispose();
      leaf.back.material.dispose();
    }
    for (const page of this.pages) this.#releasePage(page);
    this.book.clear();

    const ok = !this.photos.error && this.photos.items.length > 0;
    const pageDefs = ok ? paginate(this.photos.items) : [];
    this.pages = pageDefs.map((def, i) => ({ ...def, index: i, tex: null, canvas: null, state: 'empty' }));
    const L = (this.L = this.pages.length / 2);

    const hinge = ((L + 1) * EPS) / 2;
    this.hinge = hinge;
    const cw = W + COVER_OVER_X;
    const ch = H + COVER_OVER_Y * 2;

    // --- copertina anteriore
    const coverGeo = new THREE.BoxGeometry(cw, ch, COVER_T);
    const frontCover = new THREE.Mesh(coverGeo, [
      this.mats.edge, this.mats.edge, this.mats.edge, this.mats.edge, this.mats.front, this.mats.endpaper,
    ]);
    const frontPivot = new THREE.Group();
    frontPivot.position.z = hinge;
    frontCover.position.set(cw / 2 - 0.012, 0, (L + 1) * EPS + COVER_T / 2 - hinge);
    frontPivot.add(frontCover);
    this.book.add(frontPivot);

    // --- retro
    const backCover = new THREE.Mesh(coverGeo, [
      this.mats.edge, this.mats.edge, this.mats.edge, this.mats.edge, this.mats.endpaper, this.mats.back,
    ]);
    const backPivot = new THREE.Group();
    backPivot.position.z = hinge;
    backCover.position.set(cw / 2 - 0.012, 0, -COVER_T / 2 - hinge);
    backPivot.add(backCover);
    this.book.add(backPivot);

    // --- dorso (visibile solo a libro chiuso)
    const r = hinge + COVER_T;
    this.spine = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, ch, 20, 1, true, Math.PI, Math.PI),
      this.mats.edge,
    );
    this.spine.material.side = THREE.DoubleSide;
    this.spine.position.set(-0.012, 0, hinge);
    this.book.add(this.spine);

    // --- blocchi pagina (danno spessore ai fogli fermi)
    const blockGeo = new THREE.BoxGeometry(1, 1, 1);
    blockGeo.translate(0.5, 0, 0.5);
    this.blockR = new THREE.Mesh(blockGeo, this.mats.block);
    this.blockL = new THREE.Mesh(blockGeo, this.mats.block);
    this.book.add(this.blockR, this.blockL);

    // --- fogli
    this.leaves = [];
    for (let j = 0; j < L; j++) {
      const front = new THREE.MeshStandardMaterial({ map: this.placeholderFront, roughness: 0.84, side: THREE.FrontSide });
      const back = new THREE.MeshStandardMaterial({ map: this.placeholderBack, roughness: 0.84, side: THREE.BackSide });
      const leaf = new Leaf(W, H, quality.pageSegments, front, back);
      leaf.curl = reducedMotion ? 0.35 : 1.15;
      leaf.index = j;
      leaf.zRight = (L - j) * EPS;
      leaf.zLeft = (j + 1) * EPS;
      this.book.add(leaf.group);
      this.leaves.push(leaf);
    }

    // Elementi che girano, in ordine: copertina, fogli, retro
    this.items = [
      { kind: 'cover', set: (t) => (frontPivot.rotation.y = -Math.PI * t) },
      ...this.leaves.map((leaf) => ({ kind: 'leaf', set: (t) => leaf.set(t, leaf.zRight, leaf.zLeft) })),
      { kind: 'cover', set: (t) => (backPivot.rotation.y = -Math.PI * t) },
    ];
    this.book.traverse((o) => (o.renderOrder = 60));

    this.#buildViews();
    this.p = clamp(this.p, 0, this.views.length - 1);
    this.#applyP(true);
  }

  #detectMode() {
    return window.innerWidth / window.innerHeight < 0.85 ? 'portrait' : 'landscape';
  }

  /**
   * Sequenza delle viste.
   * - orizzontale: copertina, doppie pagine, retro
   * - verticale: una pagina alla volta (la camera "scorre" tra sinistra e destra)
   */
  #buildViews() {
    const L = this.L;
    const n = L + 2;
    const views = [];
    if (L === 0) {
      views.push({ step: 0, pan: -W / 2 });
    } else if (this.mode === 'landscape') {
      for (let s = 0; s <= n; s++) views.push({ step: s, pan: s === 0 ? -W / 2 : s === n ? W / 2 : 0 });
    } else {
      views.push({ step: 0, pan: -W / 2 });
      for (let s = 1; s <= L + 1; s++) {
        if (s > 1) views.push({ step: s, pan: W / 2, side: 'L' });
        if (s < L + 1) views.push({ step: s, pan: -W / 2, side: 'R' });
      }
      views.push({ step: n, pan: W / 2 });
    }
    this.views = views;
    // in quale tratto gira ciascun elemento
    this.segOfItem = this.items.map((_, i) => {
      for (let k = 0; k < views.length - 1; k++) {
        if (views[k].step === i && views[k + 1].step === i + 1) return k;
      }
      return null;
    });
  }

  /* ============================================================ pagine */

  /** Pagine da tenere pronte attorno alla vista corrente (le altre si liberano). */
  #updatePageWindow() {
    if (!this.L) return;
    const view = this.views[clamp(Math.round(this.p), 0, this.views.length - 1)];
    const center = clamp(view.step - 1, 0, this.L - 1);
    const win = quality.pageWindow;
    const wanted = new Set();
    for (let j = center - win; j <= center + win; j++) {
      if (j < 0 || j >= this.L) continue;
      wanted.add(2 * j);
      wanted.add(2 * j + 1);
    }
    for (const page of this.pages) {
      if (!wanted.has(page.index) && page.state !== 'empty') this.#releasePage(page);
    }
    // dalla più vicina alla più lontana
    const order = [...wanted].sort((a, b) => Math.abs((a >> 1) - center) - Math.abs((b >> 1) - center));
    for (const idx of order) {
      const page = this.pages[idx];
      if (page.state === 'empty') this.#queueCompose(page);
    }
  }

  #queueCompose(page) {
    page.state = 'queued';
    this._composeQueue = this._composeQueue || [];
    this._composeQueue.push(page);
    this.#pumpCompose();
  }

  async #pumpCompose() {
    if (this._composing) return;
    this._composing = true;
    while (this._composeQueue.length) {
      const page = this._composeQueue.shift();
      if (page.state !== 'queued') continue;
      page.state = 'composing';
      const [pw, ph] = quality.pageCanvas;
      const canvas = this.#takeCanvas(pw, ph);
      const isBack = page.index % 2 === 1;
      try {
        await composePage(canvas, page, page.index, !isBack, this.photos);
      } catch (err) {
        console.warn('[album] pagina', page.index, err);
      }
      if (page.state !== 'composing') {
        // nel frattempo è uscita dalla finestra
        this.#giveCanvas(canvas);
        continue;
      }
      const tex = this.#pageTexture(canvas, isBack);
      this.renderer.initTexture(tex); // caricamento sulla GPU adesso, non durante il giro
      page.tex = tex;
      page.canvas = canvas;
      page.state = 'ready';
      const leaf = this.leaves[page.index >> 1];
      if (leaf) (isBack ? leaf.back : leaf.front).material.map = tex;
      if (page._resolve) page._resolve();
    }
    this._composing = false;
  }

  #releasePage(page) {
    if (page.tex) {
      page.tex.dispose();
      page.tex = null;
    }
    if (page.canvas) {
      this.#giveCanvas(page.canvas);
      page.canvas = null;
    }
    const leaf = this.leaves[page.index >> 1];
    if (leaf) {
      const isBack = page.index % 2 === 1;
      (isBack ? leaf.back : leaf.front).material.map = isBack ? this.placeholderBack : this.placeholderFront;
    }
    page.state = 'empty';
  }

  #takeCanvas(w, h) {
    this._pool = this._pool || [];
    const c = this._pool.pop() || document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  #giveCanvas(c) {
    this._pool = this._pool || [];
    if (this._pool.length < 4) this._pool.push(c);
    else c.width = c.height = 0; // libera la memoria
  }

  /** Aspetta che le prime pagine siano pronte. */
  #waitPages(indices) {
    return Promise.all(
      indices
        .map((i) => this.pages[i])
        .filter(Boolean)
        .map((page) =>
          page.state === 'ready'
            ? null
            : new Promise((res) => {
                page._resolve = res;
              }),
        ),
    );
  }

  /* ============================================================ API */

  /** Prepara copertine, fogli e le prime pagine (chiamato durante il caricamento). */
  async prepare() {
    this.#buildCovers();
    this.#buildBook();
    this.onResize();
    this.#updatePageWindow();
    await Promise.race([this.#waitPages([0, 1, 2]), new Promise((r) => setTimeout(r, 15000))]);
  }

  /** L'album è fermo: lo scroll è bloccato, si sfoglia. */
  activate(from) {
    this.active = true;
    this.tween?.kill();
    this.p = from === 'end' ? this.views.length - 1 : 0;
    this.targetP = this.p;
    this.#applyP(true);
    this.hit.classList.add('is-active');
    this.ui.classList.add('is-visible');
    this.#refreshUI(true);
    if (this.photos.error) this.errorEl.hidden = false;
  }

  deactivate() {
    this.active = false;
    this.drag = null;
    this.hit.classList.remove('is-active', 'is-dragging');
    this.ui.classList.remove('is-visible');
    this.errorEl.hidden = true;
  }

  /** "Ricomincia": torna alla copertina chiusa. */
  reset() {
    this.deactivate();
    this.tween?.kill();
    this.p = 0;
    this.targetP = 0;
    this.flipped = false;
    this.#applyP(true);
  }

  onResize() {
    const mode = this.#detectMode();
    if (mode !== this.mode && this.items.length) {
      // mantieni lo stesso punto del libro nel nuovo modo
      const step = this.views[clamp(Math.round(this.p), 0, this.views.length - 1)]?.step ?? 0;
      this.mode = mode;
      this.#buildViews();
      const k = this.views.findIndex((v) => v.step === step);
      this.p = this.targetP = Math.max(0, k);
      this.#applyP(true);
    }
    this.mode = mode;

    // scala per riempire bene lo schermo
    const cam = this.camera;
    const hv = DEPTH * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const hw = hv * cam.aspect;
    let s;
    let y = 0;
    if (mode === 'landscape') {
      s = Math.min((2 * hw * 0.9) / (2 * W + COVER_OVER_X * 2), (2 * hv * 0.78) / (H + COVER_OVER_Y * 2));
      y = hv * 0.035;
    } else {
      s = Math.min((2 * hw * 0.9) / (W + COVER_OVER_X), (2 * hv * 0.76) / (H + COVER_OVER_Y * 2));
      y = hv * 0.04;
    }
    // larghezza di una pagina in pixel (per tradurre il trascinamento)
    const pagePx = ((W * s) / (2 * hw)) * window.innerWidth;
    this.fit = { s, y, pagePx };

    // velo scuro che copre tutto lo schermo
    const dz = -this.dim.position.z;
    const dh = dz * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * 2.2;
    this.dim.scale.set(dh * cam.aspect, dh, 1);
    this.dim.material.uniforms.uAspect.value = cam.aspect;
  }

  /** Posiziona l'album su `p` (anche frazionario): utile per il debug. */
  seek(p) {
    this.tween?.kill();
    this.p = p;
    this.#applyP(true);
  }

  /* ============================================================ stato da p */

  #applyP(force = false) {
    const V = this.views.length;
    const p = this.p;
    const pc = clamp(p, 0, V - 1);
    if (!force && pc === this._lastP) return;
    this._lastP = pc;

    // quanto è girato ciascun elemento
    this.items.forEach((item, i) => {
      const seg = this.segOfItem[i];
      let t;
      if (seg == null) t = this.views[0].step > i ? 1 : 0;
      else t = clamp(pc - seg, 0, 1);
      item.set(t);
      item.t = t;
    });

    // spostamento laterale (centra copertina, doppia pagina o pagina singola)
    const k = Math.min(Math.floor(pc), Math.max(0, V - 2));
    const f = V > 1 ? pc - k : 0;
    const a = this.views[k];
    const b = this.views[Math.min(k + 1, V - 1)];
    const over = p - pc; // "elastico" oltre i bordi
    this.pan.position.x = a.pan + (b.pan - a.pan) * smooth(f) - over * 0.25;

    // dorso: solo a libro chiuso
    const tf = this.items[0]?.t ?? 0;
    const tb = this.items[this.items.length - 1]?.t ?? 0;
    this.spine.visible = tf < 0.5 || tb > 0.5;

    // blocchi pagina sotto i fogli fermi
    const L = this.L;
    let right = 0;
    let left = 0;
    for (let j = 0; j < L; j++) {
      const t = this.items[j + 1].t;
      if (t <= 0) right++;
      else if (t >= 1) left++;
    }
    const topRight = right ? (L - (L - right)) * EPS : 0;
    this.blockR.visible = right > 1;
    this.blockR.scale.set(W - 0.01, H - 0.012, Math.max(1e-4, topRight - EPS * 1.2));
    this.blockR.position.set(0.002, 0, EPS * 0.5);
    this.blockL.visible = left > 1;
    this.blockL.scale.set(-(W - 0.01), H - 0.012, Math.max(1e-4, left * EPS - EPS * 1.2));
    this.blockL.position.set(-0.002, 0, EPS * 0.5);

    this.#updatePageWindow();
    this.#refreshUI();
  }

  /* ============================================================ navigazione */

  /** Avanti/indietro di una vista (o uscita dall'album ai bordi). */
  step(dir) {
    if (!this.active) return;
    const V = this.views.length;
    const base = this.tween?.isActive() ? this.targetP : Math.round(this.p);
    const target = base + dir;
    if (target > V - 1) return this.#exit('forward');
    if (target < 0) return this.#exit('backward');
    // dopo l'ultima pagina, chiudere l'album porta subito avanti
    const then = target === V - 1 && dir > 0 ? () => this.#exit('forward') : null;
    this.#animateTo(target, then);
  }

  #animateTo(target, then) {
    this.tween?.kill();
    this.targetP = target;
    const dist = Math.abs(target - this.p);
    if (dist < 0.0005) {
      this.p = target;
      this.#applyP();
      then?.();
      return;
    }
    const duration = reducedMotion ? 0.45 : clamp(0.5 + dist * 0.42, 0.55, 1.5);
    this.tween = gsap.to(this, {
      p: target,
      duration,
      ease: dist > 1.2 ? 'power1.inOut' : 'power2.inOut',
      onUpdate: () => this.#applyP(),
      onComplete: () => {
        this.#markFlipped();
        then?.();
      },
    });
  }

  #exit(direction) {
    if (!this.active) return;
    this.onExit?.(direction);
  }

  #markFlipped() {
    if (Math.round(this.p) > 0 && !this.flipped) {
      this.flipped = true;
      this.#refreshUI(true);
    }
  }

  /* ============================================================ input */

  #bindInput() {
    const hit = this.hit;

    hit.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      try {
        hit.setPointerCapture(e.pointerId);
      } catch {
        /* puntatore già rilasciato */
      }
      this.tween?.kill();
      this.drag = {
        id: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        p0: this.p,
        axis: null,
        samples: [{ t: performance.now(), p: this.p }],
      };
      hit.classList.add('is-dragging');
    });

    hit.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x0;
      const dy = e.clientY - d.y0;
      if (!d.axis && Math.hypot(dx, dy) > 8) d.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      if (!d.axis) return;
      const delta = d.axis === 'x' ? -dx / (this.fit.pagePx * 1.1) : -dy / (window.innerHeight * 0.5);
      const V = this.views.length;
      this.p = clamp(d.p0 + delta, -0.35, V - 1 + 0.35);
      d.samples.push({ t: performance.now(), p: this.p });
      if (d.samples.length > 6) d.samples.shift();
      this.#applyP();
    });

    const end = (e) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      this.drag = null;
      hit.classList.remove('is-dragging');
      const V = this.views.length;

      if (!d.axis) {
        // tocco: metà destra avanti, metà sinistra indietro
        this.p = d.p0;
        this.step(e.clientX > window.innerWidth * 0.42 ? 1 : -1);
        return;
      }
      // velocità (viste al secondo) dagli ultimi campioni
      const s0 = d.samples[0];
      const s1 = d.samples[d.samples.length - 1];
      const v = (s1.p - s0.p) / Math.max(0.016, (s1.t - s0.t) / 1000);

      if (this.p < -0.14) {
        this.#animateTo(0);
        return this.#exit('backward');
      }
      if (this.p > V - 1 + 0.14) {
        this.#animateTo(V - 1);
        return this.#exit('forward');
      }
      let target = Math.abs(v) > 0.9 ? (v > 0 ? Math.ceil(this.p) : Math.floor(this.p)) : Math.round(this.p);
      target = clamp(target, 0, V - 1);
      const then = target === V - 1 && v >= 0 && Math.round(d.p0) < V - 1 ? () => this.#exit('forward') : null;
      this.#animateTo(target, then);
    };
    hit.addEventListener('pointerup', end);
    hit.addEventListener('pointercancel', end);

    // Rotellina / trackpad: un passo per gesto
    let acc = 0;
    let locked = false;
    let lockTime = 0;
    let lastAbs = 0;
    let idle = null;
    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.active) return;
        e.preventDefault();
        const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        const abs = Math.abs(d);
        clearTimeout(idle);
        idle = setTimeout(() => {
          locked = false;
          acc = 0;
        }, 170);
        // un nuovo gesto (accelerazione) sblocca anche durante l'inerzia
        if (locked && performance.now() - lockTime > 420 && abs > lastAbs * 1.4 + 4) locked = false;
        lastAbs = abs;
        if (locked) return;
        acc += d;
        if (Math.abs(acc) > 28) {
          locked = true;
          lockTime = performance.now();
          this.step(acc > 0 ? 1 : -1);
          acc = 0;
        }
      },
      { passive: false },
    );

    // Tastiera
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      const next = ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'];
      const prev = ['ArrowLeft', 'ArrowUp', 'PageUp'];
      if (next.includes(e.key)) {
        e.preventDefault();
        if (!e.repeat || !this.tween?.isActive()) this.step(1);
      } else if (prev.includes(e.key)) {
        e.preventDefault();
        if (!e.repeat || !this.tween?.isActive()) this.step(-1);
      }
    });
  }

  async #retryPhotos() {
    const btn = document.getElementById('photo-retry');
    btn.disabled = true;
    btn.textContent = 'Un attimo…';
    const ok = await this.photos.retry();
    btn.disabled = false;
    btn.textContent = 'Riprova';
    if (ok) {
      this.errorEl.hidden = true;
      this.p = 0;
      this.#buildBook();
      this.#refreshUI(true);
    }
  }

  /* ============================================================ UI */

  #refreshUI(force = false) {
    if (!this.active) return;
    const V = this.views.length;
    const k = clamp(Math.round(this.p), 0, V - 1);
    if (!force && k === this._uiK) return;
    this._uiK = k;

    const view = this.views[k];
    const P = this.pages.length;
    let text = '';
    if (P && view.step > 0 && view.step < this.L + 2) {
      if (this.mode === 'landscape') {
        const left = view.step >= 2 ? 2 * view.step - 2 : null;
        const right = view.step <= this.L ? 2 * view.step - 1 : null;
        text = left && right ? `${left}–${right} / ${P}` : `${left || right} / ${P}`;
      } else {
        const n = view.side === 'L' ? 2 * view.step - 2 : 2 * view.step - 1;
        text = `${n} / ${P}`;
      }
    }
    this.counterEl.textContent = text;

    let hint = '';
    if (this.photos.error) hint = '';
    else if (k === 0) hint = isMobile ? 'scorri ← per aprire l’album' : 'trascina, usa la rotellina o le frecce ← →';
    else if (k >= V - 2) hint = isMobile ? 'ancora uno swipe per continuare' : 'ancora una volta per continuare ↓';
    else if (!this.flipped) hint = isMobile ? 'scorri ← per sfogliare' : 'trascina o usa le frecce ← →';
    this.hintEl.textContent = hint;
  }

  /* ============================================================ frame */

  update(dt, time) {
    const s = this.state;
    const e = s.album;
    const o = s.albumOut;
    const m = clamp(e * (1 - o), 0, 1);
    const visible = e > 0.002 && o < 0.998;
    this.root.visible = visible;
    this.dim.visible = m > 0.002;
    this.dim.material.uniforms.uOpacity.value = smooth(clamp(m * 1.15, 0, 1)) * 0.86;
    for (const l of this.lights) l.visible = visible;
    if (!visible) return;

    // dal punto di Milano al centro dello schermo
    const pin = this.camera.worldToLocal(this.globe.milanWorld(_v));
    const fit = this.fit;
    _target.set(0, fit.y, -DEPTH);
    this.root.position.lerpVectors(pin, _target, m);
    this.root.scale.setScalar(fit.s * Math.max(0.002, Math.pow(m, 1.35)));
    const r = 1 - m;
    this.root.rotation.set(r * 0.75, -r * 1.5, r * 0.4);

    // segue mouse / inclinazione, più un leggero respiro
    const calm = reducedMotion ? 0 : 1;
    const ptr = this.pointer;
    const tx = (-ptr.y * 0.085 + Math.sin(time * 0.7) * 0.012) * calm;
    const ty = (ptr.x * 0.13 + Math.sin(time * 0.53 + 1) * 0.015) * calm;
    const k = 1 - Math.exp(-dt * 4);
    this.tilt.rotation.x += (tx - this.tilt.rotation.x) * k;
    this.tilt.rotation.y += (ty - this.tilt.rotation.y) * k;
    this.tilt.position.y = Math.sin(time * 0.9) * 0.006 * calm;
  }
}

const _v = new THREE.Vector3();
const _target = new THREE.Vector3();
