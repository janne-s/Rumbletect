import { JET, JET_FLIGHT, LOW_BAND, PROPAGATION, SYNTHESIS } from './constants.js';
import { jetOfEngine, powerOfEngine } from './engine.js';
import { addTurbomachinery, referencePower, turbomachineryAt } from './turbomachinery.js';
import { jetComponents, jetSpectra, speedOfSound } from './jet.js';
import { shapeWaveform, waveformShape } from './waveform.js';
import { fft, nextPowerOfTwo } from '../shared/domain/fft.js';
import { createRandom, normalDeviate } from '../shared/domain/random.js';
import { sourceTable } from '../shared/domain/source-table.js';
import { flightPath, formationMembers } from '../shared/domain/trajectory.js';
import { PARAMETERS } from './scene.js';

const GRAIN = PROPAGATION.grainSamples;
const WINDOW = Float64Array.from({ length: GRAIN }, (_, index) => Math.sin(Math.PI * (index + .5) / GRAIN));
const STREAMS = Object.freeze({ fine: 0, large: 0x9e3779b9, envelope: 0x85ebca6b, low: 0xc2b2ae35 });

/**
 * The jet's flight in still air of the ground's temperature, as the near listen flew it. With `autoDuration` it
 * flies on until every microphone is `JET_FLIGHT.hearingDecibels` below its closest approach by spreading.
 */
export function jetPath(emitter, scene) {
  const air = { ...scene.air, refraction: false };
  if (!emitter.autoDuration) return flightPath(emitter, air);
  const path = flightPath({ ...emitter, durationSeconds: PARAMETERS.flightSeconds.maximum }, air);
  const ratio = 10 ** (JET_FLIGHT.hearingDecibels / 20);
  let end = 0;
  for (const { positionMetres: at } of scene.receivers) {
    const distances = path.x.map((x, index) => Math.hypot(x - at.x, path.y[index] - at.y, path.z[index] - at.z));
    const closest = distances.indexOf(Math.min(...distances));
    const quiet = distances.findIndex((distance, index) => index > closest && distance >= ratio * distances[closest]);
    end = Math.max(end, quiet < 0 ? distances.length - 1 : quiet);
  }
  const kept = Math.max(1, end) + 1;
  return Object.fromEntries(Object.entries(path).map(([key, values]) => [key, Array.isArray(values) ? values.slice(0, kept) : values]));
}

function sampled(path, seconds) {
  const last = path.seconds.length - 1;
  const position = Math.min(last, Math.max(0, (seconds - path.seconds[0]) / path.step));
  const index = Math.min(last - 1, Math.floor(position));
  const share = position - index;
  const at = values => values[index] + (values[index + 1] - values[index]) * share;
  return { position: { x: at(path.x), y: at(path.y), z: at(path.z) }, velocity: { x: at(path.vx), y: at(path.vy), z: at(path.vz) } };
}

function gaussianFrame(random, psd, sampleRate, size = GRAIN) {
  const real = new Float64Array(size);
  const imaginary = new Float64Array(size);
  for (let bin = 1; bin < size / 2; bin += 1) {
    const scale = Math.sqrt(size * sampleRate * psd[bin] / 4);
    real[bin] = scale * normalDeviate(random);
    imaginary[bin] = scale * normalDeviate(random);
    real[size - bin] = real[bin];
    imaginary[size - bin] = -imaginary[bin];
  }
  fft(real, imaginary, true);
  return real;
}

const lowShare = frequency => 1 / (1 + (frequency / LOW_BAND.crossoverHz) ** 4);

/** A source's spectra restricted to one band: 'low', 'high', or 'full' (unsplit). */
function banded(source, band) {
  if (band === 'full') return source;
  const share = band === 'low' ? lowShare : frequency => 1 - lowShare(frequency);
  return {
    ...source,
    spectra(components, inletDegrees, frequencies) {
      const { shaped, plain } = source.spectra(components, inletDegrees, frequencies);
      const weights = frequencies.map(share);
      return { shaped: shaped.map((value, index) => value * weights[index]), plain: plain.map((value, index) => value * weights[index]) };
    }
  };
}

const catmullRom = (samples, position) => {
  const index = Math.floor(position);
  const t = position - index;
  const at = offset => { const at = index + offset; return at >= 0 && at < samples.length ? samples[at] : 0; };
  const [a, b, c, d] = [at(-1), at(0), at(1), at(2)];
  return b + .5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
};

/** The renderer drops each frame's DC, so a grain carrying a mean would step at frame edges; a sine taper removes it. */
function removeMean(samples, first, last, sum) {
  const span = last - first + 2;
  let weights = 0;
  for (let sample = first; sample <= last; sample += 1) weights += Math.sin(Math.PI * (sample - first + 1) / span);
  for (let sample = first; sample <= last; sample += 1) samples[sample] -= sum * Math.sin(Math.PI * (sample - first + 1) / span) / weights;
}

/**
 * Grains along a path (`tect-shared-interfaces.md`, grains): sine-windowed frames at half overlap, each heard toward
 * a path's departure. `source.components(state)` gives a grain's source state or null when it is silent;
 * `source.spectra(components, inletDegrees, frequencies)` its shaped and plain PSDs at 1 m, inlet 0 ahead along its
 * axis; `source.packetHz(components)` the corner of its intermittency; `source.axis` and `source.place` optionally
 * its axis and emission point when they differ from its flight. Its Doppler shift and −10 log|1 − M cos ψ|
 * (Stone et al. 2003, eq. 2) come with the grain, so they count once. Ahead of a supersonic grain's Mach cone the
 * factor is negative and the grain arrives reversed.
 */
export function pathGrains(emitter, scene, path, unbanded, band = 'full') {
  if (band === 'low') return lowBandGrains(emitter, scene, path, banded(unbanded, 'low'));
  const source = banded(unbanded, band);
  const { air } = scene;
  const sampleRate = scene.render.sampleRate;
  const sound = speedOfSound(air.temperatureCelsius);
  const grainSeconds = GRAIN / sampleRate;
  const hopSeconds = grainSeconds / 2;
  const duration = (path.seconds.length - 1) * path.step;
  const binHz = sampleRate / GRAIN;
  const frequencies = Array.from({ length: GRAIN / 2 + 1 }, (_, bin) => bin * binHz);
  const grains = [];
  for (let index = 0; index * hopSeconds <= duration; index += 1) {
    const centre = path.seconds[0] + index * hopSeconds;
    const { position, velocity } = sampled(path, centre);
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    const components = source.components({ seconds: centre, position, velocity, speed });
    if (!components) { grains.push({ heard: false }); continue; }
    const axis = source.axis?.(components, velocity, speed) ?? null;
    const side = source.spectra(components, 90, frequencies);
    let sum = 0;
    for (const part of [side.shaped, side.plain]) for (let bin = 0; bin < part.length; bin += 1) sum += part[bin];
    const power = sum * binHz;
    grains.push({ centre, position: source.place?.(components, position, axis) ?? position, velocity, speed, axis, components, amplitude: Math.sqrt(power), heard: power > 0 });
  }
  const rows = grains.flatMap((grain, index) => (!grain.heard ? [] : [{
    positionMetres: grain.position, direction: null, elementMetres: 0, emissionSeconds: grain.centre - grainSeconds, amplitudePaMetres: grain.amplitude,
    pulse: 'grain', noiseSeed: index, durationSeconds: grainSeconds, decay: 0, spanSeconds: 2 * grainSeconds, linearRadiusMetres: 0
  }]));

  function emission(index, departure, plan) {
    const grain = grains[index];
    const cosine = grain.speed > 0 ? (grain.velocity.x * departure.x + grain.velocity.y * departure.y + grain.velocity.z * departure.z) / grain.speed : 1;
    const mach = grain.speed / sound;
    const signed = 1 - mach * cosine;
    const compression = Math.sign(signed || 1) * Math.max(JET_FLIGHT.smallestCompression, Math.abs(signed));
    const squeeze = Math.abs(compression);
    const axial = grain.axis ? grain.axis.x * departure.x + grain.axis.y * departure.y + grain.axis.z * departure.z : cosine;
    const inletDegrees = Math.acos(Math.max(-1, Math.min(1, axial))) * 180 / Math.PI;
    const { shaped: shapedPsd, plain } = source.spectra(grain.components, inletDegrees, frequencies);
    const cutoff = source.packetHz(grain.components);
    const lowPass = frequencies.map(frequency => (frequency > 0 ? 1 / (1 + (frequency / cutoff) ** 2) : 0));
    const lowPassSum = lowPass.reduce((sum, value) => sum + value, 0) * binHz;
    const stream = (psd, salt) => gaussianFrame(createRandom((emitter.seed ^ Math.imul(index + 1, 0x27d4eb2d) ^ salt) >>> 0), psd, sampleRate);
    const plainFrame = stream(plain, STREAMS.fine);
    const shapedFrame = stream(shapedPsd, STREAMS.large);
    const envelope = stream(lowPass.map(value => value / lowPassSum), STREAMS.envelope);
    const rms = Math.sqrt(shapedPsd.reduce((sum, value) => sum + value, 0) * binHz);
    const shaped = shapeWaveform(shapedFrame, () => rms, envelope, source.shape);
    const real = Float64Array.from(WINDOW, (window, sample) => window * (shaped[sample] + plainFrame[sample]));
    const imaginary = new Float64Array(GRAIN);
    fft(real, imaginary);
    const limit = SYNTHESIS.bandLimitShare * sampleRate * squeeze / binHz;
    for (let bin = 0; bin <= GRAIN / 2; bin += 1) {
      if (bin < limit) continue;
      real[bin] = 0; imaginary[bin] = 0;
      if (bin > 0 && bin < GRAIN / 2) { real[GRAIN - bin] = 0; imaginary[GRAIN - bin] = 0; }
    }
    fft(real, imaginary, true);
    const out = new Float64Array(plan.size);
    const outImaginary = new Float64Array(plan.size);
    const gain = 1 / (Math.sqrt(squeeze) * grain.amplitude * sampleRate);
    const half = GRAIN * squeeze / 2;
    const [first, last] = [Math.max(0, Math.floor(GRAIN - half) - 2), Math.min(plan.size - 1, Math.ceil(GRAIN + half) + 2)];
    let sum = 0;
    for (let sample = first; sample <= last; sample += 1) {
      out[sample] = gain * catmullRom(real, GRAIN / 2 + (sample - GRAIN) / compression);
      sum += out[sample];
    }
    removeMean(out, first, last, sum);
    fft(out, outImaginary);
    return { re: out, im: outImaginary };
  }

  return { sources: sourceTable(rows), rows, emission };
}

const LOW_WINDOW = Float64Array.from({ length: LOW_BAND.internalSamples }, (_, index) => Math.sin(Math.PI * (index + .5) / LOW_BAND.internalSamples));

/**
 * The low band's grains along a path: each a Gaussian frame of `LOW_BAND.internalSamples` at a low rate, sine-windowed,
 * and its spectrum evaluated directly on the render frame's bins up to `LOW_BAND.highestFrequencyHz`. Time is scaled by
 * the grain's Doppler compression as in the short grains, and reversed ahead of a supersonic grain's Mach cone.
 */
function lowBandGrains(emitter, scene, path, source) {
  const sampleRate = scene.render.sampleRate;
  const sound = speedOfSound(scene.air.temperatureCelsius);
  const size = LOW_BAND.internalSamples;
  const grainSamples = nextPowerOfTwo(Math.round(LOW_BAND.grainSeconds * sampleRate));
  const grainSeconds = grainSamples / sampleRate;
  const rate = size / grainSeconds;
  const frequencies = Array.from({ length: size / 2 + 1 }, (_, bin) => bin * rate / size);
  const binHz = rate / size;
  const duration = (path.seconds.length - 1) * path.step;
  const grains = [];
  for (let index = 0; index * grainSeconds / 2 <= duration; index += 1) {
    const centre = path.seconds[0] + index * grainSeconds / 2;
    const { position, velocity } = sampled(path, centre);
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    const components = source.components({ seconds: centre, position, velocity, speed });
    if (!components) { grains.push({ heard: false }); continue; }
    const axis = source.axis?.(components, velocity, speed) ?? null;
    const side = source.spectra(components, 90, frequencies);
    let sum = 0;
    for (const part of [side.shaped, side.plain]) for (let bin = 1; bin < part.length; bin += 1) sum += part[bin];
    const power = sum * binHz;
    grains.push({ centre, position: source.place?.(components, position, axis) ?? position, velocity, speed, axis, components, amplitude: Math.sqrt(power), heard: power > 0 });
  }
  const rows = grains.flatMap((grain, index) => (!grain.heard ? [] : [{
    positionMetres: grain.position, direction: null, elementMetres: 0, emissionSeconds: grain.centre - grainSeconds, amplitudePaMetres: grain.amplitude,
    pulse: 'grain', noiseSeed: index, durationSeconds: grainSeconds, decay: 0, spanSeconds: 2 * grainSeconds, linearRadiusMetres: 0
  }]));

  function emission(index, departure, plan) {
    const grain = grains[index];
    const cosine = grain.speed > 0 ? (grain.velocity.x * departure.x + grain.velocity.y * departure.y + grain.velocity.z * departure.z) / grain.speed : 1;
    const signed = 1 - grain.speed / sound * cosine;
    const compression = Math.sign(signed || 1) * Math.max(JET_FLIGHT.smallestCompression, Math.abs(signed));
    const squeeze = Math.abs(compression);
    const axial = grain.axis ? grain.axis.x * departure.x + grain.axis.y * departure.y + grain.axis.z * departure.z : cosine;
    const inletDegrees = Math.acos(Math.max(-1, Math.min(1, axial))) * 180 / Math.PI;
    const { shaped, plain } = source.spectra(grain.components, inletDegrees, frequencies);
    const psd = shaped.map((value, bin) => value + plain[bin]);
    const frame = gaussianFrame(createRandom((emitter.seed ^ Math.imul(index + 1, 0x27d4eb2d) ^ STREAMS.low) >>> 0), psd, rate, size);
    let mean = 0;
    for (let sample = 0; sample < size; sample += 1) { frame[sample] *= LOW_WINDOW[sample]; mean += frame[sample]; }
    removeMean(frame, 0, size - 1, mean);
    const bins = Math.min(plan.size / 2, Math.ceil(LOW_BAND.highestFrequencyHz * plan.size / sampleRate) + 2);
    const re = new Float64Array(bins);
    const im = new Float64Array(bins);
    const step = squeeze / rate / (Math.sqrt(squeeze) * grain.amplitude);
    const omega = 2 * Math.PI * sampleRate / plan.size;
    for (let sample = 0; sample < size; sample += 1) {
      const value = frame[sample] * step;
      if (value === 0) continue;
      const seconds = grainSeconds + (sample + .5 - size / 2) * compression / rate;
      const [stepRe, stepIm] = [Math.cos(omega * seconds), -Math.sin(omega * seconds)];
      let [phaseRe, phaseIm] = [stepRe, stepIm];
      for (let bin = 1; bin < bins; bin += 1) {
        re[bin] += value * phaseRe;
        im[bin] += value * phaseIm;
        [phaseRe, phaseIm] = [phaseRe * stepRe - phaseIm * stepIm, phaseRe * stepIm + phaseIm * stepRe];
      }
    }
    return { re, im };
  }

  return { sources: sourceTable(rows), rows, emission };
}

/** Several emitters' grains as one: noise seeds offset per member so that `emission` finds the member's own. */
export function mergedGrains(members) {
  if (members.length === 1) return members[0];
  const offsets = [];
  let next = 0;
  const rows = members.flatMap(({ rows }) => {
    const offset = next;
    offsets.push(offset);
    next = offset + Math.max(-1, ...rows.map(row => row.noiseSeed)) + 1;
    return rows.map(row => ({ ...row, noiseSeed: row.noiseSeed + offset }));
  });
  const owner = seed => { let index = offsets.length - 1; while (offsets[index] > seed) index -= 1; return index; };
  const emission = (seed, departure, plan) => { const index = owner(seed); return members[index].emission(seed - offsets[index], departure, plan); };
  return { sources: sourceTable(rows), rows, emission };
}

/** Class C: a formation's jets, the shared V with a seed for each aircraft, the leader's its own; any other jet is its only member. */
export function formationJets(emitter) {
  if (emitter.kind !== 'formation') return [emitter];
  const random = createRandom(emitter.seed);
  return formationMembers(emitter, emitter.memberCount, emitter.lateralSpacingMetres, emitter.trailSpacingMetres)
    .map((member, index) => ({ ...member, kind: 'jet', seed: index === 0 ? emitter.seed : Math.floor(random() * 0x100000000) }));
}

const JET_SHAPE = waveformShape({ skewness: JET.largeScaleSkewness, kurtosis: JET.largeScaleKurtosis });

export function jetGrains(emitter, scene, band = 'full') {
  const { air } = scene;
  const jet = jetOfEngine(emitter.engine, air.temperatureCelsius);
  const { engines } = emitter.engine;
  const turbo = turbomachineryAt(emitter.engineClass, powerOfEngine(emitter.engine, emitter.engineClass), referencePower(emitter.engineClass, air.temperatureCelsius));
  const source = {
    components: ({ speed }) => jetComponents(jet, { temperatureCelsius: air.temperatureCelsius, flightMetresPerSecond: speed }),
    spectra: (components, inletDegrees, frequencies) => {
      const { large, fine } = jetSpectra(components, inletDegrees, frequencies);
      addTurbomachinery(fine, frequencies, turbo, inletDegrees);
      return engines === 1 ? { shaped: large, plain: fine } : { shaped: large.map(value => value * engines), plain: fine.map(value => value * engines) };
    },
    packetHz: components => components.large.peakHz / JET.packetCycles,
    shape: JET_SHAPE
  };
  return mergedGrains(formationJets(emitter).map(member => pathGrains(member, scene, jetPath(member, scene), source, band)));
}
