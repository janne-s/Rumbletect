import { JET, PROPAGATION, SYNTHESIS } from './constants.js';
import { jetOfEngine } from './engine.js';
import { jetComponents, jetSpectra, speedOfSound } from './jet.js';
import { shapeWaveform, waveformShape } from './waveform.js';
import { fft } from '../shared/domain/fft.js';
import { createRandom, normalDeviate } from '../shared/domain/random.js';
import { sourceTable } from '../shared/domain/source-table.js';
import { flightPath } from '../shared/domain/trajectory.js';
import { PARAMETERS } from './scene.js';

const GRAIN = PROPAGATION.grainSamples;
const WINDOW = Float64Array.from({ length: GRAIN }, (_, index) => Math.sin(Math.PI * (index + .5) / GRAIN));
const STREAMS = Object.freeze({ fine: 0, large: 0x9e3779b9, envelope: 0x85ebca6b });

/** The jet's flight in still air of the ground's temperature, as the near listen flew it. */
export const jetPath = (emitter, air) => flightPath(emitter, { ...air, refraction: false });

function sampled(path, seconds) {
  const last = path.seconds.length - 1;
  const position = Math.min(last, Math.max(0, (seconds - path.seconds[0]) / path.step));
  const index = Math.min(last - 1, Math.floor(position));
  const share = position - index;
  const at = values => values[index] + (values[index + 1] - values[index]) * share;
  return { position: { x: at(path.x), y: at(path.y), z: at(path.z) }, velocity: { x: at(path.vx), y: at(path.vy), z: at(path.vz) } };
}

function gaussianFrame(random, psd, sampleRate) {
  const real = new Float64Array(GRAIN);
  const imaginary = new Float64Array(GRAIN);
  for (let bin = 1; bin < GRAIN / 2; bin += 1) {
    const scale = Math.sqrt(GRAIN * sampleRate * psd[bin] / 4);
    real[bin] = scale * normalDeviate(random);
    imaginary[bin] = scale * normalDeviate(random);
    real[GRAIN - bin] = real[bin];
    imaginary[GRAIN - bin] = -imaginary[bin];
  }
  fft(real, imaginary, true);
  return real;
}

const catmullRom = (samples, position) => {
  const index = Math.floor(position);
  const t = position - index;
  const at = offset => { const at = index + offset; return at >= 0 && at < samples.length ? samples[at] : 0; };
  const [a, b, c, d] = [at(-1), at(0), at(1), at(2)];
  return b + .5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
};

/**
 * A jet as grains along its flight (`tect-shared-interfaces.md`, grains): sine-windowed frames at half overlap,
 * each heard toward a path's departure. Its Doppler shift and −10 log(1 − M cos ψ) (Stone et al. 2003, eq. 2)
 * come with the grain, as the near listen applied them, so they count once.
 */
export function jetGrains(emitter, scene) {
  const { air } = scene;
  const sampleRate = scene.render.sampleRate;
  const sound = speedOfSound(air.temperatureCelsius);
  const path = jetPath(emitter, air);
  const jet = jetOfEngine(emitter.engine, air.temperatureCelsius);
  const shape = waveformShape({ skewness: JET.largeScaleSkewness, kurtosis: JET.largeScaleKurtosis });
  const grainSeconds = GRAIN / sampleRate;
  const hopSeconds = grainSeconds / 2;
  const duration = (path.seconds.length - 1) * path.step;
  const limit = PARAMETERS.mach.maximum * sound;
  const crossing = path.speed.findIndex(speed => speed > limit);
  if (crossing >= 0) {
    const top = Math.max(...path.speed) / sound;
    throw new RangeError(`${emitter.name} passes Mach ${PARAMETERS.mach.maximum} at ${(crossing * path.step).toFixed(1)} s and reaches Mach ${top.toFixed(2)}; jets here fly below the speed of sound.`);
  }
  const binHz = sampleRate / GRAIN;
  const frequencies = Array.from({ length: GRAIN / 2 + 1 }, (_, bin) => bin * binHz);
  const grains = [];
  for (let index = 0; index * hopSeconds <= duration; index += 1) {
    const centre = path.seconds[0] + index * hopSeconds;
    const { position, velocity } = sampled(path, centre);
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    const components = jetComponents(jet, { temperatureCelsius: air.temperatureCelsius, flightMetresPerSecond: speed });
    const side = jetSpectra(components, 90, frequencies);
    const power = [...side.large, ...side.fine].reduce((sum, value) => sum + value, 0) * binHz;
    grains.push({ centre, position, velocity, speed, components, amplitude: Math.sqrt(power) || 1 });
  }
  const rows = grains.map((grain, index) => ({
    positionMetres: grain.position, direction: null, elementMetres: 0, emissionSeconds: grain.centre - grainSeconds, amplitudePaMetres: grain.amplitude,
    pulse: 'grain', noiseSeed: index, durationSeconds: grainSeconds, decay: 0, spanSeconds: 2 * grainSeconds, linearRadiusMetres: 0
  }));

  function emission(index, departure, plan) {
    const grain = grains[index];
    const cosine = grain.speed > 0 ? (grain.velocity.x * departure.x + grain.velocity.y * departure.y + grain.velocity.z * departure.z) / grain.speed : 1;
    const mach = grain.speed / sound;
    const compression = Math.max(1 - PARAMETERS.mach.maximum, 1 - mach * cosine);
    const inletDegrees = Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI;
    const { large, fine } = jetSpectra(grain.components, inletDegrees, frequencies);
    const cutoff = grain.components.large.peakHz / JET.packetCycles;
    const lowPass = frequencies.map(frequency => (frequency > 0 ? 1 / (1 + (frequency / cutoff) ** 2) : 0));
    const lowPassSum = lowPass.reduce((sum, value) => sum + value, 0) * binHz;
    const stream = (psd, salt) => gaussianFrame(createRandom((emitter.seed ^ Math.imul(index + 1, 0x27d4eb2d) ^ salt) >>> 0), psd, sampleRate);
    const fineFrame = stream(fine, STREAMS.fine);
    const largeFrame = stream(large, STREAMS.large);
    const envelope = stream(lowPass.map(value => value / lowPassSum), STREAMS.envelope);
    const rms = Math.sqrt(large.reduce((sum, value) => sum + value, 0) * binHz);
    const shaped = shapeWaveform(largeFrame, () => rms, envelope, shape);
    const real = Float64Array.from(WINDOW, (window, sample) => window * (shaped[sample] + fineFrame[sample]));
    const imaginary = new Float64Array(GRAIN);
    fft(real, imaginary);
    const limit = SYNTHESIS.bandLimitShare * sampleRate * compression / binHz;
    for (let bin = 0; bin <= GRAIN / 2; bin += 1) {
      if (bin < limit) continue;
      real[bin] = 0; imaginary[bin] = 0;
      if (bin > 0 && bin < GRAIN / 2) { real[GRAIN - bin] = 0; imaginary[GRAIN - bin] = 0; }
    }
    fft(real, imaginary, true);
    const out = new Float64Array(plan.size);
    const outImaginary = new Float64Array(plan.size);
    const gain = 1 / (Math.sqrt(compression) * grain.amplitude * sampleRate);
    const half = GRAIN * compression / 2;
    for (let sample = Math.max(0, Math.floor(GRAIN - half) - 2); sample <= Math.min(plan.size - 1, Math.ceil(GRAIN + half) + 2); sample += 1) {
      out[sample] = gain * catmullRom(real, GRAIN / 2 + (sample - GRAIN) / compression);
    }
    fft(out, outImaginary);
    return { re: out, im: outImaginary };
  }

  return { sources: sourceTable(rows), rows, emission };
}
