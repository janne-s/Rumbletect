import { ROCKET, TRAJECTORY } from './constants.js';
import { SATURN_DIRECTIVITY } from './saturn-directivity.js';
import { airDensityKilogramsPerCubicMetre, speedOfSoundMetresPerSecond } from '../shared/domain/air.js';
import { FLAT_SURFACE } from '../shared/domain/terrain.js';

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

function diameterPerRootNewton(newtons, propellant) {
  const { diameterPerRootNewton: common, smallSolidDiameterPerRootNewton: small, smallSolidNewtons: [from, to] } = ROCKET.sizing;
  if (propellant !== 'solid') return common;
  const share = Math.min(1, Math.max(0, Math.log(newtons / from) / Math.log(to / from)));
  return small + (common - small) * share;
}

/** Class C: a rocket of this total thrust, engine count and propellant: per-engine thrust, nozzle, burn and water. */
export function sizedRocket(totalNewtons, engines, propellant) {
  const { exitVelocityMetresPerSecond } = ROCKET.propellants[propellant];
  const perEngine = totalNewtons / engines;
  const round = (value, digits) => +value.toPrecision(digits);
  return {
    engine: { engines, thrustKilonewtons: round(perEngine / 1000, 4), exitVelocityMetresPerSecond, exitDiameterMetres: round(diameterPerRootNewton(perEngine, propellant) * Math.sqrt(perEngine), 3) },
    ascent: { burnSeconds: typicalBurnSeconds(totalNewtons), water: totalNewtons >= ROCKET.sizing.waterFromNewtons }
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

/** A rocket's engine set to a category's: thrust, engines, propellant, nozzle, efficiency and the pad's water; its flight kept. */
export function categoryEngine(item, category) {
  const sized = sizedRocket(category.newtons, category.engines, category.propellant);
  return { ...item, propellant: category.propellant, engine: { ...item.engine, ...sized.engine, efficiencyPercent: category.efficiencyPercent }, ascent: { ...item.ascent, water: sized.ascent.water } };
}

/** A rocket set to a category's thrust, engines, propellant, efficiency and ascent; the throttle schedule kept. */
export function categoryRocket(item, category) {
  const sized = sizedRocket(category.newtons, category.engines, category.propellant);
  const { turnStartPercent, turnLengthPercent } = ROCKET.defaultAscent;
  return {
    ...item,
    propellant: category.propellant,
    launchDegrees: category.launchDegrees,
    engine: { ...item.engine, ...sized.engine, efficiencyPercent: category.efficiencyPercent },
    ascent: { ...item.ascent, ...sized.ascent, burnSeconds: category.burnSeconds, turnStartPercent, turnLengthPercent, ...category.flight }
  };
}

/** The category whose thrust is nearest, in octaves, to the rocket's. */
export const nearestCategory = emitter => ROCKET.categories.reduce((best, category) => (Math.abs(Math.log(category.newtons / totalThrustNewtons(emitter))) < Math.abs(Math.log(best.newtons / totalThrustNewtons(emitter))) ? category : best));

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

export const ignitionSecondsOf = vehicle => Math.max(ROCKET.shortestIgnitionSeconds, ROCKET.ignitionSeconds * Math.cbrt(Math.min(1, vehicle.totalThrustNewtons / ROCKET.ignitionReferenceNewtons)));

export const peakFrequencyHz = vehicle => SPECTRUM.peakStrouhal * vehicle.exitVelocityMetresPerSecond / vehicle.effectiveDiameterMetres;

const smoothStep = value => { const t = Math.min(1, Math.max(0, value)); return t * t * (3 - 2 * t); };

export function throttleAt(ascent, secondsAfterRelease) {
  const ramp = ROCKET.throttleRampSeconds;
  const down = smoothStep((secondsAfterRelease - ascent.throttleDownSeconds) / ramp);
  const up = smoothStep((secondsAfterRelease - ascent.throttleUpSeconds) / ramp);
  return 1 - (1 - ascent.throttlePercent / 100) * (down - up);
}

/** Class C, decision 9: the share of the burnout speed reached at a share of the burn, the rocket equation's shape. */
export function speedShare(accelerationPercent, burnShare) {
  const fraction = ROCKET.lateAccelerationFraction * accelerationPercent / 100;
  return fraction < 1e-9 ? burnShare : Math.log(1 - fraction * burnShare) / Math.log(1 - fraction);
}

/**
 * Class C, decision 9: the authored ascent in the vertical plane of the launch heading. Liquid engines are held on the pad
 * for `ROCKET.holdSeconds`; then the speed rises to the burnout speed as `speedShare`, and the flight-path angle turns from
 * the launch angle by `bendDegrees` between the turn's start and end, as shares of the distance flown. The path is sampled
 * like `flightPath` and ends at the burn's end or where it comes down to the ground of `surface`.
 */
export function ascentPath(emitter, surface = FLAT_SURFACE) {
  const { ascent } = emitter;
  const hold = emitter.propellant === 'solid' ? 0 : ROCKET.holdSeconds;
  const total = hold + ascent.burnSeconds;
  const steps = Math.min(TRAJECTORY.maximumSteps, Math.max(2, Math.ceil(total / TRAJECTORY.stepSeconds)));
  const step = total / steps;
  const heading = emitter.headingDegrees * Math.PI / 180;
  const along = { x: Math.sin(heading), y: Math.cos(heading) };
  const pad = emitter.startMetres;
  const launch = emitter.launchDegrees * Math.PI / 180;
  const bend = ascent.bendDegrees * Math.PI / 180;
  const speedAt = flying => ascent.burnoutMetresPerSecond * speedShare(ascent.accelerationPercent, Math.min(1, flying / ascent.burnSeconds));
  const fine = ROCKET.pathSeconds;
  let length = 0;
  for (let clock = 0; clock < ascent.burnSeconds; clock += fine) {
    const h = Math.min(fine, ascent.burnSeconds - clock);
    length += speedAt(clock + h / 2) * h;
  }
  const turnFrom = ascent.turnStartPercent / 100;
  const turnTo = turnFrom + (1 - turnFrom) * ascent.turnLengthPercent / 100;
  const angleAt = flown => launch - bend * smoothStep((flown / Math.max(length, 1e-9) - turnFrom) / Math.max(turnTo - turnFrom, 1e-9));
  const path = {
    seconds: [], x: [], y: [], z: [], vx: [], vy: [], vz: [], speed: [], step, throttle: [], heldSeconds: hold, groundSeconds: null,
    turnMetres: [turnFrom * length, turnTo * length], flownMetres: [],
    launchAxis: { x: along.x * Math.cos(launch), y: along.y * Math.cos(launch), z: Math.sin(launch) }
  };
  let [range, height, flown, clock] = [0, 0, 0, 0];
  for (let index = 0; index <= steps; index += 1) {
    const t = index * step;
    const flying = Math.max(0, t - hold);
    while (clock < flying - 1e-12) {
      const h = Math.min(fine, flying - clock);
      const speed = speedAt(clock + h / 2);
      const angle = angleAt(flown + speed * h / 2);
      range += speed * Math.cos(angle) * h;
      height += speed * Math.sin(angle) * h;
      flown += speed * h;
      clock += h;
    }
    const speed = speedAt(flying);
    const angle = angleAt(flown);
    const point = { x: pad.x + along.x * range, y: pad.y + along.y * range, z: pad.z + height };
    if (index > 0 && Math.sin(angle) < 0 && point.z <= surface.heightAt(point.x, point.y)) {
      path.groundSeconds = flying;
      break;
    }
    path.seconds.push(emitter.startSeconds + t);
    path.x.push(point.x); path.y.push(point.y); path.z.push(point.z);
    path.vx.push(along.x * speed * Math.cos(angle)); path.vy.push(along.y * speed * Math.cos(angle)); path.vz.push(speed * Math.sin(angle)); path.speed.push(speed);
    path.flownMetres.push(flown);
    path.throttle.push(t < hold ? 1 : throttleAt(ascent, flying));
  }
  return path;
}

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
  const ignitionSeconds = ignitionSecondsOf(vehicle);
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
      const ignition = Math.min(1, since / ignitionSeconds);
      const [low, high] = ROCKET.ignitionCornerHz;
      return {
        watts: soundPowerWatts(vehicle, path.throttle[sampleIndex(seconds)]) * ignition,
        cornerHz: low * (high / low) ** ignition,
        climbMetres: position.z - padHeight,
        water: emitter.ascent.water
      };
    },
    axis: (components, flight, speed) => (speed > 1 ? { x: flight.x / speed, y: flight.y / speed, z: flight.z / speed } : path.launchAxis),
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
    packetHz: () => peakFrequencyHz(vehicle) / ROCKET.packetCycles,
    crackle: () => ({ index: ROCKET.crackleIndex, hz: peakFrequencyHz(vehicle), share: ROCKET.shockShare })
  };
}
