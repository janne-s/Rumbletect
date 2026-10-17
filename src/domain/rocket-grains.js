import { RENDER, ROCKET } from './constants.js';
import { mergedGrains, pathGrains } from './grains.js';
import { ascentPath, rocketSource } from './rocket.js';
import { salvoRounds } from './salvo.js';
import { waveformShape } from './waveform.js';
import { speedOfSoundMetresPerSecond } from '../shared/domain/air.js';

const ROCKET_SHAPE = waveformShape({ skewness: ROCKET.skewness, kurtosis: ROCKET.kurtosis });

const arrivalAt = (path, scene, index) => {
  const sound = speedOfSoundMetresPerSecond(scene.air.temperatureCelsius);
  return Math.min(...scene.receivers.map(({ positionMetres: at }) => path.seconds[index] + Math.hypot(path.x[index] - at.x, path.y[index] - at.y, path.z[index] - at.z) / sound));
};

/** The index after which the ascent's direct sound reaches no microphone within the render's span from `firstArrival`, with a margin for echoes. */
export function heardSteps(path, scene, firstArrival = arrivalAt(path, scene, 0)) {
  const latest = firstArrival + RENDER.maximumSeconds - ROCKET.renderMarginSeconds;
  let last = path.seconds.length - 1;
  while (last > 0 && arrivalAt(path, scene, last) > latest) last -= 1;
  return last + 1;
}

const kept = (path, count) => (count === path.seconds.length ? path : Object.fromEntries(Object.entries(path).map(([key, values]) => [key, Array.isArray(values) ? values.slice(0, count) : values])));

/** Per round, the samples heard within the render's span from the salvo's first arrival. */
export function heardCounts(paths, scene) {
  const first = Math.min(...paths.map(path => arrivalAt(path, scene, 0)));
  return paths.map(path => heardSteps(path, scene, first));
}

/** Each round's ascent, cut where its sound would arrive after the render's span; unheard rounds dropped. */
export function heardAscents(emitter, scene) {
  const rounds = salvoRounds(emitter);
  const paths = rounds.map(ascentPath);
  const counts = heardCounts(paths, scene);
  return rounds.flatMap((round, index) => (counts[index] > 1 ? [{ round, path: kept(paths[index], counts[index]) }] : []));
}

/** The salvo's rounds as one emitter. */
export const rocketGrains = (emitter, scene) => mergedGrains(heardAscents(emitter, scene).map(({ round, path }) => pathGrains(round, scene, path, { ...rocketSource(round, scene, path), shape: ROCKET_SHAPE })));
