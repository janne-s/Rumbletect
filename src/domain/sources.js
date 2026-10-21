import { LOW_BAND } from './constants.js';
import { jetGrains } from './grains.js';
import { rocketGrains } from './rocket-grains.js';
import { volcanoGrains } from './volcano.js';

const bands = grains => ({
  high: { sources: (emitter, scene) => grains(emitter, scene, 'high') },
  low: { sources: (emitter, scene) => grains(emitter, scene, 'low'), highestFrequencyHz: LOW_BAND.highestFrequencyHz }
});

const KINDS = { jet: bands(jetGrains), formation: bands(jetGrains), airliner: bands(jetGrains), rocket: bands(rocketGrains), salvo: bands(rocketGrains), volcano: bands(volcanoGrains) };

/** Each kind as two prepared emitters, its short grains above the crossover and its long grains below. */
export const SOURCE_KINDS = Object.freeze(Object.fromEntries(Object.entries(KINDS).flatMap(([kind, { high, low }]) => [[kind, high], [`${kind}:low`, low]])));

export const withLowBands = emitters => emitters.flatMap(emitter => (emitter.enabled && SOURCE_KINDS[`${emitter.kind}:low`] ? [emitter, { ...emitter, kind: `${emitter.kind}:low` }] : [emitter]));
