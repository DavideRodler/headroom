/**
 * Post-processing leggero: bloom sulle luci, tone mapping cinematografico,
 * vignettatura e un filo di grana. Tutto in un'unica passata (libreria
 * "postprocessing", molto più leggera dell'UnrealBloom degli esempi).
 */
import * as THREE from 'three';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  VignetteEffect,
  NoiseEffect,
  ToneMappingEffect,
  ToneMappingMode,
  BlendFunction,
} from 'postprocessing';
import { quality } from './quality.js';

export class Post {
  constructor(renderer, scene, camera) {
    this.composer = new EffectComposer(renderer, {
      frameBufferType: THREE.HalfFloatType,
      multisampling: Math.min(quality.multisampling, renderer.capabilities.maxSamples || 0),
    });
    this.composer.addPass(new RenderPass(scene, camera));

    this.bloom = new BloomEffect({
      mipmapBlur: true,
      intensity: 0.85,
      luminanceThreshold: 1.2,
      luminanceSmoothing: 0.3,
      radius: 0.72,
      levels: quality.bloomLevels,
      resolutionScale: quality.bloomScale,
    });

    const toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });

    this.vignette = new VignetteEffect({ offset: 0.32, darkness: 0.62 });

    this.noise = new NoiseEffect({ premultiply: true, blendFunction: BlendFunction.SCREEN });
    this.noise.blendMode.opacity.value = 0.045;

    this.composer.addPass(new EffectPass(camera, this.bloom, toneMapping, this.vignette, this.noise));
  }

  setSize(w, h) {
    this.composer.setSize(w, h);
  }

  render(dt) {
    this.composer.render(dt);
  }
}
