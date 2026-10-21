import { JET, KELVIN_OFFSET, TRAJECTORY, VOLCANO } from './constants.js';
import { mergedGrains, pathGrains } from './grains.js';
import { jetComponents, jetSpectra } from './jet.js';
import { waveformShape } from './waveform.js';
import { createRandom } from '../shared/domain/random.js';

const SHAPE = waveformShape({ skewness: JET.largeScaleSkewness, kurtosis: JET.largeScaleKurtosis });
const UPWARD_INLET = Object.freeze({ x: 0, y: 0, z: -1 });
const VENT_GAIN = 10 ** (VOLCANO.ventJets.decibels / 10);

export const volcanoCategory = key => VOLCANO.categories.find(category => category.key === key) ?? VOLCANO.categories.at(-1);

export const volcanoSourcePosition = (volcano, position = volcano.ventMetres) => ({ x: position.x, y: position.y, z: position.z + VOLCANO.sourceDiameters * volcano.jet.ventDiameterMetres });

const smoothStep = value => { const t = Math.min(1, Math.max(0, value)); return t * t * (3 - 2 * t); };

/**
 * Class C: the share of the exit velocity at `seconds` after the start: a smooth onset, the pulsing (a sine whose phase
 * wanders by a seeded random walk), and a fade to the end of the eruption.
 */
export function eruptionShare(volcano, seconds) {
  const { eruptionSeconds, riseSeconds, fadeSeconds, pulsePeriodSeconds, pulseDepthPercent } = volcano.eruption;
  if (seconds < 0 || seconds > eruptionSeconds) return 0;
  const envelope = smoothStep(seconds / Math.max(1e-6, riseSeconds)) * smoothStep((eruptionSeconds - seconds) / Math.max(1e-6, fadeSeconds));
  const phase = 2 * Math.PI * seconds / pulsePeriodSeconds + wander(volcano.seed, seconds / pulsePeriodSeconds);
  return envelope * (1 - pulseDepthPercent / 100 * (1 - Math.cos(phase)) / 2);
}

function wander(seed, cycles) {
  const random = createRandom(seed);
  const whole = Math.floor(cycles);
  let [phase, next] = [0, 0];
  for (let cycle = 0; cycle <= whole + 1; cycle += 1) { phase = next; next += VOLCANO.pulseWander * 2 * Math.PI * (random() - .5); }
  return phase + (next - phase) * (cycles - whole);
}

/** The vent held still for the eruption, sampled like `flightPath`. */
export function ventPath(volcano) {
  const total = volcano.eruption.eruptionSeconds;
  const steps = Math.min(TRAJECTORY.maximumSteps, Math.max(2, Math.ceil(total / TRAJECTORY.stepSeconds)));
  const step = total / steps;
  const at = volcano.ventMetres;
  const path = { seconds: [], x: [], y: [], z: [], vx: [], vy: [], vz: [], speed: [], step };
  for (let index = 0; index <= steps; index += 1) {
    path.seconds.push(volcano.startSeconds + index * step);
    path.x.push(at.x); path.y.push(at.y); path.z.push(at.z);
    path.vx.push(0); path.vy.push(0); path.vz.push(0); path.speed.push(0);
  }
  return path;
}

/** The eruption jet as Tam's two components (B structure, C values), the jet upward from the vent, its exit velocity following the eruption. */
export function volcanoGrains(volcano, scene, band = 'full') {
  const { air } = scene;
  const temperatureRatio = volcano.jet.gasTemperatureKelvin / (air.temperatureCelsius + KELVIN_OFFSET);
  const diameter = volcano.jet.ventDiameterMetres;
  return mergedGrains([pathGrains(volcano, scene, ventPath(volcano), {
    components: ({ seconds }) => {
      const share = eruptionShare(volcano, seconds - volcano.startSeconds);
      if (share <= 0) return null;
      const velocityMetresPerSecond = volcano.jet.ventVelocityMetresPerSecond * share;
      const jet = diameterMetres => jetComponents({ diameterMetres, velocityMetresPerSecond, temperatureRatio }, { temperatureCelsius: air.temperatureCelsius });
      return { main: jet(diameter), vents: jet(diameter * VOLCANO.ventJets.diameterShare) };
    },
    axis: () => UPWARD_INLET,
    place: (components, position) => volcanoSourcePosition(volcano, position),
    spectra: ({ main, vents }, inletDegrees, frequencies) => {
      const { large, fine } = jetSpectra(main, inletDegrees, frequencies);
      const small = jetSpectra(vents, inletDegrees, frequencies);
      large.forEach((value, index) => { large[index] = value + VENT_GAIN * small.large[index]; fine[index] += VENT_GAIN * small.fine[index]; });
      return { shaped: large, plain: fine };
    },
    packetHz: ({ main }) => main.large.peakHz / JET.packetCycles,
    shape: SHAPE
  }, band)]);
}
