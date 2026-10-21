import { ENGINE_CLASSES, engineAtPower, engineOfClass, powerLabel, powerOfEngine } from '../domain/engine.js';
import { PARAMETERS } from '../domain/scene.js';
import { ENGINE, ROCKET, VOLCANO } from '../domain/constants.js';
import { volcanoCategory } from '../domain/volcano.js';
import { categoryRocket, nearestCategory, sizedRocket } from '../domain/rocket.js';
import { clamp01, logPosition, logValue, METRES, metres } from '../shared/ui/macros.js';

const range = key => [PARAMETERS[key].minimum, PARAMETERS[key].maximum];

const power = {
  label: 'Power',
  read: item => powerOfEngine(item.engine, item.engineClass),
  write: (item, t) => { item.engine = { ...item.engine, ...engineAtPower(t, item.engineClass) }; },
  show: item => powerLabel(powerOfEngine(item.engine, item.engineClass), item.engineClass)
};

/** A class's usual flight keeps the path flown: its duration follows the new speed. */
const jetCategory = {
  label: 'Category',
  read: item => ENGINE_CLASSES.indexOf(item.engineClass) / (ENGINE_CLASSES.length - 1),
  write: (item, t) => {
    const engineClass = ENGINE_CLASSES[Math.round(t * (ENGINE_CLASSES.length - 1))];
    if (engineClass === item.engineClass) return;
    const { flight } = ENGINE.classes[engineClass];
    const flown = item.mach * item.durationSeconds;
    item.engineClass = engineClass;
    item.engine = engineOfClass(engineClass);
    item.mach = flight.mach;
    item.startMetres = { ...item.startMetres, z: flight.heightMetres };
    item.durationSeconds = Math.min(range('flightSeconds')[1], Math.max(range('flightSeconds')[0], Math.round(flown / flight.mach)));
  },
  show: item => ENGINE.classes[item.engineClass].label
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

const formationCount = {
  label: 'Aircraft',
  read: item => clamp01(logPosition(item.memberCount, range('memberCount'))),
  write: (item, t) => { item.memberCount = Math.round(logValue(t, range('memberCount'))); },
  show: item => `${item.memberCount}`,
  entry: { get: item => item.memberCount, set: (item, value) => { item.memberCount = value; } }
};

const SPACING_SPAN = Object.freeze([5, 2000]);
const TRAIL_RATIO = 1.5;

/** The formation's lateral spacing; the trail spacing keeps its ratio to it. */
const formationSpacing = {
  label: 'Spacing',
  read: item => clamp01(logPosition(Math.max(SPACING_SPAN[0], item.lateralSpacingMetres), SPACING_SPAN)),
  write: (item, t) => setSpacing(item, Math.round(logValue(t, SPACING_SPAN))),
  show: item => metres(item.lateralSpacingMetres),
  entry: { units: METRES, get: item => item.lateralSpacingMetres, set: (item, value) => setSpacing(item, value) }
};

function setSpacing(item, lateral) {
  const ratio = item.lateralSpacingMetres > 0 ? item.trailSpacingMetres / item.lateralSpacingMetres : TRAIL_RATIO;
  item.lateralSpacingMetres = Math.min(range('lateralSpacingMetres')[1], lateral);
  item.trailSpacingMetres = Math.min(range('trailSpacingMetres')[1], Math.round(item.lateralSpacingMetres * ratio));
}

export function macrosFor(emitter, { onset: withOnset = false } = {}) {
  const list = [...(emitter.kind === 'formation' ? [formationCount, formationSpacing] : []), jetCategory, power, machNumber, flightHeight, flightHeading, flightClimb, flightAcceleration, flightTurn, flightTime];
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

/** A new size changes the engine and the pad's water, not the flight; Category sets a typical burn and flight. */
const resize = (item, newtons) => {
  const sized = sizedRocket(newtons, item.engine.engines, item.propellant);
  item.engine = { ...item.engine, ...sized.engine };
  item.ascent = { ...item.ascent, water: sized.ascent.water };
};

const rocketSize = {
  label: 'Size',
  read: item => clamp01(logPosition(totalOf(item), SIZE_SPAN)),
  write: (item, t) => resize(item, +logValue(t, SIZE_SPAN).toPrecision(2)),
  show: item => thrustLabel(totalOf(item)),
  entry: { unit: 'kN', get: item => totalOf(item) / 1000, set: (item, value) => resize(item, value * 1000) }
};

const PROPELLANT_KEYS = Object.keys(ROCKET.propellants);

const rocketPropellant = {
  label: 'Propellant',
  read: item => PROPELLANT_KEYS.indexOf(item.propellant) / (PROPELLANT_KEYS.length - 1),
  write: (item, t) => {
    const propellant = PROPELLANT_KEYS[Math.round(t * (PROPELLANT_KEYS.length - 1))];
    if (propellant === item.propellant) return;
    item.propellant = propellant;
    item.engine = { ...item.engine, ...sizedRocket(totalOf(item), item.engine.engines, propellant).engine };
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

const setAscent = (item, key, value) => { item.ascent = { ...item.ascent, [key]: value }; };

const rocketBend = {
  label: 'Bend',
  read: item => item.ascent.bendDegrees / range('bendDegrees')[1],
  write: (item, t) => setAscent(item, 'bendDegrees', Math.round(t * range('bendDegrees')[1])),
  show: item => `${item.ascent.bendDegrees}°`,
  entry: { unit: '°', get: item => item.ascent.bendDegrees, set: (item, value) => setAscent(item, 'bendDegrees', value) }
};

const rocketTurnStart = {
  label: 'Turn starts',
  read: item => item.ascent.turnStartPercent / 100,
  write: (item, t) => setAscent(item, 'turnStartPercent', Math.round(t * 100)),
  show: item => `${item.ascent.turnStartPercent} %`,
  entry: { unit: '%', get: item => item.ascent.turnStartPercent, set: (item, value) => setAscent(item, 'turnStartPercent', value) }
};

const kilometresPerHour = metresPerSecond => `${Math.round(metresPerSecond * 3.6)} km/h`;
const SPEED = Object.freeze({ factors: Object.freeze({ 'km/h': 1 / 3.6, 'm/s': 1 }), show: kilometresPerHour });
const BURNOUT_SPAN = Object.freeze([10, 8000]);

const rocketBurnout = {
  label: 'Burnout speed',
  read: item => clamp01(logPosition(Math.max(BURNOUT_SPAN[0], item.ascent.burnoutMetresPerSecond), BURNOUT_SPAN)),
  write: (item, t) => setAscent(item, 'burnoutMetresPerSecond', +logValue(t, BURNOUT_SPAN).toPrecision(2)),
  show: item => kilometresPerHour(item.ascent.burnoutMetresPerSecond),
  entry: { units: SPEED, get: item => item.ascent.burnoutMetresPerSecond, set: (item, value) => setAscent(item, 'burnoutMetresPerSecond', value) }
};

const rocketAcceleration = {
  label: 'Acceleration',
  read: item => item.ascent.accelerationPercent / 100,
  write: (item, t) => setAscent(item, 'accelerationPercent', Math.round(t * 100)),
  show: item => `${item.ascent.accelerationPercent} %`,
  entry: { unit: '%', get: item => item.ascent.accelerationPercent, set: (item, value) => setAscent(item, 'accelerationPercent', value) }
};

const rocketLaunch = {
  label: 'Launch angle',
  read: item => (item.launchDegrees - range('launchDegrees')[0]) / (range('launchDegrees')[1] - range('launchDegrees')[0]),
  write: (item, t) => { item.launchDegrees = Math.round(range('launchDegrees')[0] + t * (range('launchDegrees')[1] - range('launchDegrees')[0])); },
  show: item => `${item.launchDegrees}°`,
  entry: { unit: '°', get: item => item.launchDegrees, set: (item, value) => { item.launchDegrees = value; } }
};

const salvoRounds = {
  label: 'Rounds',
  read: item => clamp01(logPosition(item.roundCount, range('roundCount'))),
  write: (item, t) => { item.roundCount = Math.round(logValue(t, range('roundCount'))); },
  show: item => `${item.roundCount}`,
  entry: { get: item => item.roundCount, set: (item, value) => { item.roundCount = value; } }
};

const salvoDuration = {
  label: 'Duration',
  read: item => item.salvoSeconds / range('salvoSeconds')[1],
  write: (item, t) => { item.salvoSeconds = Math.round(t * range('salvoSeconds')[1]); },
  show: item => `${item.salvoSeconds} s`,
  entry: { unit: 's', get: item => item.salvoSeconds, set: (item, value) => { item.salvoSeconds = value; } }
};

export function rocketMacros(emitter, { onset: withOnset = false } = {}) {
  const list = [...(emitter.kind === 'salvo' ? [salvoRounds, salvoDuration] : []), rocketCategory, rocketSize, rocketPropellant, flightHeading, rocketLaunch, rocketBend, rocketTurnStart, rocketBurn, rocketBurnout, rocketAcceleration];
  return withOnset ? [...list, onset] : list;
}

const VOLCANO_CATEGORIES = VOLCANO.categories;

const volcanoKind = {
  label: 'Category',
  read: item => VOLCANO_CATEGORIES.indexOf(volcanoCategory(item.category)) / (VOLCANO_CATEGORIES.length - 1),
  write: (item, t) => {
    const category = VOLCANO_CATEGORIES[Math.round(t * (VOLCANO_CATEGORIES.length - 1))];
    if (category.key === item.category) return;
    const { ventDiameterMetres, ventVelocityMetresPerSecond, gasTemperatureKelvin } = category;
    item.category = category.key;
    item.jet = { ventDiameterMetres, ventVelocityMetresPerSecond, gasTemperatureKelvin };
  },
  show: item => volcanoCategory(item.category).label
};

const INTENSITY_SPAN = Object.freeze([.25, 1.5]);

const volcanoIntensity = {
  label: 'Intensity',
  read: item => clamp01(logPosition(item.jet.ventVelocityMetresPerSecond / volcanoCategory(item.category).ventVelocityMetresPerSecond, INTENSITY_SPAN)),
  write: (item, t) => {
    const velocity = Math.round(logValue(t, INTENSITY_SPAN) * volcanoCategory(item.category).ventVelocityMetresPerSecond);
    item.jet = { ...item.jet, ventVelocityMetresPerSecond: Math.min(range('ventVelocityMetresPerSecond')[1], Math.max(range('ventVelocityMetresPerSecond')[0], velocity)) };
  },
  show: item => `${Math.round(item.jet.ventVelocityMetresPerSecond)} m/s`,
  entry: { unit: 'm/s', get: item => item.jet.ventVelocityMetresPerSecond, set: (item, value) => { item.jet = { ...item.jet, ventVelocityMetresPerSecond: value }; } }
};

const eruptionSlider = (key, label, span, unit = 's') => ({
  label,
  read: item => clamp01(logPosition(Math.max(span[0], item.eruption[key]), span)),
  write: (item, t) => { item.eruption = { ...item.eruption, [key]: Math.round(logValue(t, span)) }; },
  show: item => `${item.eruption[key]} ${unit}`,
  entry: { unit, get: item => item.eruption[key], set: (item, value) => { item.eruption = { ...item.eruption, [key]: value }; } }
});

const volcanoPulsing = {
  label: 'Pulsing',
  read: item => item.eruption.pulseDepthPercent / 100,
  write: (item, t) => { item.eruption = { ...item.eruption, pulseDepthPercent: Math.round(t * 100) }; },
  show: item => `${item.eruption.pulseDepthPercent} %`,
  entry: { unit: '%', get: item => item.eruption.pulseDepthPercent, set: (item, value) => { item.eruption = { ...item.eruption, pulseDepthPercent: value }; } }
};

export function volcanoMacros(emitter, { onset: withOnset = false } = {}) {
  const list = [
    volcanoKind, volcanoIntensity,
    eruptionSlider('eruptionSeconds', 'Duration', [range('eruptionSeconds')[0], range('eruptionSeconds')[1]]),
    volcanoPulsing,
    eruptionSlider('pulsePeriodSeconds', 'Pulse period', [range('pulsePeriodSeconds')[0], range('pulsePeriodSeconds')[1]]),
    eruptionSlider('riseSeconds', 'Rise', [1, range('riseSeconds')[1]]),
    eruptionSlider('fadeSeconds', 'Fade', [1, range('fadeSeconds')[1]])
  ];
  return withOnset ? [...list, onset] : list;
}
