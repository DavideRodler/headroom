/**
 * La Terra: superficie con shader giorno/notte, oceani lucidi e rilievo,
 * nuvole su uno strato separato, atmosfera Fresnel e il "pin" a cuore su Milano.
 */
import * as THREE from 'three';
import { MILANO, SUN_DIRECTION, DEG } from './config.js';
import { quality, reducedMotion } from './quality.js';

/**
 * Converte latitudine/longitudine in un punto sulla sfera, coerente con la
 * mappatura UV di THREE.SphereGeometry (u=0 → longitudine -180°).
 */
export function latLonToVector3(lat, lon, radius = 1, out = new THREE.Vector3()) {
  const phi = ((lon + 180) / 360) * Math.PI * 2;
  const theta = (90 - lat) * DEG;
  return out.set(
    -Math.cos(phi) * Math.sin(theta),
    Math.cos(theta),
    Math.sin(phi) * Math.sin(theta),
  ).multiplyScalar(radius);
}

const sunDir = new THREE.Vector3(...SUN_DIRECTION).normalize();

/* ---------------------------------------------------------------- shaders */

const EARTH_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const EARTH_FRAGMENT = /* glsl */ `
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform sampler2D uRelief;   // R = rilievo, G = maschera oceani
  uniform sampler2D uClouds;
  uniform vec3 uSunDir;
  uniform float uBump;
  uniform float uCloudOffset;  // rotazione delle nuvole rispetto alla Terra (in u)
  uniform float uNightBoost;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  // Perturbazione della normale dal rilievo (stesso metodo di three.js bumpmap)
  vec3 perturbNormal(vec3 pos, vec3 n, float h) {
    vec3 sx = dFdx(pos);
    vec3 sy = dFdy(pos);
    vec3 r1 = cross(sy, n);
    vec3 r2 = cross(n, sx);
    float det = dot(sx, r1);
    vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
    return normalize(abs(det) * n - grad);
  }

  void main() {
    vec3 nGeo = normalize(vNormalW);
    vec4 relief = texture2D(uRelief, vUv);
    vec3 n = perturbNormal(vPosW, nGeo, relief.r * uBump);

    vec3 V = normalize(cameraPosition - vPosW);
    float ndlGeo = dot(nGeo, uSunDir);
    float ndl = dot(n, uSunDir);
    float dayMix = smoothstep(-0.16, 0.22, ndlGeo);

    vec3 day = texture2D(uDay, vUv).rgb;
    float cloud = texture2D(uClouds, vec2(vUv.x - uCloudOffset, vUv.y)).r;

    // Luce diffusa + un filo di ambiente bluastro
    vec3 col = day * (max(ndl, 0.0) * 1.35 + 0.018);
    col += day * vec3(0.10, 0.14, 0.32) * 0.05;

    // Fascia del tramonto: calda, appena accennata
    float twilight = exp(-pow(ndlGeo * 4.5, 2.0));
    col += day * vec3(1.0, 0.42, 0.25) * twilight * 0.18;

    // Ombra delle nuvole sul lato illuminato
    col *= 1.0 - cloud * 0.35 * dayMix;

    // Riflesso del sole sugli oceani
    float water = relief.g;
    vec3 H = normalize(uSunDir + V);
    float nh = max(dot(nGeo, H), 0.0);
    float spec = (pow(nh, 140.0) * 0.3 + pow(nh, 18.0) * 0.03) * water * (1.0 - cloud * 0.8);
    col += vec3(1.0, 0.88, 0.75) * spec * dayMix;
    // oceani un po' più profondi e scuri (più cinematografici)
    col = mix(col, col * vec3(0.55, 0.68, 0.9), water * 0.65);

    // Luci delle città sul lato in ombra (HDR: le fa brillare il bloom)
    vec3 night = texture2D(uNight, vUv).rgb;
    float nightMix = 1.0 - smoothstep(-0.22, 0.06, ndlGeo);
    vec3 lights = pow(night, vec3(1.35)) * vec3(1.0, 0.76, 0.48) * uNightBoost;
    col += lights * nightMix * (1.0 - cloud * 0.6);

    // Bordo atmosferico sulla superficie (Fresnel)
    float fres = pow(1.0 - max(dot(nGeo, V), 0.0), 3.5);
    vec3 atmo = mix(vec3(0.55, 0.32, 0.75) * 0.25, vec3(0.38, 0.62, 1.0), dayMix);
    atmo = mix(atmo, vec3(1.0, 0.5, 0.55), twilight * 0.45);
    col += atmo * fres * (0.25 + 0.95 * smoothstep(-0.35, 0.45, ndlGeo));

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const CLOUDS_FRAGMENT = /* glsl */ `
  uniform sampler2D uClouds;
  uniform vec3 uSunDir;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec3 n = normalize(vNormalW);
    float c = texture2D(uClouds, vUv).r;
    float ndl = dot(n, uSunDir);
    float lit = smoothstep(-0.25, 0.25, ndl);
    float twilight = exp(-pow(ndl * 4.5, 2.0));
    vec3 col = vec3(1.0) * (max(ndl, 0.0) * 1.05 + 0.03);
    col += vec3(1.0, 0.55, 0.4) * twilight * 0.25;
    float a = smoothstep(0.03, 0.72, c) * (0.18 + 0.82 * lit) * uOpacity;
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const ATMO_VERTEX = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

// Alone esterno: dipende dall'angolo tra normale e vista (Fresnel) e dal Sole.
const ATMO_FRAGMENT = /* glsl */ `
  uniform vec3 uSunDir;
  uniform float uEdge;      // sqrt(1 - 1/R^2): valore al bordo della Terra
  uniform float uIntensity;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vPosW);
    float t = clamp(-dot(n, V) / uEdge, 0.0, 1.0);
    float glow = pow(t, 2.6);
    float sun = dot(n, uSunDir);
    float dayMix = smoothstep(-0.35, 0.35, sun);
    float twilight = exp(-pow(sun * 3.5, 2.0));
    vec3 col = mix(vec3(0.32, 0.22, 0.75) * 0.35, vec3(0.35, 0.62, 1.0), dayMix);
    col = mix(col, vec3(1.0, 0.45, 0.6), twilight * 0.55);
    gl_FragColor = vec4(col * glow * uIntensity, 1.0);
  }
`;

/* -------------------------------------------------------------- utilities */

/** Texture radiale morbida (bagliori, punti luce). */
export function makeGlowTexture(size = 128, stops = null) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  const s = stops || [
    [0, 'rgba(255,255,255,1)'],
    [0.18, 'rgba(255,255,255,0.65)'],
    [0.45, 'rgba(255,255,255,0.18)'],
    [1, 'rgba(255,255,255,0)'],
  ];
  for (const [o, col] of s) grd.addColorStop(o, col);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeRingTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.7, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.85, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

/** Raggi di luce (starburst) per il momento in cui "si apre la luce". */
function makeRaysTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.translate(size / 2, size / 2);
  const rays = 18;
  for (let i = 0; i < rays; i++) {
    g.rotate((Math.PI * 2) / rays);
    const len = size * (0.32 + ((i * 7919) % 13) / 13 * 0.18);
    const grd = g.createLinearGradient(0, 0, len, 0);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(0, -size * 0.012);
    g.lineTo(len, 0);
    g.lineTo(0, size * 0.012);
    g.fill();
  }
  return new THREE.CanvasTexture(c);
}

/** Forma a cuore (centrata, alta ~2 unità). */
export function makeHeartShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 0.42);
  s.bezierCurveTo(-0.08, 0.78, -0.62, 0.95, -0.9, 0.6);
  s.bezierCurveTo(-1.18, 0.22, -0.92, -0.2, -0.55, -0.5);
  s.bezierCurveTo(-0.3, -0.7, -0.08, -0.85, 0, -1.0);
  s.bezierCurveTo(0.08, -0.85, 0.3, -0.7, 0.55, -0.5);
  s.bezierCurveTo(0.92, -0.2, 1.18, 0.22, 0.9, 0.6);
  s.bezierCurveTo(0.62, 0.95, 0.08, 0.78, 0, 0.42);
  return s;
}

/** Interpolazione dolce tra due valori. */
const smooth = (t) => t * t * (3 - 2 * t);

/* ------------------------------------------------------------------ Globe */

export class Globe {
  /**
   * @param {THREE.Scene} scene
   * @param {{day,night,clouds,relief}} textures texture già caricate
   */
  constructor(scene, textures) {
    this.root = new THREE.Group();
    this.root.name = 'globe';
    scene.add(this.root);

    // Gruppo che ruota (Terra + nuvole + pin + archi)
    this.spin = new THREE.Group();
    this.root.add(this.spin);

    const [ws, hs] = quality.sphereSegments;
    const sphere = new THREE.SphereGeometry(1, ws, hs);

    this.earthUniforms = {
      uDay: { value: textures.day },
      uNight: { value: textures.night },
      uRelief: { value: textures.relief },
      uClouds: { value: textures.clouds },
      uSunDir: { value: sunDir },
      uBump: { value: 0.012 },
      uCloudOffset: { value: 0 },
      uNightBoost: { value: 3.2 },
    };
    this.earth = new THREE.Mesh(
      sphere,
      new THREE.ShaderMaterial({
        vertexShader: EARTH_VERTEX,
        fragmentShader: EARTH_FRAGMENT,
        uniforms: this.earthUniforms,
      }),
    );
    this.earth.name = 'earth';
    this.spin.add(this.earth);

    // Nuvole: sfera appena più grande, ruota un po' più veloce
    this.cloudUniforms = {
      uClouds: { value: textures.clouds },
      uSunDir: { value: sunDir },
      uOpacity: { value: 0.95 },
    };
    this.clouds = new THREE.Mesh(
      sphere,
      new THREE.ShaderMaterial({
        vertexShader: EARTH_VERTEX,
        fragmentShader: CLOUDS_FRAGMENT,
        uniforms: this.cloudUniforms,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.clouds.scale.setScalar(1.008);
    this.clouds.renderOrder = 2;
    this.spin.add(this.clouds);

    // Atmosfera (alone esterno, Fresnel)
    const atmoR = 1.075;
    this.atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 96, 48),
      new THREE.ShaderMaterial({
        vertexShader: ATMO_VERTEX,
        fragmentShader: ATMO_FRAGMENT,
        uniforms: {
          uSunDir: { value: sunDir },
          uEdge: { value: Math.sqrt(1 - 1 / (atmoR * atmoR)) },
          uIntensity: { value: 1.25 },
        },
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.atmosphere.scale.setScalar(atmoR);
    this.atmosphere.renderOrder = 3;
    this.root.add(this.atmosphere);

    this.#buildPin();

    // Stato della rotazione
    this.idleAngle = 0.9; // angolo iniziale (si vede l'Atlantico)
    this.cloudAngle = 0;
    this.milanLocal = latLonToVector3(MILANO.lat, MILANO.lon, 1);
    this.focusBase = Math.atan2(-this.milanLocal.x, this.milanLocal.z);
    this.focusTarget = this.focusBase;
    this.spin.rotation.y = this.idleAngle;
  }

  /** Pin a cuore su Milano + bagliore + onda che pulsa + luce dell'album. */
  #buildPin() {
    this.pin = new THREE.Group();
    this.pin.name = 'pin';
    latLonToVector3(MILANO.lat, MILANO.lon, 1.004, this.pin.position);
    this.spin.add(this.pin);

    // il contenuto del pin è "billboard": guarda sempre la camera
    this.pinBillboard = new THREE.Group();
    this.pin.add(this.pinBillboard);

    const glowTex = makeGlowTexture(128);
    this.glowTex = glowTex;

    const heartGeo = new THREE.ShapeGeometry(makeHeartShape(), 24);
    this.heart = new THREE.Mesh(
      heartGeo,
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(1.0, 0.36, 0.55).multiplyScalar(3.2),
        transparent: true,
        depthTest: false,
        toneMapped: false,
      }),
    );
    this.heart.renderOrder = 20;
    this.pinBillboard.add(this.heart);

    this.pinGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: glowTex,
        color: new THREE.Color(1.0, 0.45, 0.6).multiplyScalar(2.2),
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.pinGlow.renderOrder = 19;
    this.pinBillboard.add(this.pinGlow);

    this.ring = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: makeRingTexture(),
        color: new THREE.Color(1.0, 0.7, 0.75).multiplyScalar(2.0),
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.ring.renderOrder = 18;
    this.pinBillboard.add(this.ring);

    // Luce che si apre (scena 3)
    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: glowTex,
        color: new THREE.Color(1.0, 0.82, 0.7).multiplyScalar(4),
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.flash.renderOrder = 21;
    this.pinBillboard.add(this.flash);

    this.rays = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: makeRaysTexture(),
        color: new THREE.Color(1.0, 0.75, 0.6).multiplyScalar(2.5),
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.rays.renderOrder = 21;
    this.pinBillboard.add(this.rays);
  }

  /** Posizione di Milano nello spazio del mondo. */
  milanWorld(out = new THREE.Vector3()) {
    return this.pin.getWorldPosition(out);
  }

  /**
   * @param {number} dt secondi dall'ultimo frame
   * @param {number} time secondi totali
   * @param {object} s stato della timeline (focus, pin, light, ...)
   * @param {THREE.Camera} camera
   */
  update(dt, time, s, camera) {
    const calm = reducedMotion ? 0.45 : 1;

    // --- Rotazione: libera nello spazio, "agganciata" a Milano durante lo zoom
    const free = 1 - s.focus;
    this.idleAngle += dt * 0.06 * calm * free * free;
    if (s.focus <= 0.0001) {
      // scegli il giro "più vicino" solo quando siamo liberi (niente salti)
      const k = Math.round((this.idleAngle - this.focusBase) / (Math.PI * 2));
      this.focusTarget = this.focusBase + k * Math.PI * 2;
    }
    const f = smooth(Math.min(1, Math.max(0, s.focus)));
    this.spin.rotation.y = this.idleAngle + (this.focusTarget - this.idleAngle) * f;

    // Le nuvole scivolano piano rispetto alla Terra
    this.cloudAngle += dt * 0.012 * calm;
    this.clouds.rotation.y = this.cloudAngle;
    this.earthUniforms.uCloudOffset.value = this.cloudAngle / (Math.PI * 2);

    // Il rilievo serve da lontano; da vicino la texture ingrandita farebbe "scalini"
    const camDist = camera.position.length();
    this.earthUniforms.uBump.value = 0.012 * Math.min(1, Math.max(0.12, (camDist - 1.4) / 2.5));

    // --- Pin: sempre rivolto alla camera, grandezza costante sullo schermo
    const pinWorld = this.milanWorld(_v1);
    const dist = pinWorld.distanceTo(camera.position);
    this.pinBillboard.quaternion
      .copy(this.pin.parent.getWorldQuaternion(_q1).invert())
      .multiply(camera.quaternion);

    // quando l'album è davanti, il pin si spegne (è disegnato sopra a tutto)
    const albumCover = Math.min(1, s.album * (1 - s.albumOut) * 1.6);
    const pinFade = 1 - albumCover * albumCover * (3 - 2 * albumCover);
    this.heart.material.opacity = pinFade;
    // più piccolo quando la Terra torna lontana (finale)
    const pinScale = dist * 0.016 * (1 - 0.5 * s.pullBack) * easeOutBack(Math.min(1, s.pin));
    const beat = reducedMotion ? 1 : 1 + 0.08 * Math.pow(Math.max(0, Math.sin(time * 3.2)), 8);
    this.heart.scale.setScalar(Math.max(1e-4, pinScale * beat));
    this.heart.visible = s.pin > 0.001 && pinFade > 0.001;
    this.pinGlow.scale.setScalar(Math.max(1e-4, pinScale * (5.5 - 2 * s.pullBack)));
    this.pinGlow.material.opacity = Math.min(1, s.pin) * 0.9 * pinFade;
    this.pinGlow.visible = this.heart.visible;

    const ringT = reducedMotion ? 0.5 : (time * 0.65) % 1;
    this.ring.scale.setScalar(Math.max(1e-4, pinScale * (1.5 + ringT * 6)));
    this.ring.material.opacity = Math.min(1, s.pin) * (1 - ringT) * 0.85 * pinFade;
    this.ring.visible = this.heart.visible;

    // --- Luce che si apre (scena 3)
    const L = s.light;
    this.flash.visible = this.rays.visible = L > 0.001;
    this.flash.scale.setScalar(Math.max(1e-4, dist * (0.02 + L * 0.55)));
    this.flash.material.opacity = Math.min(1, L * 1.2);
    this.rays.scale.setScalar(Math.max(1e-4, dist * (0.05 + L * 0.9)));
    this.rays.rotation.z = time * 0.15;
    this.rays.material.opacity = Math.min(1, L) * 0.8;
  }
}

const _v1 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();

function easeOutBack(t) {
  if (t <= 0) return 0;
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
