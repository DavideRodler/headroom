/**
 * Musica di sottofondo facoltativa: public/musica.mp3.
 * Il pulsante 🔈 compare solo se il file esiste; la musica parte solo dopo
 * un tocco dell'utente (regola dei browser) e sfuma in entrata/uscita.
 */
import gsap from 'gsap';

export async function setupMusic() {
  const btn = document.getElementById('music');
  const src = `${import.meta.env.BASE_URL}musica.mp3`;

  // Il file c'è davvero? (in sviluppo Vite potrebbe rispondere con index.html)
  try {
    const res = await fetch(src, { method: 'HEAD' });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !type.startsWith('audio')) return;
  } catch {
    return;
  }

  const audio = new Audio(src);
  audio.loop = true;
  audio.preload = 'none';
  audio.volume = 0;
  btn.hidden = false;

  let playing = false;
  btn.addEventListener('click', async () => {
    if (!playing) {
      try {
        await audio.play();
      } catch {
        return;
      }
      playing = true;
      btn.textContent = '🔊';
      btn.classList.add('is-playing');
      btn.setAttribute('aria-label', 'Disattiva la musica');
      gsap.to(audio, { volume: 0.7, duration: 2.5, ease: 'power1.out', overwrite: true });
    } else {
      playing = false;
      btn.textContent = '🔈';
      btn.classList.remove('is-playing');
      btn.setAttribute('aria-label', 'Attiva la musica');
      gsap.to(audio, {
        volume: 0,
        duration: 0.8,
        overwrite: true,
        onComplete: () => audio.pause(),
      });
    }
  });
}
