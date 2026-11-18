/**
 * Schermata di caricamento: un cuore che si riempie con la percentuale.
 * Ogni risorsa è un "compito" con un peso; la barra è la media pesata.
 */
import gsap from 'gsap';

export class Loader {
  constructor() {
    this.el = document.getElementById('loader');
    this.fill = document.getElementById('heart-fill');
    this.percentEl = document.getElementById('loader-percent');
    this.enterBtn = document.getElementById('enter');
    this.tasks = new Map();
    this.shown = { value: 0 };
    this.target = 0;
    document.documentElement.classList.add('is-loading');
  }

  /** Registra un compito e restituisce una funzione per aggiornarne l'avanzamento (0..1). */
  task(name, weight = 1) {
    this.tasks.set(name, { weight, progress: 0 });
    this.#recompute();
    return (p) => {
      const t = this.tasks.get(name);
      if (!t) return;
      t.progress = Math.max(t.progress, Math.min(1, p));
      this.#recompute();
    };
  }

  #recompute() {
    let total = 0;
    let done = 0;
    for (const t of this.tasks.values()) {
      total += t.weight;
      done += t.weight * t.progress;
    }
    this.target = total ? done / total : 0;
    gsap.to(this.shown, {
      value: this.target,
      duration: 0.6,
      ease: 'power2.out',
      overwrite: true,
      onUpdate: () => this.#render(),
    });
  }

  #render() {
    const p = this.shown.value;
    const pct = Math.round(p * 100);
    this.percentEl.textContent = `${pct}%`;
    // il rettangolo sale dal basso: il cuore si riempie
    this.fill.setAttribute('y', String(92 - 92 * p));
  }

  /** Porta la barra al 100% e mostra il pulsante "Tocca per iniziare". */
  ready() {
    for (const t of this.tasks.values()) t.progress = 1;
    this.#recompute();
    return new Promise((resolve) => {
      gsap.delayedCall(0.55, () => {
        this.percentEl.textContent = '100%';
        this.enterBtn.hidden = false;
        gsap.fromTo(this.enterBtn, { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: 'power2.out' });
        this.enterBtn.addEventListener('click', () => resolve(), { once: true });
      });
    });
  }

  hide() {
    document.documentElement.classList.remove('is-loading');
    return gsap.to(this.el, {
      autoAlpha: 0,
      duration: 1.1,
      ease: 'power2.inOut',
      onComplete: () => this.el.remove(),
    });
  }
}
