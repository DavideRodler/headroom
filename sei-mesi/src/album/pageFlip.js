/**
 * Un foglio dell'album che si piega mentre gira (page curl).
 *
 * Il foglio è una griglia: la colonna x=0 è sulla rilegatura. Mentre gira,
 * ogni punto ruota attorno alla rilegatura di un angolo che cresce verso il
 * bordo libero: il bordo "guida" il movimento e la carta si incurva.
 * L'angolo cambia un po' anche tra basso e alto, così l'angolo in basso si
 * solleva per primo, come quando si prende la pagina col pollice.
 */
import * as THREE from 'three';

export class Leaf {
  /**
   * @param {number} W larghezza pagina
   * @param {number} H altezza pagina
   * @param {[number, number]} segments suddivisioni [x, y]
   * @param {THREE.Material} frontMat pagina destra (fronte)
   * @param {THREE.Material} backMat pagina sinistra (retro)
   */
  constructor(W, H, segments, frontMat, backMat) {
    this.W = W;
    this.H = H;
    const [sx, sy] = segments;
    this.sx = sx;
    this.sy = sy;
    this.geometry = new THREE.PlaneGeometry(W, H, sx, sy);
    this.geometry.translate(W / 2, 0, 0);
    this.base = this.geometry.attributes.position.array.slice();

    this.group = new THREE.Group();
    this.front = new THREE.Mesh(this.geometry, frontMat);
    this.back = new THREE.Mesh(this.geometry, backMat);
    this.front.frustumCulled = this.back.frustumCulled = false;
    this.group.add(this.front, this.back);

    this.curl = 1.15; // quanto si piega la carta (radianti al bordo)
    this._last = null;
    this._cols = new Float32Array((sx + 1) * 2);
  }

  /**
   * @param {number} t avanzamento del giro 0 (a destra) → 1 (a sinistra)
   * @param {number} zRight quota a riposo sul lato destro
   * @param {number} zLeft quota a riposo sul lato sinistro
   */
  set(t, zRight, zLeft) {
    const key = `${t.toFixed(4)}|${zRight}|${zLeft}`;
    if (key === this._last) return;
    this._last = key;

    const pos = this.geometry.attributes.position.array;
    const { W, sx, sy, base } = this;
    const theta = Math.PI * t;
    // il bordo anticipa nella prima metà e si "adagia" nella seconda
    const c = this.curl * Math.sin(Math.PI * t) * (1 - 1.15 * t);
    const zSpine = zRight + (zLeft - zRight) * t;
    const ds = W / sx;
    const flat = t <= 0.0001 || t >= 0.9999;

    for (let j = 0; j <= sy; j++) {
      // y normalizzata: 0 in basso, 1 in alto (PlaneGeometry parte dall'alto)
      const yNorm = 1 - j / sy;
      const cRow = c * (1 + 0.5 * (0.5 - yNorm));
      let x = 0;
      let z = 0;
      for (let i = 0; i <= sx; i++) {
        const k = (j * (sx + 1) + i) * 3;
        if (i > 0) {
          // angolo a metà del segmento: integrazione lungo la carta
          const u = (i - 0.5) / sx;
          const a = flat ? theta : theta + cRow * u * u;
          x += ds * Math.cos(a);
          z += ds * Math.sin(a);
        }
        pos[k] = x;
        pos[k + 1] = base[k + 1];
        pos[k + 2] = zSpine + z;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  dispose() {
    this.geometry.dispose();
  }
}
