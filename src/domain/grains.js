import { followedPath } from '../shared/domain/follower.js';
import { ENGINE, JET, JET_FLIGHT, LOW_BAND, PROPAGATION, SHOCK_FORMATION, SYNTHESIS } from './constants.js';
import { addAirframe, airframeAt } from './airframe.js';
import { powerOfEngine, streamsOf } from './engine.js';
import { addTurbomachinery, referencePower, turbomachineryAt } from './turbomachinery.js';
import { jetComponents, jetSpectra } from './jet.js';
import { shapeWaveform, waveformShape } from './waveform.js';
import { fft, nextPowerOfTwo, realSpectrum } from '../shared/domain/fft.js';
import { createRandom, normalDeviate, normalDeviates } from '../shared/domain/random.js';
import { sourceTable } from '../shared/domain/source-table.js';
import { flightPath, formationMembers, soundSpeedAt } from '../shared/domain/trajectory.js';
import { PARAMETERS } from './scene.js';

const GRAIN = PROPAGATION.grainSamples;
const WINDOW = Float64Array.from({ length: GRAIN }, (_, index) => Math.sin(Math.PI * (index + .5) / GRAIN));
const STREAMS = Object.freeze({ fine: 0, large: 0x9e3779b9, envelope: 0x85ebca6b, low: 0xc2b2ae35 });

/** The flight's turn on its radius from its start, or none; it does not depend on how long the flight is. */
const arcOf = emitter => (emitter.turnDegrees ? { degrees: emitter.turnDegrees, fromSeconds: emitter.turnStartSeconds, radiusMetres: emitter.turnRadiusMetres } : null);

const withTurn = ({ arcSeconds, ...path }) => ({ ...path, turnSeconds: arcSeconds ? arcSeconds.filter(seconds => seconds !== null) : null });

const cut = (path, kept) => Object.fromEntries(Object.entries(path).map(([key, values]) => [key, Array.isArray(values) && key !== 'arcSeconds' ? values.slice(0, kept) : values]));

/**
 * The jet's flight, its Mach relative to the sound speed at its height as in Boomtect. With `autoDuration` it
 * flies on until every microphone is `JET_FLIGHT.hearingDecibels` below its closest approach by spreading.
 */
export function jetPath(emitter, scene) {
  if (emitter.paths) return followedPath(emitter.paths[0]);
  const { air } = scene;
  const flight = { ...emitter, turnDegreesPerSecond: 0, arc: arcOf(emitter) };
  if (!emitter.autoDuration) return withTurn(flightPath(flight, air));
  const heard = heardFlight(flightPath({ ...emitter, turnDegreesPerSecond: 0, durationSeconds: PARAMETERS.flightSeconds.maximum }, air), scene);
  return withTurn(cut(flightPath({ ...flight, durationSeconds: PARAMETERS.flightSeconds.maximum }, air), heard.seconds.length));
}

/** A straight flight cut where every microphone has fallen out of hearing after its closest pass. */
function heardFlight(path, scene) {
  const ratio = 10 ** (JET_FLIGHT.hearingDecibels / 20);
  let end = 0;
  for (const { positionMetres: at } of scene.receivers) {
    const distances = path.x.map((x, index) => Math.hypot(x - at.x, path.y[index] - at.y, path.z[index] - at.z));
    const closest = distances.indexOf(Math.min(...distances));
    const quiet = distances.findIndex((distance, index) => index > closest && distance >= ratio * distances[closest]);
    end = Math.max(end, quiet < 0 ? distances.length - 1 : quiet);
  }
  return cut(path, Math.max(1, end) + 1);
}

export function sampled(path, seconds) {
  const last = path.seconds.length - 1;
  const position = Math.min(last, Math.max(0, (seconds - path.seconds[0]) / path.step));
  const index = Math.min(last - 1, Math.floor(position));
  const share = position - index;
  const at = values => values[index] + (values[index + 1] - values[index]) * share;
  return { position: { x: at(path.x), y: at(path.y), z: at(path.z) }, velocity: { x: at(path.vx), y: at(path.vy), z: at(path.vz) } };
}

/** Synthesis levels of `render.quality.synthesis`: exact; fast, equal up to rounding; fastest, with other noise of the same statistics. */
const FAST = 1;
const FASTEST = 2;

/** The normal deviates of a frame of `size`, two per bin between DC and Nyquist. */
function frameDeviates(seed, size = GRAIN, synthesis = 0) {
  const random = createRandom(seed);
  return synthesis >= FASTEST ? normalDeviates(random, size - 2) : Float64Array.from({ length: size - 2 }, () => normalDeviate(random));
}

function gaussianFrame(deviates, psd, sampleRate, size = GRAIN) {
  const real = new Float64Array(size);
  const imaginary = new Float64Array(size);
  for (let bin = 1; bin < size / 2; bin += 1) {
    const scale = Math.sqrt(size * sampleRate * psd[bin] / 4);
    real[bin] = scale * deviates[2 * bin - 2];
    imaginary[bin] = scale * deviates[2 * bin - 1];
    real[size - bin] = real[bin];
    imaginary[size - bin] = -imaginary[bin];
  }
  fft(real, imaginary, true);
  return real;
}

/** Two Gaussian frames from one inverse FFT, the second carried in the imaginary part. */
function gaussianPair(first, firstPsd, second, secondPsd, sampleRate, size = GRAIN) {
  const real = new Float64Array(size);
  const imaginary = new Float64Array(size);
  for (let bin = 1; bin < size / 2; bin += 1) {
    const a = Math.sqrt(size * sampleRate * firstPsd[bin] / 4);
    const b = Math.sqrt(size * sampleRate * secondPsd[bin] / 4);
    const aRe = a * first[2 * bin - 2];
    const aIm = a * first[2 * bin - 1];
    const bRe = b * second[2 * bin - 2];
    const bIm = b * second[2 * bin - 1];
    real[bin] = aRe - bIm;
    imaginary[bin] = aIm + bRe;
    real[size - bin] = aRe + bIm;
    imaginary[size - bin] = bRe - aIm;
  }
  fft(real, imaginary, true);
  return [real, imaginary];
}

const lowShare = frequency => 1 / (1 + (frequency / LOW_BAND.crossoverHz) ** 4);

/** A source's spectra restricted to one band: 'low', 'high', or 'full' (unsplit). */
function banded(source, band) {
  if (band === 'full') return source;
  const share = band === 'low' ? lowShare : frequency => 1 - lowShare(frequency);
  const weightsOf = new WeakMap();
  return {
    ...source,
    spectra(components, inletDegrees, frequencies) {
      const { shaped, plain } = source.spectra(components, inletDegrees, frequencies);
      if (!weightsOf.has(frequencies)) weightsOf.set(frequencies, frequencies.map(share));
      const weights = weightsOf.get(frequencies);
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

/**
 * Class C: crackle as simple-wave steepening (Earnshaw): each sample moves earlier by k p, so compressions run ahead
 * and their fronts close into shocks, rises sharp and falls slow. `index` is the share of the shock-formation distance
 * a sine at `hz` with the frame's rms has travelled: at 1 its steepest point just becomes a shock. Where fronts would
 * fold over they become a jump. The rms is kept.
 */
export function steepen(samples, index, hz, sampleRate) {
  if (!(index > 0) || !(hz > 0)) return samples;
  const count = samples.length;
  let power = 0;
  for (let sample = 0; sample < count; sample += 1) power += samples[sample] ** 2;
  if (!(power > 0)) return samples;
  const shift = index * sampleRate / (2 * Math.PI * hz * Math.sqrt(2 * power / count));
  const times = new Float64Array(count);
  for (let sample = 0; sample < count; sample += 1) times[sample] = Math.max(sample ? times[sample - 1] : -Infinity, sample - shift * samples[sample]);
  const out = new Float64Array(count);
  let at = 0;
  for (let sample = 0; sample < count; sample += 1) {
    while (at < count - 2 && times[at + 1] <= sample) at += 1;
    const span = times[at + 1] - times[at];
    const share = span > 0 ? Math.min(1, Math.max(0, (sample - times[at]) / span)) : 1;
    out[sample] = samples[at] + (samples[at + 1] - samples[at]) * share;
  }
  let kept = 0;
  for (let sample = 0; sample < count; sample += 1) kept += out[sample] ** 2;
  const gain = kept > 0 ? Math.sqrt(power / kept) : 0;
  for (let sample = 0; sample < count; sample += 1) out[sample] *= gain;
  return out;
}

/** The renderer drops each frame's DC, so a grain carrying a mean would step at frame edges; a sine taper removes it. */
function removeMean(samples, first, last, sum) {
  const span = last - first + 2;
  let weights = 0;
  for (let sample = first; sample <= last; sample += 1) weights += Math.sin(Math.PI * (sample - first + 1) / span);
  for (let sample = first; sample <= last; sample += 1) samples[sample] -= sum * Math.sin(Math.PI * (sample - first + 1) / span) / weights;
}

/** Degrees round the flight direction from straight below to `departure`, for a body flying without roll. */
function azimuthDegrees(velocity, speed, departure) {
  if (!(speed > 0)) return 0;
  const along = (velocity.x * departure.x + velocity.y * departure.y + velocity.z * departure.z) / speed;
  const across = [departure.x - along * velocity.x / speed, departure.y - along * velocity.y / speed, departure.z - along * velocity.z / speed];
  const climb = velocity.z / speed;
  const below = [climb * velocity.x / speed, climb * velocity.y / speed, climb * climb - 1];
  const lengths = Math.hypot(...across) * Math.hypot(...below);
  if (lengths < 1e-12) return 0;
  const cosine = (across[0] * below[0] + across[1] * below[1] + across[2] * below[2]) / lengths;
  return Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI;
}

/**
 * Grains along a path (`tect-shared-interfaces.md`, grains): sine-windowed frames at half overlap, each heard toward
 * a path's departure. `source.components(state)` gives a grain's source state or null when it is silent;
 * `source.spectra(components, inletDegrees, frequencies, azimuthDegrees)` its shaped and plain PSDs at 1 m, inlet 0
 * ahead along its axis, azimuth round its flight from straight below; `source.packetHz(components)` the corner of its intermittency; `source.axis` and `source.place` optionally
 * its axis and emission point when they differ from its flight. Its Doppler shift and −10 log|1 − M cos ψ|
 * (Stone et al. 2003, eq. 2) come with the grain, so they count once. Ahead of a supersonic grain's Mach cone the
 * factor is negative and the grain arrives reversed.
 */
export function pathGrains(emitter, scene, path, unbanded, band = 'full') {
  if (band === 'low') return lowBandGrains(emitter, scene, path, banded(unbanded, 'low'));
  const source = banded(unbanded, band);
  const { air } = scene;
  const sampleRate = scene.render.sampleRate;
  const grainSeconds = GRAIN / sampleRate;
  const hopSeconds = grainSeconds / 2;
  const duration = (path.seconds.length - 1) * path.step;
  const binHz = sampleRate / GRAIN;
  const frequencies = Array.from({ length: GRAIN / 2 + 1 }, (_, bin) => bin * binHz);
  const grains = [];
  for (let index = 0; index * hopSeconds <= duration; index += 1) {
    const centre = path.seconds[0] + index * hopSeconds;
    if (index === 0) { grains.push({ heard: false }); continue; }
    const { position, velocity } = sampled(path, centre);
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    const components = source.components({ seconds: centre, position, velocity, speed });
    if (!components) { grains.push({ heard: false }); continue; }
    const axis = source.axis?.(components, velocity, speed) ?? null;
    const side = source.spectra(components, 90, frequencies);
    let sum = 0;
    for (const part of [side.shaped, side.plain]) for (let bin = 0; bin < part.length; bin += 1) sum += part[bin];
    const power = sum * binHz;
    grains.push({ centre, position: source.place?.(components, position, axis) ?? position, velocity, speed, sound: soundSpeedAt(scene.air, position.z), axis, components, amplitude: Math.sqrt(power), heard: power > 0 });
  }
  for (const grain of grains) if (grain.heard) grain.lead = leadSamples(GRAIN, grain.speed / grain.sound);
  const rows = grains.flatMap((grain, index) => (!grain.heard ? [] : [{
    positionMetres: grain.position, direction: null, elementMetres: 0, emissionSeconds: grain.centre - grain.lead / sampleRate, amplitudePaMetres: grain.amplitude,
    pulse: 'grain', noiseSeed: index, durationSeconds: grainSeconds, decay: 0, spanSeconds: 2 * grain.lead / sampleRate, linearRadiusMetres: 0,
    ...shockOf(source.crackle?.(grain.components))
  }]));

  const { synthesis } = scene.render.quality;
  let noise = { index: -1 };

  /** A grain's paths follow one another in the render, so its deviates and its envelope, the same toward every departure, are kept for the next. */
  function noiseOf(index) {
    if (noise.index === index) return noise;
    const seed = salt => (emitter.seed ^ Math.imul(index + 1, 0x27d4eb2d) ^ salt) >>> 0;
    const cutoff = source.packetHz(grains[index].components);
    const lowPass = frequencies.map(frequency => (frequency > 0 ? 1 / (1 + (frequency / cutoff) ** 2) : 0));
    const lowPassSum = lowPass.reduce((sum, value) => sum + value, 0) * binHz;
    noise = {
      index,
      plain: frameDeviates(seed(STREAMS.fine), GRAIN, synthesis),
      shaped: frameDeviates(seed(STREAMS.large), GRAIN, synthesis),
      envelope: gaussianFrame(frameDeviates(seed(STREAMS.envelope), GRAIN, synthesis), lowPass.map(value => value / lowPassSum), sampleRate)
    };
    return noise;
  }

  function emission(index, departure, plan) {
    const grain = grains[index];
    const cosine = grain.speed > 0 ? (grain.velocity.x * departure.x + grain.velocity.y * departure.y + grain.velocity.z * departure.z) / grain.speed : 1;
    const mach = grain.speed / grain.sound;
    const signed = 1 - mach * cosine;
    const compression = Math.sign(signed || 1) * Math.max(JET_FLIGHT.smallestCompression, Math.abs(signed));
    const squeeze = Math.abs(compression);
    const axial = grain.axis ? grain.axis.x * departure.x + grain.axis.y * departure.y + grain.axis.z * departure.z : cosine;
    const inletDegrees = Math.acos(Math.max(-1, Math.min(1, axial))) * 180 / Math.PI;
    const { shaped: shapedPsd, plain } = source.spectra(grain.components, inletDegrees, frequencies, azimuthDegrees(grain.velocity, grain.speed, departure));
    const deviates = noiseOf(index);
    const [plainFrame, shapedFrame] = synthesis >= FAST ? gaussianPair(deviates.plain, plain, deviates.shaped, shapedPsd, sampleRate)
      : [gaussianFrame(deviates.plain, plain, sampleRate), gaussianFrame(deviates.shaped, shapedPsd, sampleRate)];
    const { envelope } = deviates;
    const rms = Math.sqrt(shapedPsd.reduce((sum, value) => sum + value, 0) * binHz);
    const shaped = shapeWaveform(shapedFrame, () => rms, envelope, source.shape);
    const crackle = source.crackle?.(grain.components);
    const mixed = Float64Array.from(shaped, (value, sample) => value + plainFrame[sample]);
    const combined = crackle ? steepen(mixed, crackle.index, crackle.hz, sampleRate) : mixed;
    const real = Float64Array.from(WINDOW, (window, sample) => window * combined[sample]);
    const limit = SYNTHESIS.bandLimitShare * sampleRate * squeeze / binHz;
    if (synthesis < FAST || limit <= GRAIN / 2) {
      const imaginary = new Float64Array(GRAIN);
      fft(real, imaginary);
      for (let bin = 0; bin <= GRAIN / 2; bin += 1) {
        if (bin < limit) continue;
        real[bin] = 0; imaginary[bin] = 0;
        if (bin > 0 && bin < GRAIN / 2) { real[GRAIN - bin] = 0; imaginary[GRAIN - bin] = 0; }
      }
      fft(real, imaginary, true);
    }
    const out = new Float64Array(plan.size);
    const gain = 1 / (Math.sqrt(squeeze) * grain.amplitude * sampleRate);
    const half = GRAIN * squeeze / 2;
    const [first, last] = [Math.max(0, Math.floor(grain.lead - half) - 2), Math.min(plan.size - 1, Math.ceil(grain.lead + half) + 2)];
    let sum = 0;
    for (let sample = first; sample <= last; sample += 1) {
      out[sample] = gain * catmullRom(real, GRAIN / 2 + (sample - grain.lead) / compression);
      sum += out[sample];
    }
    removeMean(out, first, last, sum);
    if (synthesis >= FAST) return realSpectrum(out);
    const outImaginary = new Float64Array(plan.size);
    fft(out, outImaginary);
    return { re: out, im: outImaginary };
  }

  return { sources: sourceTable(rows), rows, emission };
}

const shockOf = crackle => ({ shockShare: crackle?.share ?? 0, shockHz: crackle ? SHOCK_FORMATION.frequencyRatio * crackle.hz : 0 });

/** Samples from a grain's start in its frame to its centre: room for half of it stretched by 1 + M as it recedes. */
const leadSamples = (grainSamples, mach) => Math.max(grainSamples, Math.ceil(grainSamples * (1 + mach) / 2) + 2);

const LOW_WINDOW = Float64Array.from({ length: LOW_BAND.internalSamples }, (_, index) => Math.sin(Math.PI * (index + .5) / LOW_BAND.internalSamples));

/**
 * The low band's grains along a path: each a Gaussian frame of `LOW_BAND.internalSamples` at a low rate, sine-windowed,
 * and its spectrum evaluated directly on the render frame's bins up to `LOW_BAND.highestFrequencyHz`. Time is scaled by
 * the grain's Doppler compression as in the short grains, and reversed ahead of a supersonic grain's Mach cone.
 */
function lowBandGrains(emitter, scene, path, source) {
  const sampleRate = scene.render.sampleRate;
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
    if (index === 0) { grains.push({ heard: false }); continue; }
    const { position, velocity } = sampled(path, centre);
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    const components = source.components({ seconds: centre, position, velocity, speed });
    if (!components) { grains.push({ heard: false }); continue; }
    const axis = source.axis?.(components, velocity, speed) ?? null;
    const side = source.spectra(components, 90, frequencies);
    let sum = 0;
    for (const part of [side.shaped, side.plain]) for (let bin = 1; bin < part.length; bin += 1) sum += part[bin];
    const power = sum * binHz;
    grains.push({ centre, position: source.place?.(components, position, axis) ?? position, velocity, speed, sound: soundSpeedAt(scene.air, position.z), axis, components, amplitude: Math.sqrt(power), heard: power > 0 });
  }
  for (const grain of grains) if (grain.heard) grain.lead = leadSamples(grainSamples, grain.speed / grain.sound) / sampleRate;
  const rows = grains.flatMap((grain, index) => (!grain.heard ? [] : [{
    positionMetres: grain.position, direction: null, elementMetres: 0, emissionSeconds: grain.centre - grain.lead, amplitudePaMetres: grain.amplitude,
    pulse: 'grain', noiseSeed: index, durationSeconds: grainSeconds, decay: 0, spanSeconds: 2 * grain.lead, linearRadiusMetres: 0
  }]));

  function emission(index, departure, plan) {
    const grain = grains[index];
    const cosine = grain.speed > 0 ? (grain.velocity.x * departure.x + grain.velocity.y * departure.y + grain.velocity.z * departure.z) / grain.speed : 1;
    const signed = 1 - grain.speed / grain.sound * cosine;
    const compression = Math.sign(signed || 1) * Math.max(JET_FLIGHT.smallestCompression, Math.abs(signed));
    const squeeze = Math.abs(compression);
    const axial = grain.axis ? grain.axis.x * departure.x + grain.axis.y * departure.y + grain.axis.z * departure.z : cosine;
    const inletDegrees = Math.acos(Math.max(-1, Math.min(1, axial))) * 180 / Math.PI;
    const { shaped, plain } = source.spectra(grain.components, inletDegrees, frequencies, azimuthDegrees(grain.velocity, grain.speed, departure));
    const psd = shaped.map((value, bin) => value + plain[bin]);
    const frame = gaussianFrame(frameDeviates((emitter.seed ^ Math.imul(index + 1, 0x27d4eb2d) ^ STREAMS.low) >>> 0, size, scene.render.quality.synthesis), psd, rate, size);
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
      const seconds = grain.lead + (sample + .5 - size / 2) * compression / rate;
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

/**
 * Class C: a formation's jets, the shared V with each rank `verticalSpacingMetres` higher (lower when negative), a seed
 * for each aircraft, the leader's its own; any other jet is its only member.
 */
export function formationJets(emitter) {
  if (emitter.paths) return emitter.paths.map((saved, index) => ({ ...emitter, kind: 'jet', seed: index ? (emitter.seed + Math.imul(index, 0x9e3779b9)) >>> 0 : emitter.seed, paths: [saved] }));
  if (emitter.kind !== 'formation') return [emitter];
  const random = createRandom(emitter.seed);
  return formationMembers(emitter, emitter.memberCount, emitter.lateralSpacingMetres, emitter.trailSpacingMetres)
    .map((member, index) => ({
      ...member,
      kind: 'jet',
      seed: index === 0 ? emitter.seed : Math.floor(random() * 0x100000000),
      startMetres: { ...member.startMetres, z: Math.max(0, member.startMetres.z + Math.ceil(index / 2) * emitter.verticalSpacingMetres) }
    }));
}

const JET_SHAPE = waveformShape({ skewness: JET.largeScaleSkewness, kurtosis: JET.largeScaleKurtosis });

/** The sound of a jet's engines and airframe at a moment of its flight, as grains and the emitter's levels see it. */
export function jetSource(emitter, scene) {
  const { air } = scene;
  const streams = streamsOf(emitter.engine, emitter.engineClass, air.temperatureCelsius);
  const { engines } = emitter.engine;
  const turbo = turbomachineryAt(emitter.engineClass, powerOfEngine(emitter.engine, emitter.engineClass), referencePower(emitter.engineClass, air.temperatureCelsius));
  const airframe = ENGINE.classes[emitter.engineClass]?.airframe;
  return {
    components: ({ speed }) => ({
      streams: streams.map(jet => jetComponents(jet, { temperatureCelsius: air.temperatureCelsius, flightMetresPerSecond: speed })),
      airframe: airframeAt(airframe, { speedMetresPerSecond: speed, temperatureCelsius: air.temperatureCelsius, deployed: Boolean(emitter.gearAndFlaps) })
    }),
    spectra: ({ streams: parts, airframe: frame }, inletDegrees, frequencies, azimuth) => {
      const { large, fine, shock } = jetSpectra(parts[0], inletDegrees, frequencies);
      fine.forEach((value, index) => { fine[index] = value + shock[index]; });
      for (const stream of parts.slice(1)) {
        const other = jetSpectra(stream, inletDegrees, frequencies);
        other.large.forEach((value, index) => { large[index] += value; fine[index] += other.fine[index] + other.shock[index]; });
      }
      addTurbomachinery(fine, frequencies, turbo, inletDegrees);
      const [shaped, plain] = engines === 1 ? [large, fine] : [large.map(value => value * engines), fine.map(value => value * engines)];
      return { shaped, plain: addAirframe(plain, frequencies, frame, inletDegrees, azimuth) };
    },
    packetHz: ({ streams: [core] }) => core.large.peakHz / JET.packetCycles,
    crackle: ({ streams: [core] }) => {
      const [from, to] = JET.crackleConvection;
      const share = Math.min(1, Math.max(0, (core.staticConvection - from) / (to - from)));
      return { index: JET.crackleIndex * share, hz: core.large.peakHz, share: JET.shockShare * share };
    },
    shape: JET_SHAPE
  };
}

export function jetGrains(emitter, scene, band = 'full') {
  const source = jetSource(emitter, scene);
  return mergedGrains(formationJets(emitter).map(member => pathGrains(member, scene, jetPath(member, scene), source, band)));
}
