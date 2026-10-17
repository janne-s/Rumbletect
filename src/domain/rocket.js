import { ROCKET, TRAJECTORY } from './constants.js';
import { SATURN_DIRECTIVITY } from './saturn-directivity.js';
import { airDensityKilogramsPerCubicMetre, speedOfSoundMetresPerSecond } from '../shared/domain/air.js';

const { spectrum: SPECTRUM, forward: FORWARD } = ROCKET;
const TABLE_LOG_STROUHAL = SATURN_DIRECTIVITY.strouhal.map(Math.log);

/** Class B: Mathews 2025 eq. 6.4, dB re W_OA per unit Strouhal number. */
export function normalizedPowerDecibels(strouhal) {
  const x = Math.log(strouhal);
  if (strouhal < SPECTRUM.lowBreak) return 8.686 * x + 58.6;
  if (strouhal <= SPECTRUM.highBreak) return .26 * x * x * x - 15.98 * x - 33.88;
  return -8.686 * x - 19;
}

const bracket = (values, value) => {
  if (value <= values[0]) return [0, 0, 0];
  const last = values.length - 1;
  if (value >= values[last]) return [last, last, 0];
  let low = 0;
  while (values[low + 1] < value) low += 1;
  return [low, low + 1, (value - values[low]) / (values[low + 1] - values[low])];
};

function tableDecibels(strouhal, degrees) {
  const [r0, r1, rs] = bracket(TABLE_LOG_STROUHAL, Math.log(strouhal));
  const [c0, c1, cs] = bracket(SATURN_DIRECTIVITY.degrees, degrees);
  const row = r => SATURN_DIRECTIVITY.decibels[r][c0] + (SATURN_DIRECTIVITY.decibels[r][c1] - SATURN_DIRECTIVITY.decibels[r][c0]) * cs;
  return row(r0) + (row(r1) - row(r0)) * rs;
}

/** Directivity index in dB toward `degrees` from the plume axis: SATURN's table (B), forward of its edge RSRM's fall (C). */
export function directivityDecibels(strouhal, degrees) {
  if (degrees <= ROCKET.directivityEdgeDegrees) return tableDecibels(strouhal, degrees);
  const edge = tableDecibels(strouhal, ROCKET.directivityEdgeDegrees);
  const [a, b, share] = bracket(FORWARD.degrees, degrees);
  const at = values => values[a] + (values[b] - values[a]) * share;
  const blend = Math.min(1, Math.max(0, Math.log(strouhal / FORWARD.lowStrouhal) / Math.log(FORWARD.highStrouhal / FORWARD.lowStrouhal)));
  return edge + at(FORWARD.low) + (at(FORWARD.high) - at(FORWARD.low)) * blend;
}

export const totalThrustNewtons = emitter => emitter.engine.engines * emitter.engine.thrustKilonewtons * 1000;

function typicalBurnSeconds(newtons) {
  const table = ROCKET.sizing.burnSeconds;
  if (newtons <= table[0][0]) return table[0][1];
  for (let index = 1; index < table.length; index += 1) {
    const [[f0, s0], [f1, s1]] = [table[index - 1], table[index]];
    if (newtons <= f1) return Math.round(s0 + (s1 - s0) * Math.log(newtons / f0) / Math.log(f1 / f0));
  }
  return table.at(-1)[1];
}

/** Class C: a rocket of this total thrust, engine count and propellant: per-engine thrust, nozzle, mass, burn and water. */
export function sizedRocket(totalNewtons, engines, propellant) {
  const { exitVelocityMetresPerSecond, thrustToWeight } = ROCKET.propellants[propellant];
  const perEngine = totalNewtons / engines;
  const round = (value, digits) => +value.toPrecision(digits);
  return {
    engine: { engines, thrustKilonewtons: round(perEngine / 1000, 4), exitVelocityMetresPerSecond, exitDiameterMetres: round(ROCKET.sizing.diameterPerRootNewton * Math.sqrt(perEngine), 3) },
    ascent: { liftoffMassTonnes: round(totalNewtons / (thrustToWeight * ROCKET.gravity) / 1000, 4), burnSeconds: typicalBurnSeconds(totalNewtons), water: totalNewtons >= ROCKET.sizing.waterFromNewtons }
  };
}

const GRID_COLUMNS = Array.from({ length: 181 }, (_, degrees) => bracket(SATURN_DIRECTIVITY.degrees, Math.min(degrees, ROCKET.directivityEdgeDegrees)));
const GRID_FORWARD = Array.from({ length: 181 }, (_, degrees) => {
  if (degrees <= ROCKET.directivityEdgeDegrees) return null;
  const [a, b, share] = bracket(FORWARD.degrees, degrees);
  const at = values => values[a] + (values[b] - values[a]) * share;
  return [at(FORWARD.low), at(FORWARD.high)];
});

/** `directivityDecibels` every degree from 0° to 180° as linear intensity ratios, written into `out` from `offset`. */
export function directivityRow(strouhal, out, offset) {
  const [r0, r1, rs] = bracket(TABLE_LOG_STROUHAL, Math.log(strouhal));
  const [first, second] = [SATURN_DIRECTIVITY.decibels[r0], SATURN_DIRECTIVITY.decibels[r1]];
  const blend = Math.min(1, Math.max(0, Math.log(strouhal / FORWARD.lowStrouhal) / Math.log(FORWARD.highStrouhal / FORWARD.lowStrouhal)));
  for (let degrees = 0; degrees < GRID_COLUMNS.length; degrees += 1) {
    const [c0, c1, cs] = GRID_COLUMNS[degrees];
    const low = first[c0] + (first[c1] - first[c0]) * cs;
    let decibels = low + (second[c0] + (second[c1] - second[c0]) * cs - low) * rs;
    const forward = GRID_FORWARD[degrees];
    if (forward) decibels += forward[0] + (forward[1] - forward[0]) * blend;
    out[offset + degrees] = 10 ** (decibels / 10);
  }
}

export const sourceLocationMetres = (strouhal, diameterMetres) => ROCKET.sourceLocation.coefficient * strouhal ** ROCKET.sourceLocation.exponent * diameterMetres;

export function vehicleOf(emitter) {
  const { engines, thrustKilonewtons, exitVelocityMetresPerSecond, exitDiameterMetres, efficiencyPercent } = emitter.engine;
  return {
    engines,
    efficiency: efficiencyPercent / 100,
    exitVelocityMetresPerSecond,
    effectiveDiameterMetres: exitDiameterMetres * Math.sqrt(engines),
    totalThrustNewtons: engines * thrustKilonewtons * 1000
  };
}

/** Class B: Mathews & Gee 2025 eq. 8, the overall sound power of the plume in watts at a share of full thrust. */
export const soundPowerWatts = (vehicle, throttle = 1) => .5 * vehicle.efficiency * vehicle.totalThrustNewtons * throttle * vehicle.exitVelocityMetresPerSecond;

export const peakFrequencyHz = vehicle => SPECTRUM.peakStrouhal * vehicle.exitVelocityMetresPerSecond / vehicle.effectiveDiameterMetres;

const smoothStep = value => { const t = Math.min(1, Math.max(0, value)); return t * t * (3 - 2 * t); };

export function throttleAt(ascent, secondsAfterRelease) {
  const ramp = ROCKET.throttleRampSeconds;
  const down = smoothStep((secondsAfterRelease - ascent.throttleDownSeconds) / ramp);
  const up = smoothStep((secondsAfterRelease - ascent.throttleUpSeconds) / ramp);
  return 1 - (1 - ascent.throttlePercent / 100) * (down - up);
}

/**
 * Class C: the ascent in the vertical plane of the launch heading, liquid engines held on the pad for `ROCKET.holdSeconds`, then a
 * vertical rise, a pitch kick and a gravity turn under thrust, mass flow F/U_e and gravity, no drag and a flat Earth.
 * The path is sampled like `flightPath` and ends at engine cut-off.
 */
export function ascentPath(emitter) {
  const vehicle = vehicleOf(emitter);
  const { ascent } = emitter;
  const hold = emitter.propellant === 'solid' ? 0 : ROCKET.holdSeconds;
  const total = hold + ascent.burnSeconds;
  const steps = Math.min(TRAJECTORY.maximumSteps, Math.max(2, Math.ceil(total / TRAJECTORY.stepSeconds)));
  const step = total / steps;
  const heading = emitter.headingDegrees * Math.PI / 180;
  const along = { x: Math.sin(heading), y: Math.cos(heading) };
  const pad = emitter.startMetres;
  const path = { seconds: [], x: [], y: [], z: [], vx: [], vy: [], vz: [], speed: [], step, throttle: [], heldSeconds: hold };
  const kickRate = ascent.pitchKickDegrees * Math.PI / 180 / ROCKET.pitchKickSeconds;
  const dt = ROCKET.integrationSeconds;
  let [height, range, speed, gamma, mass, clock] = [0, 0, 0, Math.PI / 2, ascent.liftoffMassTonnes * 1000, 0];
  const derivative = (t, h, v, g, m) => {
    const throttle = throttleAt(ascent, t);
    const thrust = vehicle.totalThrustNewtons * throttle;
    const kicking = t >= ascent.pitchKickAtSeconds && t < ascent.pitchKickAtSeconds + ROCKET.pitchKickSeconds;
    const turn = kicking ? -kickRate : (g < Math.PI / 2 - 1e-9 && v > 1 ? -ROCKET.gravity * Math.cos(g) / v : 0);
    return { dv: thrust / m - ROCKET.gravity * Math.sin(g), dg: turn, dm: -thrust / vehicle.exitVelocityMetresPerSecond, dh: v * Math.sin(g), dr: v * Math.cos(g) };
  };
  for (let index = 0; index <= steps; index += 1) {
    const t = index * step;
    const flying = Math.max(0, t - hold);
    while (clock < flying - 1e-12) {
      const h = Math.min(dt, flying - clock);
      const a = derivative(clock, height, speed, gamma, mass);
      const b = derivative(clock + h, height + h * a.dh, Math.max(0, speed + h * a.dv), gamma + h * a.dg, mass + h * a.dm);
      height += h * (a.dh + b.dh) / 2; range += h * (a.dr + b.dr) / 2;
      speed = Math.max(0, speed + h * (a.dv + b.dv) / 2); gamma += h * (a.dg + b.dg) / 2; mass += h * (a.dm + b.dm) / 2;
      clock += h;
    }
    const horizontal = speed * Math.cos(gamma);
    path.seconds.push(emitter.startSeconds + t);
    path.x.push(pad.x + along.x * range); path.y.push(pad.y + along.y * range); path.z.push(pad.z + height);
    path.vx.push(along.x * horizontal); path.vy.push(along.y * horizontal); path.vz.push(speed * Math.sin(gamma)); path.speed.push(speed);
    path.throttle.push(t < hold ? 1 : throttleAt(ascent, flying));
  }
  return path;
}

const up = { x: 0, y: 0, z: 1 };
const GRID_DEGREES = 181;

/** Per frequency, once per rocket: SATURN's power as a linear share per unit Sr, the source's distance behind the nozzle, and its directivity every degree. */
function spectralTable(frequencies, diameter, velocity) {
  const power = new Float64Array(frequencies.length);
  const location = new Float64Array(frequencies.length);
  const directivity = new Float32Array(frequencies.length * GRID_DEGREES);
  for (let index = 1; index < frequencies.length; index += 1) {
    const strouhal = frequencies[index] * diameter / velocity;
    power[index] = 10 ** (normalizedPowerDecibels(strouhal) / 10);
    location[index] = sourceLocationMetres(strouhal, diameter);
    directivityRow(strouhal, directivity, index * GRID_DEGREES);
  }
  return { power, location, directivity };
}

/**
 * The rocket's source along its ascent for `pathGrains`: power from thrust (B), SATURN's spectrum and directivity (B),
 * the ignition opening the spectrum upward (C), and frequencies still at the pad radiating without directivity (C).
 */
export function rocketSource(emitter, scene, path) {
  const vehicle = vehicleOf(emitter);
  const { air } = scene;
  const impedance = airDensityKilogramsPerCubicMetre(air.pressureKpa * 1000, air.temperatureCelsius) * speedOfSoundMetresPerSecond(air.temperatureCelsius);
  const diameter = vehicle.effectiveDiameterMetres;
  const velocity = vehicle.exitVelocityMetresPerSecond;
  const padHeight = emitter.startMetres.z;
  const tables = new WeakMap();
  const tableFor = frequencies => {
    if (!tables.has(frequencies)) tables.set(frequencies, spectralTable(frequencies, diameter, velocity));
    return tables.get(frequencies);
  };
  const sampleIndex = seconds => Math.min(path.seconds.length - 1, Math.max(0, Math.round((seconds - path.seconds[0]) / path.step)));
  return {
    components({ seconds, position }) {
      const since = seconds - emitter.startSeconds;
      if (since < 0) return null;
      const ignition = Math.min(1, since / ROCKET.ignitionSeconds);
      const [low, high] = ROCKET.ignitionCornerHz;
      return {
        watts: soundPowerWatts(vehicle, path.throttle[sampleIndex(seconds)]) * ignition,
        cornerHz: low * (high / low) ** ignition,
        climbMetres: position.z - padHeight,
        water: emitter.ascent.water
      };
    },
    axis: (components, flight, speed) => (speed > 1 ? { x: flight.x / speed, y: flight.y / speed, z: flight.z / speed } : up),
    place: (components, position, axis) => {
      const behind = ROCKET.sourceDiameters * diameter;
      return { x: position.x - axis.x * behind, y: position.y - axis.y * behind, z: Math.max(padHeight, position.z - axis.z * behind) };
    },
    spectra(components, inletDegrees, frequencies) {
      const table = tableFor(frequencies);
      const shaped = new Float64Array(frequencies.length);
      const plain = new Float64Array(frequencies.length);
      const perHz = components.watts * diameter / velocity * impedance / (4 * Math.PI);
      const padGain = 10 ** (-(ROCKET.padLossDecibels + (components.water ? ROCKET.waterDecibels : 0)) / 10);
      const plume = Math.min(GRID_DEGREES - 1, Math.max(0, 180 - inletDegrees));
      const below = Math.min(GRID_DEGREES - 2, Math.floor(plume));
      const share = plume - below;
      for (let index = 1; index < frequencies.length; index += 1) {
        const ratio = frequencies[index] / components.cornerHz;
        const opening = 1 / (1 + ratio * ratio * ratio * ratio);
        const row = index * GRID_DEGREES;
        const directivity = table.location[index] <= components.climbMetres ? table.directivity[row + below] + (table.directivity[row + below + 1] - table.directivity[row + below]) * share : padGain;
        shaped[index] = perHz * table.power[index] * directivity * opening;
      }
      return { shaped, plain };
    },
    packetHz: () => peakFrequencyHz(vehicle) / ROCKET.packetCycles
  };
}
