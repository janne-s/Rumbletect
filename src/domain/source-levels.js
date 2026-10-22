import { PROPAGATION } from './constants.js';
import { sampled } from './grains.js';
import { airDensityKilogramsPerCubicMetre, speedOfSoundMetresPerSecond } from '../shared/domain/air.js';
import { aWeightingDecibels, REFERENCE_PRESSURE_PA } from '../shared/domain/levels.js';

const REFERENCE_POWER_WATTS = 1e-12;
const LEVELS = Object.freeze({ moments: 6, inletSteps: 24, azimuthSteps: 1, kilometre: 1000 });

const weightsFor = new Map();

function grid(sampleRate) {
  if (!weightsFor.has(sampleRate)) {
    const binHz = sampleRate / PROPAGATION.grainSamples;
    const frequencies = Array.from({ length: PROPAGATION.grainSamples / 2 + 1 }, (_, bin) => bin * binHz);
    weightsFor.set(sampleRate, { binHz, frequencies, aWeights: frequencies.map(hz => (hz > 0 ? 10 ** (aWeightingDecibels(hz) / 10) : 0)) });
  }
  return weightsFor.get(sampleRate);
}

/**
 * The loudest moment of a source along its path, from the spectra its grains use (PSDs at 1 m, before Doppler and
 * propagation): its sound power level LW re 1 pW over the sphere, and its A-weighted level 1 km away by spreading
 * alone toward its loudest direction.
 */
export function sourceLevels(source, path, scene) {
  const { binHz, frequencies, aWeights } = grid(scene.render.sampleRate);
  const { air } = scene;
  const impedance = airDensityKilogramsPerCubicMetre(air.pressureKpa * 1000, air.temperatureCelsius) * speedOfSoundMetresPerSecond(air.temperatureCelsius);
  const duration = (path.seconds.length - 1) * path.step;
  const inletStep = Math.PI / LEVELS.inletSteps;
  const azimuthStep = Math.PI / LEVELS.azimuthSteps;
  let watts = 0;
  let loudestWeighted = 0;
  for (let moment = 0; moment < LEVELS.moments; moment += 1) {
    const seconds = path.seconds[0] + duration * moment / (LEVELS.moments - 1);
    const { position, velocity } = sampled(path, seconds);
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    const components = source.components({ seconds, position, velocity, speed });
    if (!components) continue;
    let sphere = 0;
    for (let inlet = 0; inlet < LEVELS.inletSteps; inlet += 1) {
      const theta = (inlet + .5) * inletStep;
      for (let azimuth = 0; azimuth < LEVELS.azimuthSteps; azimuth += 1) {
        const { shaped, plain } = source.spectra(components, theta * 180 / Math.PI, frequencies, (azimuth + .5) * azimuthStep * 180 / Math.PI);
        let total = 0;
        let weighted = 0;
        for (let bin = 0; bin < frequencies.length; bin += 1) {
          const psd = shaped[bin] + plain[bin];
          total += psd;
          weighted += psd * aWeights[bin];
        }
        sphere += total * binHz * Math.sin(theta) * inletStep * 2 * azimuthStep;
        loudestWeighted = Math.max(loudestWeighted, weighted * binHz);
      }
    }
    watts = Math.max(watts, sphere / impedance);
  }
  return {
    soundPowerDecibels: 10 * Math.log10(watts / REFERENCE_POWER_WATTS),
    aWeightedAtKilometreDecibels: 10 * Math.log10(loudestWeighted / LEVELS.kilometre ** 2 / REFERENCE_PRESSURE_PA ** 2)
  };
}
