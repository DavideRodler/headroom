/**
 * Regia dello scroll: Lenis per lo scorrimento morbido, una timeline GSAP
 * legata allo scroll (ScrollTrigger, scrub) che anima uno "stato" condiviso,
 * e il blocco dello scroll quando l'album è pronto per essere sfogliato.
 *
 * I moduli 3D non conoscono lo scroll: leggono solo i numeri dello stato.
 */
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { isMobile, reducedMotion } from './quality.js';

gsap.registerPlugin(ScrollTrigger);
ScrollTrigger.config({ ignoreMobileResize: true });

/** Stato animato dalla timeline (tutti valori 0..1). */
export function createState() {
  return {
    hint: 1, //      invito a scorrere visibile
    focus: 0, //     la Terra si "aggancia" a Milano
    zoomA: 0, //     spazio → Italia
    zoomB: 0, //     Italia → Milano
    pin: 0, //       cuore su Milano
    light: 0, //     luce che si apre / si richiude
    album: 0, //     l'album nasce e cresce
    albumOut: 0, //  l'album rientra nel punto luminoso
    pullBack: 0, //  la camera si allontana
    arcs: 0, //      rotte luminose del finale
  };
}

export class ScrollDirector {
  /**
   * @param {object} state stato condiviso
   * @param {object} hooks { onLock(direction), onRestart() }
   */
  constructor(state, hooks) {
    this.state = state;
    this.hooks = hooks;
    this.space = document.getElementById('scroll-space');
    this.locked = false;
    this.armed = true;
    this.programmatic = false;
    this.prevScroll = 0;

    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);

    this.lenis = new Lenis({
      lerp: reducedMotion ? 1 : 0.085,
      smoothWheel: !reducedMotion,
      syncTouch: false,
      wheelMultiplier: 0.9,
    });
    this.lenis.on('scroll', ScrollTrigger.update);
    this.lenis.on('scroll', (e) => this.#onScroll(e.scroll));
    gsap.ticker.add((t) => this.lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);

    this.#build();

    // Ricostruisci solo se cambia davvero la forma della finestra
    let lastW = window.innerWidth;
    let lastH = window.innerHeight;
    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (w === lastW && Math.abs(h - lastH) < 160) return;
      lastW = w;
      lastH = h;
      const p = this.st ? this.st.progress : 0;
      this.#build();
      const y = this.locked ? this.lockY : this.st.start + (this.st.end - this.st.start) * p;
      this.lenis.scrollTo(y, { immediate: true, force: true });
    });
  }

  /** Costruisce la timeline principale (in "unità" di scroll). */
  #build() {
    const s = this.state;
    if (this.tl) {
      this.st?.kill();
      this.tl.kill();
    }
    const tl = gsap.timeline({ defaults: { ease: 'none' }, paused: true });

    // --- Scena 1 → 2: dallo spazio a Milano
    tl.to(s, { hint: 0, duration: 0.35 }, 0);
    tl.to(s, { focus: 1, duration: 1.5, ease: 'power1.inOut' }, 0.1);
    tl.to(s, { zoomA: 1, duration: 1.7, ease: 'power2.inOut' }, 0.1);
    tl.to(s, { zoomB: 1, duration: 1.4, ease: 'power2.inOut' }, 1.8);
    tl.to(s, { pin: 1, duration: 0.6, ease: 'power1.out' }, 2.55);

    // --- Scena 3: si apre la luce e nasce l'album
    tl.to(s, { light: 1, duration: 0.45, ease: 'power2.in' }, 3.25);
    tl.to(s, { album: 1, duration: 1.1, ease: 'power3.out' }, 3.5);
    tl.to(s, { light: 0, duration: 0.7, ease: 'power2.out' }, 3.75);
    tl.addLabel('albumLock', 4.62);

    // --- Scena 5: l'album rientra, la camera si allontana, le frasi
    tl.to(s, { albumOut: 1, duration: 1.1, ease: 'power2.inOut' }, 4.75);
    tl.to(s, { light: 0.65, duration: 0.3, ease: 'power2.in' }, 5.55);
    tl.to(s, { light: 0, duration: 0.6, ease: 'power2.out' }, 5.85);
    tl.to(s, { pullBack: 1, duration: 1.8, ease: 'power2.inOut' }, 5.85);
    tl.to(s, { focus: 0, duration: 1.8, ease: 'power1.inOut' }, 5.85);
    tl.to(s, { arcs: 1, duration: 0.8 }, 7.0);

    const phrases = gsap.utils.toArray('#phrases .phrase');
    let t = 7.45;
    phrases.forEach((el, i) => {
      const last = i === phrases.length - 1;
      tl.fromTo(
        el,
        { autoAlpha: 0, y: 26, filter: 'blur(10px)' },
        { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: 0.6, ease: 'power2.out' },
        t,
      );
      if (!last) {
        tl.to(el, { autoAlpha: 0, y: -18, filter: 'blur(8px)', duration: 0.4, ease: 'power2.in' }, t + 1.3);
        t += 1.8;
      }
    });
    tl.fromTo('#restart', { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.5 }, t + 0.7);
    tl.to({}, { duration: 0.6 }, t + 1.2); // un attimo di respiro alla fine

    this.tl = tl;
    this.unitPx = window.innerHeight * (isMobile ? 0.78 : 0.88);
    const height = tl.duration() * this.unitPx + window.innerHeight;
    this.space.style.height = `${Math.round(height)}px`;

    this.st = ScrollTrigger.create({
      trigger: this.space,
      start: 'top top',
      end: 'bottom bottom',
      scrub: reducedMotion ? true : 0.5,
      animation: tl,
    });
    ScrollTrigger.refresh();
  }

  /** Posizione di scroll (px) in cui l'album si ferma. */
  get lockY() {
    const p = this.tl.labels.albumLock / this.tl.duration();
    return this.st.start + (this.st.end - this.st.start) * p;
  }

  #onScroll(y) {
    const prev = this.prevScroll;
    this.prevScroll = y;
    const lockY = this.lockY;
    if (this.locked) {
      // l'inerzia di iOS può far scivolare la pagina: rimettila sul punto dell'album
      if (Math.abs(y - lockY) > 1) this.lenis.scrollTo(lockY, { immediate: true, force: true });
      return;
    }

    // riarma il blocco quando ci siamo allontanati abbastanza
    if (!this.armed && !this.programmatic && Math.abs(y - lockY) > this.unitPx * 0.3) {
      this.armed = true;
    }
    if (!this.armed) return;

    const crossedDown = prev < lockY && y >= lockY;
    const crossedUp = prev > lockY && y <= lockY;
    if (crossedDown || crossedUp) this.#lock(crossedDown ? 'down' : 'up');
  }

  #lock(direction) {
    this.locked = true;
    this.lenis.scrollTo(this.lockY, { immediate: true, force: true });
    this.lenis.stop();
    this.hooks.onLock?.(direction);
  }

  /**
   * Sblocca lo scroll quando l'album è finito (o si torna indietro).
   * @param {'forward'|'backward'} direction
   */
  release(direction) {
    if (!this.locked) return;
    this.locked = false;
    this.armed = false;
    this.programmatic = true;
    this.lenis.start();
    const forward = direction === 'forward';
    const y = this.lockY + (forward ? 1.35 : -1.25) * this.unitPx;
    this.lenis.scrollTo(y, {
      duration: forward ? 2.6 : 1.9,
      easing: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
      force: true,
      onComplete: () => {
        this.programmatic = false;
      },
    });
  }

  /** Torna all'inizio istantaneamente (usato da "Ricomincia", dietro una dissolvenza). */
  jumpToStart() {
    this.locked = false;
    this.armed = true;
    this.programmatic = false;
    this.lenis.start();
    this.lenis.scrollTo(0, { immediate: true, force: true });
    this.prevScroll = 0;
    ScrollTrigger.update();
    this.st.getTween()?.progress(1);
    this.tl.progress(0);
  }
}
