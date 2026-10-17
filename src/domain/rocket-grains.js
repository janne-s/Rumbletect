import { RENDER, ROCKET } from './constants.js';
import { pathGrains } from './grains.js';
import { ascentPath, rocketSource } from './rocket.js';
import { waveformShape } from './waveform.js';
import { speedOfSoundMetresPerSecond } from '../shared/domain/air.js';

const ROCKET_SHAPE = waveformShape({ skewness: ROCKET.skewness, kurtosis: ROCKET.kurtosis });

/** The index after which the ascent's direct sound reaches no microphone within the render's span, with a margin for echoes. */
export function heardSteps(path, scene) {
  const sound = speedOfSoundMetresPerSecond(scene.air.temperatureCelsius);
  const arrival = index => Math.min(...scene.receivers.map(({ positionMetres: at }) => path.seconds[index] + Math.hypot(path.x[index] - at.x, path.y[index] - at.y, path.z[index] - at.z) / sound));
  const latest = arrival(0) + RENDER.maximumSeconds - ROCKET.renderMarginSeconds;
  let last = path.seconds.length - 1;
  while (last > 1 && arrival(last) > latest) last -= 1;
  return last + 1;
}

export function heardAscent(emitter, scene) {
  const path = ascentPath(emitter);
  const kept = heardSteps(path, scene);
  if (kept === path.seconds.length) return path;
  return Object.fromEntries(Object.entries(path).map(([key, values]) => [key, Array.isArray(values) ? values.slice(0, kept) : values]));
}

export function rocketGrains(emitter, scene) {
  const path = heardAscent(emitter, scene);
  return pathGrains(emitter, scene, path, { ...rocketSource(emitter, scene, path), shape: ROCKET_SHAPE });
}
