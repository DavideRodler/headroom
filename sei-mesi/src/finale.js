/**
 * Finale: le frasi (animate dalla timeline in scroll.js) e il pulsante
 * "Ricomincia". Le rotte luminose stanno in arcs.js.
 */
export class Finale {
  constructor() {
    this.button = document.getElementById('restart');
    this.onRestart = null;
    this.button.addEventListener('click', () => this.onRestart?.());
  }
}
