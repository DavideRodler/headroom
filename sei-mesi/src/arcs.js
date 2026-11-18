/**
 * Rotte luminose del finale: archi che partono da Milano verso destinazioni
 * casuali nel mondo, come voli verso i viaggi che verranno.
 * Sono figli del gruppo che ruota, quindi girano insieme alla Terra.
 */
import * as THREE from 'three';
import { DESTINATIONS, MILANO } from './config.js';
import { latLonToVector3, makeGlowTexture } from './globe.js';
import { isMobile, reducedMotion } from './quality.js';

const ARC_VERTEX = /* glsl */ `
  varying float vT;
  void main() {
    vT = uv.x;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Una "cometa": testa luminosa che corre lungo l'arco, scia che sfuma
const ARC_FRAGMENT = /* glsl */ `
  uniform float uHead;
  uniform float uTail;
  uniform float uOpacity;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying float vT;
  void main() {
    float d = uHead - vT;
    if (d < 0.0 || d > uTail) discard;
    float a = 1.0 - d / uTail;
    a = a * a;
    vec3 col = mix(uColorA, uColorB, vT) * (0.6 + 2.4 * a);
    gl_FragColor = vec4(col, a * uOpacity);
  }
`;

/** Punti di un arco di cerchio massimo, sollevato al centro. */
function arcCurve(from, to) {
  const a = latLonToVector3(from.lat, from.lon, 1);
  const b = latLonToVector3(to.lat, to.lon, 1);
  const angle = a.angleTo(b);
  const height = 0.08 + angle * 0.3;
  const pts = [];
  const N = 48;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const p = new THREE.Vector3().copy(a).lerp(b, t).normalize(); // approssima lo slerp
    // slerp vero per archi lunghi
    if (angle > 0.01) {
      const s = Math.sin(angle);
      p.copy(a).multiplyScalar(Math.sin((1 - t) * angle) / s).addScaledVector(b, Math.sin(t * angle) / s);
    }
    p.multiplyScalar(1.004 + Math.sin(Math.PI * t) * height);
    pts.push(p);
  }
  return new THREE.CatmullRomCurve3(pts);
}

export class Arcs {
  /** @param {import('./globe.js').Globe} globe */
  constructor(globe) {
    this.group = new THREE.Group();
    this.group.name = 'arcs';
    globe.spin.add(this.group);

    this.glowTex = makeGlowTexture(64);
    // spessore pensato per la Terra vista da lontano nel finale
    const radius = isMobile ? 0.011 : 0.0085;

    // Una geometria per destinazione, riusata ciclicamente
    this.routes = DESTINATIONS.map((dest) => {
      const curve = arcCurve(MILANO, dest);
      const geo = new THREE.TubeGeometry(curve, 72, radius, 5, false);
      const mat = new THREE.ShaderMaterial({
        vertexShader: ARC_VERTEX,
        fragmentShader: ARC_FRAGMENT,
        uniforms: {
          uHead: { value: 0 },
          uTail: { value: 0.35 },
          uOpacity: { value: 0 },
          uColorA: { value: new THREE.Color(1.0, 0.45, 0.65).multiplyScalar(1.6) },
          uColorB: { value: new THREE.Color(1.0, 0.8, 0.5).multiplyScalar(1.6) },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 6;
      this.group.add(mesh);

      // bagliore all'arrivo
      const flare = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTex,
          color: new THREE.Color(1.0, 0.8, 0.6).multiplyScalar(2.5),
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        }),
      );
      flare.position.copy(latLonToVector3(dest.lat, dest.lon, 1.01));
      flare.visible = false;
      this.group.add(flare);

      return { mesh, mat, flare, t: -1, speed: 0 };
    });

    this.order = this.#shuffle([...this.routes.keys()]);
    this.next = 0;
    this.spawnTimer = 0;
  }

  #shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  update(dt, _time, s) {
    const master = s.arcs;
    this.group.visible = master > 0.001;
    if (!this.group.visible) {
      for (const r of this.routes) {
        r.t = -1;
        r.mesh.visible = r.flare.visible = false;
      }
      return;
    }

    // lancia un nuovo volo ogni tanto
    this.spawnTimer -= dt;
    const interval = reducedMotion ? 2.4 : 0.85;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = interval * (0.7 + Math.random() * 0.6);
      const idx = this.order[this.next++ % this.order.length];
      const r = this.routes[idx];
      if (r.t < 0) {
        r.t = 0;
        r.speed = (reducedMotion ? 0.22 : 0.42) * (0.8 + Math.random() * 0.4);
      }
    }

    for (const r of this.routes) {
      if (r.t < 0) continue;
      r.t += dt * r.speed;
      const tail = r.mat.uniforms.uTail.value;
      const head = r.t * (1 + tail);
      r.mat.uniforms.uHead.value = head;
      r.mat.uniforms.uOpacity.value = master;
      r.mesh.visible = true;

      // bagliore quando la cometa arriva
      const arrive = r.t * (1 + tail) - 1;
      r.flare.visible = arrive > 0;
      if (r.flare.visible) {
        const k = Math.min(1, arrive / tail);
        r.flare.scale.setScalar(0.035 + 0.06 * Math.sin(Math.PI * Math.min(1, k * 1.2)));
        r.flare.material.opacity = master * (1 - k);
      }
      if (head > 1 + tail * 1.05) {
        r.t = -1;
        r.mesh.visible = r.flare.visible = false;
      }
    }
  }
}
