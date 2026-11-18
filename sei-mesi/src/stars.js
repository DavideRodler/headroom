/**
 * Spazio profondo: tre strati di stelle (per il parallasse) e una nebulosa
 * di sfondo blu notte con veli rosa/viola, generata una volta sola in un canvas.
 */
import * as THREE from 'three';
import { quality, reducedMotion } from './quality.js';

const STAR_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uTwinkle;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float tw = 1.0 - uTwinkle * 0.45 * (0.5 + 0.5 * sin(uTime * (0.6 + aPhase * 1.7) + aPhase * 40.0));
    vAlpha = tw;
    vColor = aColor;
    gl_PointSize = aSize * uPixelRatio * (300.0 / -mv.z);
    gl_PointSize = clamp(gl_PointSize, 1.0, 6.0 * uPixelRatio);
  }
`;

const STAR_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float core = smoothstep(0.5, 0.0, d);
    float a = core * core * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor * (1.0 + 1.6 * core), a);
  }
`;

/** Colori stellari: bianco caldo, azzurro, qualche rosa e oro. */
const STAR_TINTS = [
  [1.0, 0.97, 0.92],
  [0.82, 0.88, 1.0],
  [1.0, 0.86, 0.72],
  [1.0, 0.78, 0.86],
  [0.95, 0.95, 1.0],
];

function makeLayer(count, radius, sizeRange) {
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    // punto uniforme su una sfera, con un po' di spessore
    v.randomDirection().multiplyScalar(radius * (0.85 + Math.random() * 0.3));
    positions.set([v.x, v.y, v.z], i * 3);
    const r = Math.pow(Math.random(), 3.5); // poche stelle grandi, molte piccole
    sizes[i] = sizeRange[0] + r * (sizeRange[1] - sizeRange[0]);
    phases[i] = Math.random();
    const tint = STAR_TINTS[(Math.random() * STAR_TINTS.length) | 0];
    const b = 0.55 + Math.random() * 0.45;
    colors.set([tint[0] * b, tint[1] * b, tint[2] * b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/** Rumore "value noise" semplice per dipingere la nebulosa nel canvas. */
function makeNoise(seed = 7) {
  const perm = new Uint8Array(512);
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = (h, x, y, z) => {
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;
  return function noise(x, y, z) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z;
    const B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
    return lerp(
      lerp(lerp(grad(perm[AA] & 15, x, y, z), grad(perm[BA] & 15, x - 1, y, z), u),
        lerp(grad(perm[AB] & 15, x, y - 1, z), grad(perm[BB] & 15, x - 1, y - 1, z), u), v),
      lerp(lerp(grad(perm[AA + 1] & 15, x, y, z - 1), grad(perm[BA + 1] & 15, x - 1, y, z - 1), u),
        lerp(grad(perm[AB + 1] & 15, x, y - 1, z - 1), grad(perm[BB + 1] & 15, x - 1, y - 1, z - 1), u), v),
      w,
    );
  };
}

/** Dipinge una texture equirettangolare della nebulosa (una volta sola). */
function makeNebulaTexture() {
  const W = 512, H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const noise = makeNoise(11);
  const fbm = (x, y, z) => {
    let a = 0, amp = 0.5, f = 1;
    for (let o = 0; o < 4; o++) {
      a += amp * noise(x * f, y * f, z * f);
      f *= 2.03;
      amp *= 0.5;
    }
    return a;
  };
  for (let j = 0; j < H; j++) {
    const theta = (j / (H - 1)) * Math.PI;
    for (let i = 0; i < W; i++) {
      const phi = (i / W) * Math.PI * 2;
      const x = Math.sin(theta) * Math.cos(phi);
      const y = Math.cos(theta);
      const z = Math.sin(theta) * Math.sin(phi);
      const n1 = fbm(x * 1.6 + 3.1, y * 1.6, z * 1.6);
      const n2 = fbm(x * 2.4 - 7.0, y * 2.4 + 1.3, z * 2.4);
      // una "fascia" diagonale tipo via lattea
      const band = Math.exp(-Math.pow((y * 0.8 + x * 0.45) * 2.6, 2));
      const veil = Math.max(0, n1 * 1.6 + 0.15) * (0.35 + band * 0.9);
      const pinkVeil = Math.max(0, n2 * 1.8 - 0.05) * (0.25 + band * 0.6);
      // base blu notte
      let r = 4 + veil * 26 + pinkVeil * 70;
      let g = 6 + veil * 20 + pinkVeil * 18;
      let b = 18 + veil * 70 + pinkVeil * 55;
      const k = (j * W + i) * 4;
      img.data[k] = Math.min(255, r);
      img.data[k + 1] = Math.min(255, g);
      img.data[k + 2] = Math.min(255, b);
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Starfield {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'starfield';
    scene.add(this.group);

    // Nebulosa sullo sfondo (sfera enorme, vista dall'interno)
    const nebulaTex = makeNebulaTexture();
    this.nebula = new THREE.Mesh(
      new THREE.SphereGeometry(900, 48, 24),
      new THREE.MeshBasicMaterial({ map: nebulaTex, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
    this.nebula.renderOrder = -10;
    this.group.add(this.nebula);

    // Tre strati: vicino, medio, lontano (parallasse diverso)
    this.uniforms = {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uTwinkle: { value: reducedMotion ? 0 : 1 },
    };
    const material = new THREE.ShaderMaterial({
      vertexShader: STAR_VERTEX,
      fragmentShader: STAR_FRAGMENT,
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const [c1, c2, c3] = quality.starCounts;
    const specs = [
      { count: c1, radius: 90, size: [0.6, 2.4], parallax: 0.06 },
      { count: c2, radius: 220, size: [0.7, 2.6], parallax: 0.03 },
      { count: c3, radius: 520, size: [0.9, 3.2], parallax: 0.012 },
    ];
    this.layers = specs.map((s) => {
      const pts = new THREE.Points(makeLayer(s.count, s.radius, s.size), material);
      pts.frustumCulled = false;
      pts.userData.parallax = s.parallax;
      pts.renderOrder = -5;
      this.group.add(pts);
      return pts;
    });
  }

  setPixelRatio(pr) {
    this.uniforms.uPixelRatio.value = pr;
  }

  /**
   * @param {number} time secondi
   * @param {{x:number,y:number}} pointer puntatore smorzato (-1..1)
   * @param {THREE.Vector3} cameraPos le stelle seguono la camera (sono "all'infinito")
   */
  update(time, pointer, cameraPos) {
    this.uniforms.uTime.value = time;
    this.group.position.copy(cameraPos).multiplyScalar(0.92); // quasi all'infinito
    const drift = reducedMotion ? 0 : time * 0.004;
    for (const layer of this.layers) {
      const p = layer.userData.parallax;
      layer.rotation.y = drift * (p * 30) + pointer.x * p * 1.6;
      layer.rotation.x = -pointer.y * p * 1.2;
    }
    this.nebula.rotation.y = drift * 0.3;
  }
}
