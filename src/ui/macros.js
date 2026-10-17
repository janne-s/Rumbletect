import { engineAtPower, powerLabel, powerOfEngine } from '../domain/engine.js';
import { PARAMETERS } from '../domain/scene.js';
import { ROCKET } from '../domain/constants.js';
import { categoryRocket, nearestCategory, sizedRocket } from '../domain/rocket.js';
import { clamp01, logPosition, logValue, METRES, metres } from '../shared/ui/macros.js';

const range = key => [PARAMETERS[key].minimum, PARAMETERS[key].maximum];

const power = {
  label: 'Power',
  read: item => powerOfEngine(item.engine),
  write: (item, t) => { item.engine = engineAtPower(t); },
  show: item => powerLabel(powerOfEngine(item.engine))
};

const machNumber = {
  label: 'Mach',
  read: item => clamp01((item.mach - range('mach')[0]) / (range('mach')[1] - range('mach')[0])),
  write: (item, t) => { item.mach = +(range('mach')[0] + t * (range('mach')[1] - range('mach')[0])).toFixed(2); },
  show: item => item.mach.toFixed(2),
  entry: { get: item => item.mach, set: (item, value) => { item.mach = value; } }
};

const HEIGHT_SPAN = Object.freeze([10, 15000]);

const flightHeight = {
  label: 'Height',
  read: item => clamp01(logPosition(Math.max(HEIGHT_SPAN[0], item.startMetres.z), HEIGHT_SPAN)),
  write: (item, t) => { item.startMetres = { ...item.startMetres, z: Math.round(logValue(t, HEIGHT_SPAN)) }; },
  show: item => metres(item.startMetres.z),
  entry: { units: METRES, get: item => item.startMetres.z, set: (item, value) => { item.startMetres = { ...item.startMetres, z: value }; } }
};

const flightHeading = {
  label: 'Heading',
  read: item => item.headingDegrees / 360,
  write: (item, t) => { item.headingDegrees = Math.round(t * 360) % 360; },
  show: item => `${Math.round(item.headingDegrees)}°`,
  entry: { unit: '°', get: item => item.headingDegrees, set: (item, value) => { item.headingDegrees = ((value % 360) + 360) % 360; } }
};

const flightClimb = {
  label: 'Climb',
  read: item => (item.climbDegrees + 90) / 180,
  write: (item, t) => { item.climbDegrees = Math.round(t * 180 - 90); },
  show: item => `${item.climbDegrees}°`,
  entry: { unit: '°', get: item => item.climbDegrees, set: (item, value) => { item.climbDegrees = value; } }
};

const flightAcceleration = {
  label: 'Acceleration',
  read: item => (item.accelerationMetresPerSecondSquared + 50) / 150,
  write: (item, t) => { item.accelerationMetresPerSecondSquared = Math.round(t * 150 - 50); },
  show: item => `${item.accelerationMetresPerSecondSquared} m/s²`,
  entry: { unit: 'm/s²', get: item => item.accelerationMetresPerSecondSquared, set: (item, value) => { item.accelerationMetresPerSecondSquared = value; } }
};

const flightTurn = {
  label: 'Turn',
  read: item => (item.turnDegreesPerSecond + 10) / 20,
  write: (item, t) => { item.turnDegreesPerSecond = +(t * 20 - 10).toFixed(1); },
  show: item => `${item.turnDegreesPerSecond}°/s`,
  entry: { unit: '°/s', get: item => item.turnDegreesPerSecond, set: (item, value) => { item.turnDegreesPerSecond = value; } }
};

const flightTime = {
  label: 'Flight time',
  read: item => clamp01(logPosition(item.durationSeconds, [1, 600])),
  write: (item, t) => { item.durationSeconds = Math.max(1, Math.round(logValue(t, [1, 600]))); item.autoDuration = false; },
  show: item => (item.autoDuration ? 'auto' : `${item.durationSeconds} s`),
  entry: { unit: 's', get: item => item.durationSeconds, set: (item, value) => { item.durationSeconds = value; item.autoDuration = false; } }
};

const onset = {
  label: 'Onset',
  read: item => clamp01(Math.cbrt(item.startSeconds / range('startSeconds')[1])),
  write: (item, t) => { item.startSeconds = +(range('startSeconds')[1] * t ** 3).toFixed(2); },
  show: item => `${+item.startSeconds.toFixed(2)} s`,
  entry: { unit: 's', get: item => item.startSeconds, set: (item, value) => { item.startSeconds = value; } }
};

export function macrosFor(emitter, { onset: withOnset = false } = {}) {
  const list = [power, machNumber, flightHeight, flightHeading, flightClimb, flightAcceleration, flightTurn, flightTime];
  return withOnset ? [...list, onset] : list;
}

const CATEGORIES = ROCKET.categories;

const rocketCategory = {
  label: 'Category',
  read: item => CATEGORIES.indexOf(nearestCategory(item)) / (CATEGORIES.length - 1),
  write: (item, t) => {
    const category = CATEGORIES[Math.round(t * (CATEGORIES.length - 1))];
    if (category === nearestCategory(item)) return;
    Object.assign(item, categoryRocket(item, category));
  },
  show: item => nearestCategory(item).label
};

const SIZE_SPAN = ROCKET.sizing.totalNewtons;
const totalOf = item => item.engine.engines * item.engine.thrustKilonewtons * 1000;

const rocketSize = {
  label: 'Size',
  read: item => clamp01(logPosition(totalOf(item), SIZE_SPAN)),
  write: (item, t) => {
    const sized = sizedRocket(+logValue(t, SIZE_SPAN).toPrecision(2), item.engine.engines, item.propellant);
    item.engine = { ...item.engine, ...sized.engine };
    item.ascent = { ...item.ascent, ...sized.ascent };
  },
  show: item => thrustLabel(totalOf(item)),
  entry: { unit: 'kN', get: item => totalOf(item) / 1000, set: (item, value) => { const sized = sizedRocket(value * 1000, item.engine.engines, item.propellant); item.engine = { ...item.engine, ...sized.engine }; item.ascent = { ...item.ascent, ...sized.ascent }; } }
};

const PROPELLANT_KEYS = Object.keys(ROCKET.propellants);

const rocketPropellant = {
  label: 'Propellant',
  read: item => PROPELLANT_KEYS.indexOf(item.propellant) / (PROPELLANT_KEYS.length - 1),
  write: (item, t) => {
    const propellant = PROPELLANT_KEYS[Math.round(t * (PROPELLANT_KEYS.length - 1))];
    if (propellant === item.propellant) return;
    const sized = sizedRocket(totalOf(item), item.engine.engines, propellant);
    item.propellant = propellant;
    item.engine = { ...item.engine, exitVelocityMetresPerSecond: sized.engine.exitVelocityMetresPerSecond };
    item.ascent = { ...item.ascent, liftoffMassTonnes: sized.ascent.liftoffMassTonnes };
  },
  show: item => ROCKET.propellants[item.propellant].label
};

export const thrustLabel = newtons => (newtons >= 1e6 ? `${+(newtons / 1e6).toPrecision(3)} MN` : newtons >= 1e3 ? `${+(newtons / 1e3).toPrecision(3)} kN` : `${+newtons.toPrecision(3)} N`);

const rocketBurn = {
  label: 'Burn time',
  read: item => clamp01(logPosition(item.ascent.burnSeconds, range('burnSeconds'))),
  write: (item, t) => { item.ascent = { ...item.ascent, burnSeconds: Math.max(1, Math.round(logValue(t, range('burnSeconds')))) }; },
  show: item => `${item.ascent.burnSeconds} s`,
  entry: { unit: 's', get: item => item.ascent.burnSeconds, set: (item, value) => { item.ascent = { ...item.ascent, burnSeconds: value }; } }
};

const rocketKick = {
  label: 'Pitch kick',
  read: item => item.ascent.pitchKickDegrees / 10,
  write: (item, t) => { item.ascent = { ...item.ascent, pitchKickDegrees: +(t * 10).toFixed(1) }; },
  show: item => `${item.ascent.pitchKickDegrees}°`,
  entry: { unit: '°', get: item => item.ascent.pitchKickDegrees, set: (item, value) => { item.ascent = { ...item.ascent, pitchKickDegrees: value }; } }
};

const rocketLaunch = {
  label: 'Launch angle',
  read: item => (item.launchDegrees - range('launchDegrees')[0]) / (range('launchDegrees')[1] - range('launchDegrees')[0]),
  write: (item, t) => { item.launchDegrees = Math.round(range('launchDegrees')[0] + t * (range('launchDegrees')[1] - range('launchDegrees')[0])); },
  show: item => `${item.launchDegrees}°`,
  entry: { unit: '°', get: item => item.launchDegrees, set: (item, value) => { item.launchDegrees = value; } }
};

export function rocketMacros(emitter, { onset: withOnset = false } = {}) {
  const list = [rocketCategory, rocketSize, rocketPropellant, flightHeading, rocketLaunch, rocketBurn, rocketKick];
  return withOnset ? [...list, onset] : list;
}
