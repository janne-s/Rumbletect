import { engineAtPower, powerLabel, powerOfEngine } from '../domain/engine.js';
import { PARAMETERS } from '../domain/scene.js';

const logPosition = (value, [low, high]) => Math.log(value / low) / Math.log(high / low);
const logValue = (t, [low, high]) => low * (high / low) ** t;
const clamp01 = value => Math.min(1, Math.max(0, value));
const range = key => [PARAMETERS[key].minimum, PARAMETERS[key].maximum];

const metres = value => (value >= 1000 ? `${+(value / 1000).toPrecision(3)} km` : value >= 10 ? `${Math.round(value)} m` : `${+value.toPrecision(2)} m`);

const UNITS = Object.freeze({
  metres: Object.freeze({ m: 1, km: 1000 })
});

export function entryText(entry, item) {
  const value = entry.get(item);
  if (entry.units === 'metres') return metres(value);
  return `${+value.toPrecision(6)}${entry.unit ? ` ${entry.unit}` : ''}`;
}

export function parseEntry(entry, text, item) {
  const match = /^\s*([-+]?(?:\d+[.,]?\d*|[.,]\d+)(?:e[-+]?\d+)?)\s*(.*?)\s*$/i.exec(text);
  if (!match) throw new Error(`${text.trim() || 'An empty value'} is not a number.`);
  let value = Number(match[1].replace(',', '.'));
  const unit = match[2];
  if (entry.units) {
    const units = UNITS[entry.units];
    const shown = entryText(entry, item).split(' ').at(-1);
    const factor = units[unit || shown];
    if (factor === undefined) throw new Error(`Use ${Object.keys(units).join(', ')}.`);
    value *= factor;
  } else if (unit && unit !== entry.unit) throw new Error(entry.unit ? `Use ${entry.unit}.` : 'Give a plain number.');
  if (!Number.isFinite(value)) throw new Error(`${text.trim()} is not a number.`);
  return entry.integer ? Math.round(value) : value;
}

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
  entry: { units: 'metres', get: item => item.startMetres.z, set: (item, value) => { item.startMetres = { ...item.startMetres, z: value }; } }
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
  write: (item, t) => { item.durationSeconds = Math.max(1, Math.round(logValue(t, [1, 600]))); },
  show: item => `${item.durationSeconds} s`,
  entry: { unit: 's', get: item => item.durationSeconds, set: (item, value) => { item.durationSeconds = value; } }
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
