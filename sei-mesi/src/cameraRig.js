/**
 * Regia della camera: calcola posizione e punto di mira a partire dai
 * parametri della timeline (zoomA, zoomB, pullBack) e dall'intro iniziale.
 *
 * Le pose sono espresse in latitudine della camera, distanza dal centro e
 * "quanto guardo Milano" (look). Tutto dipende dall'aspect ratio, così il
 * telefono in verticale vede bene la Terra e l'Italia.
 */
import * as THREE from 'three';
import { MILANO, DEG } from './config.js';
import { reducedMotion } from './quality.js';

const lerp = (a, b, t) => a + (b - a) * t;
const logLerp = (a, b, t) => Math.exp(lerp(Math.log(a), Math.log(b), t));

function lerpPose(a, b, t, out = {}) {
  out.lat = lerp(a.lat, b.lat, t);
  out.dist = logLerp(a.dist, b.dist, t);
  out.look = lerp(a.look, b.look, t);
  out.lookDown = lerp(a.lookDown, b.lookDown, t);
  return out;
}

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.intro = 1; // 0 → 1 durante il volo d'apertura
    this.target = new THREE.Vector3();
    this.pose = { lat: 0, dist: 10, look: 0, lookDown: 0 };
    this._a = {};
    this._b = {};
    this._c = {};
  }

  /** Distanza alla quale un'ampiezza (in raggi terrestri) riempie metà schermo. */
  #fitDistance(halfExtent) {
    const tanHalf = Math.tan((this.camera.fov * DEG) / 2);
    const minAspect = Math.min(1, this.camera.aspect);
    return halfExtent / (tanHalf * minAspect);
  }

  #poses() {
    const portrait = this.camera.aspect < 0.85;
    const d0 = this.#fitDistance(portrait ? 2.45 : 3.0);
    return {
      // apertura: si arriva "dall'alto", lontani
      introStart: { lat: 62, dist: d0 * 2.8, look: 0, lookDown: 0 },
      // Terra piccola al centro dello spazio
      intro: { lat: 16, dist: d0, look: 0, lookDown: 0 },
      // Italia al centro
      italy: { lat: 40.5, dist: 1 + this.#fitDistance(0.3), look: 0.25, lookDown: 0 },
      // vicini a Milano, vista obliqua con l'orizzonte in alto
      milan: { lat: 31, dist: 1 + this.#fitDistance(portrait ? 0.17 : 0.15), look: 1, lookDown: 0 },
      // finale: Terra piccola e un po' più in alto, lascia spazio alle frasi
      finale: { lat: 14, dist: d0 * (portrait ? 1.12 : 1.18), look: 0, lookDown: portrait ? 0.62 : 0.5 },
    };
  }

  /**
   * @param {object} s stato della timeline
   * @param {{x:number,y:number}} pointer puntatore smorzato (-1..1)
   */
  update(s, pointer) {
    const P = this.#poses();
    const introEase = 1 - Math.pow(1 - this.intro, 3);
    const p0 = lerpPose(P.introStart, P.intro, introEase, this._a);
    const p1 = lerpPose(p0, P.italy, s.zoomA, this._b);
    const p2 = lerpPose(p1, P.milan, s.zoomB, this._c);
    const pose = lerpPose(p2, P.finale, s.pullBack, this.pose);

    // Milano "ideale": dopo l'aggancio la Terra la porta davanti alla camera (asse +z)
    const latM = MILANO.lat * DEG;
    const milan = _m.set(0, Math.sin(latM), Math.cos(latM));

    const lat = pose.lat * DEG;
    const cam = this.camera;
    cam.position.set(0, Math.sin(lat), Math.cos(lat)).multiplyScalar(pose.dist);
    this.target.copy(milan).multiplyScalar(pose.look);
    this.target.y -= pose.lookDown;

    // Parallasse col puntatore (molto leggero, più ampio quando siamo lontani)
    if (!reducedMotion) {
      const amp = Math.min(0.06 * pose.dist, 0.6) * (1 - s.zoomB * 0.85);
      _right.set(1, 0, 0);
      _up.set(0, 1, 0);
      cam.position.addScaledVector(_right, pointer.x * amp).addScaledVector(_up, pointer.y * amp * 0.6);
    }
    cam.lookAt(this.target);
  }
}

const _m = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
