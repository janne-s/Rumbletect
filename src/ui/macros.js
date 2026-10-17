import { engineAtPower, powerLabel, powerOfEngine } from '../domain/engine.js';
import { PARAMETERS } from '../domain/scene.js';
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

const rocketThrottle = {
  label: 'Throttle',
  read: item => (item.ascent.throttlePercent - range('throttlePercent')[0]) / (range('throttlePercent')[1] - range('throttlePercent')[0]),
  write: (item, t) => { item.ascent = { ...item.ascent, throttlePercent: Math.round(range('throttlePercent')[0] + t * (range('throttlePercent')[1] - range('throttlePercent')[0])) }; },
  show: item => `${item.ascent.throttlePercent} % at max-Q`,
  entry: { unit: '%', get: item => item.ascent.throttlePercent, set: (item, value) => { item.ascent = { ...item.ascent, throttlePercent: value }; } }
};

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

const rocketEfficiency = {
  label: 'Efficiency',
  read: item => clamp01(logPosition(item.engine.efficiencyPercent, range('efficiencyPercent'))),
  write: (item, t) => { item.engine = { ...item.engine, efficiencyPercent: +logValue(t, range('efficiencyPercent')).toFixed(3) }; },
  show: item => `${item.engine.efficiencyPercent} %`,
  entry: { unit: '%', get: item => item.engine.efficiencyPercent, set: (item, value) => { item.engine = { ...item.engine, efficiencyPercent: value }; } }
};

export function rocketMacros(emitter, { onset: withOnset = false } = {}) {
  const list = [flightHeading, rocketThrottle, rocketBurn, rocketKick, rocketEfficiency];
  return withOnset ? [...list, onset] : list;
}
