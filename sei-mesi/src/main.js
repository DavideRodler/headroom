/**
 * Punto d'ingresso: crea renderer e scena, carica le risorse (con la
 * schermata del cuore), collega i moduli e fa girare il loop di rendering.
 */
import '@fontsource/great-vibes/400.css';
import '@fontsource/allura/400.css';
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import '@fontsource/inter/400.css';
import './styles.css';

import * as THREE from 'three';
import gsap from 'gsap';

import { quality, isMobile, reducedMotion, targetPixelRatio } from './quality.js';
import { Loader } from './loader.js';
import { Starfield } from './stars.js';
import { Globe } from './globe.js';
import { CameraRig } from './cameraRig.js';
import { Post } from './post.js';
import { createState, ScrollDirector } from './scroll.js';
import { Arcs } from './arcs.js';
import { Album } from './album/album.js';
import { PhotoLibrary } from './photos.js';
import { Finale } from './finale.js';
import { setupMusic } from './audio.js';

const loader = new Loader();
const state = createState();

/* ------------------------------------------------------------ renderer */
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({
  antialias: false,
  powerPreference: 'high-performance',
  stencil: false,
  depth: true,
});
renderer.setPixelRatio(targetPixelRatio());
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04060f);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 2500);
scene.add(camera); // l'album è figlio della camera

/* ------------------------------------------------------------ puntatore */
// Valori -1..1, smorzati nel loop (mouse su desktop, inclinazione su telefono)
const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
window.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') {
    pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = -((e.clientY / window.innerHeight) * 2 - 1);
  }
});
function onOrientation(e) {
  if (e.gamma == null || e.beta == null) return;
  pointer.tx = THREE.MathUtils.clamp(e.gamma / 25, -1, 1);
  pointer.ty = THREE.MathUtils.clamp((e.beta - 45) / 25, -1, 1);
}
/** Su iOS l'accesso all'inclinazione va chiesto dopo un tocco dell'utente. */
async function enableOrientation() {
  if (!isMobile || reducedMotion || typeof DeviceOrientationEvent === 'undefined') return;
  try {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      const res = await DeviceOrientationEvent.requestPermission();
      if (res !== 'granted') return;
    }
    window.addEventListener('deviceorientation', onOrientation);
  } catch {
    /* niente inclinazione: l'album fluttua comunque piano */
  }
}

/* ------------------------------------------------------------ risorse */
function loadEarthTextures() {
  const size = quality.textureSize;
  const report = loader.task('textures', 4);
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => report(loaded / total);
  const tl = new THREE.TextureLoader(manager);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const load = (file, srgb) =>
    new Promise((resolve) => {
      tl.load(
        `${import.meta.env.BASE_URL}textures/${file}`,
        (tex) => {
          tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          tex.anisotropy = Math.min(8, maxAniso);
          resolve(tex);
        },
        undefined,
        () => {
          // texture mancante: un colore pieno, il sito resta in piedi
          const c = document.createElement('canvas');
          c.width = c.height = 2;
          const g = c.getContext('2d');
          g.fillStyle = srgb ? '#1d3b6e' : '#000';
          g.fillRect(0, 0, 2, 2);
          resolve(new THREE.CanvasTexture(c));
        },
      );
    });
  // Il giorno è sempre in 4K: è la texture che si vede da vicino su Milano.
  // Notte e nuvole seguono la qualità (2K su telefono).
  const daySize = renderer.capabilities.maxTextureSize >= 4096 ? '4k' : '2k';
  return Promise.all([
    load(`earth_day_${daySize}.jpg`, true),
    load(`earth_night_${size}.jpg`, true),
    load(`earth_clouds_${size}.jpg`, false),
    load('earth_relief_2k.jpg', false),
  ]).then(([day, night, clouds, relief]) => ({ day, night, clouds, relief }));
}

async function loadFonts(report) {
  try {
    await Promise.all([
      document.fonts.load('80px "Great Vibes"'),
      document.fonts.load('80px "Allura"'),
      document.fonts.load('italic 20px "Cormorant Garamond"'),
      document.fonts.load('20px "Cormorant Garamond"'),
      document.fonts.load('16px "Inter"'),
    ]);
  } catch {
    /* si usano i font di riserva */
  }
  report(1);
}

/* ------------------------------------------------------------ avvio */
async function boot() {
  const fontsDone = loadFonts(loader.task('fonts', 0.5));
  const photos = new PhotoLibrary(loader);
  const photosReady = photos.init(); // non blocca mai: in caso di errore lo segnala
  const textures = await loadEarthTextures();
  await fontsDone;

  const stars = new Starfield(scene);
  const globe = new Globe(scene, textures);
  const rig = new CameraRig(camera);
  const arcs = new Arcs(globe);
  const post = new Post(renderer, scene, camera);
  const album = new Album({ camera, renderer, photos, state, globe, pointer });
  const finale = new Finale();

  // Pre-compila gli shader e carica le texture sulla GPU prima di mostrare la scena
  rig.intro = 0;
  rig.update(state, pointer);
  renderer.compile(scene, camera);
  renderer.initTexture(textures.day);
  renderer.initTexture(textures.night);
  renderer.initTexture(textures.clouds);

  await photosReady;
  await album.prepare(); // copertina + prime pagine
  // il permesso per l'inclinazione va chiesto proprio dentro il tocco (iOS)
  document.getElementById('enter').addEventListener('click', enableOrientation, { once: true });
  await loader.ready();

  const director = new ScrollDirector(state, {
    onLock: (dir) => album.activate(dir === 'down' ? 'start' : 'end'),
  });
  album.onExit = (dir) => {
    album.deactivate();
    director.release(dir);
  };

  finale.onRestart = () => {
    const fade = document.getElementById('fade');
    gsap.to(fade, {
      opacity: 1,
      duration: 0.9,
      ease: 'power2.inOut',
      onComplete: () => {
        album.reset();
        director.jumpToStart();
        rig.intro = 0;
        playIntro();
        gsap.to(fade, { opacity: 0, duration: 1.4, delay: 0.25, ease: 'power2.out' });
      },
    });
  };

  setupMusic();

  /* --- intro: la Terra arriva dall'alto */
  const hint = document.getElementById('scroll-hint');
  const hintIntro = { v: 0 };
  function playIntro() {
    hintIntro.v = 0;
    gsap.fromTo(
      rig,
      { intro: 0 },
      { intro: 1, duration: reducedMotion ? 0.01 : 4.2, ease: 'power2.inOut' },
    );
    gsap.to(hintIntro, { v: 1, duration: 1.2, delay: reducedMotion ? 0.4 : 3.4 });
  }
  loader.hide();
  playIntro();

  /* --- resize */
  function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(targetPixelRatio());
    renderer.setSize(w, h);
    post.setSize(w, h);
    stars.setPixelRatio(renderer.getPixelRatio());
    album.onResize();
  }
  window.addEventListener('resize', onResize);
  onResize();

  /* --- loop: un solo rAF (quello di GSAP, condiviso con Lenis) */
  let last = performance.now();
  let time = 0;
  gsap.ticker.add(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;

    // puntatore smorzato
    const k = 1 - Math.exp(-dt * 3.5);
    pointer.x += (pointer.tx - pointer.x) * k;
    pointer.y += (pointer.ty - pointer.y) * k;

    rig.update(state, pointer);
    camera.updateMatrixWorld();
    globe.update(dt, time, state, camera);
    stars.update(time, pointer, camera.position);
    arcs.update(dt, time, state, camera);
    album.update(dt, time);
    hint.style.opacity = String(hintIntro.v * state.hint);

    post.render(dt);
    adaptQuality(dt);
  });

  /* --- qualità adattiva: se un dispositivo fatica, abbassa un po' il pixel ratio */
  let frames = 0;
  let frameTime = 0;
  let lowStreak = 0;
  function adaptQuality(dt) {
    frames++;
    frameTime += dt;
    if (frameTime < 2) return;
    const fps = frames / frameTime;
    frames = 0;
    frameTime = 0;
    lowStreak = fps < 48 ? lowStreak + 1 : 0;
    const pr = renderer.getPixelRatio();
    if (lowStreak >= 2 && pr > 1.25) {
      lowStreak = 0;
      const next = Math.max(1.25, pr - 0.25);
      renderer.setPixelRatio(next);
      post.setSize(window.innerWidth, window.innerHeight);
      stars.setPixelRatio(next);
    }
  }

  // Esposti per il debug dalla console
  window.__sei = { state, director, album, globe, rig, camera, renderer, photos, gsap };
}

boot().catch((err) => {
  console.error(err);
  document.getElementById('loader-percent').textContent = 'Qualcosa è andato storto… ricarica la pagina 💛';
});
