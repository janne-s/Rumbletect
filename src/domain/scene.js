import { MODEL_VERSION } from './constants.js';
import { engineAtPower } from './engine.js';
import { createScene } from '../shared/domain/scene.js';

export { DEFAULT_PLACE, DEFAULT_QUALITY, defaultReceiver, headingToward, PLACE_NAME_KINDS, placeLabel, QUALITY_NUMBERS, QUALITY_SWITCHES, SceneError, TERRAIN_DEFAULTS } from '../shared/domain/scene.js';

const RUMBLETECT_PARAMETERS = Object.freeze({
  startSeconds: { minimum: 0, maximum: 240, unit: 's', label: 'Onset', reliability: null },
  headingDegrees: { minimum: 0, maximum: 360, unit: '°', label: 'Heading', reliability: null },
  climbDegrees: { minimum: -90, maximum: 90, unit: '°', label: 'Climb', reliability: null },
  mach: { minimum: .1, maximum: .95, unit: '', label: 'Mach', reliability: null },
  accelerationMetresPerSecondSquared: { minimum: -50, maximum: 100, unit: 'm/s²', label: 'Acceleration', reliability: null },
  turnDegreesPerSecond: { minimum: -10, maximum: 10, unit: '°/s', label: 'Turn', reliability: null },
  flightSeconds: { minimum: 1, maximum: 600, unit: 's', label: 'Flight time', reliability: null },
  pressureRatio: { minimum: 1.05, maximum: 6, unit: '', label: 'Nozzle pressure ratio', reliability: 'C' },
  totalTemperatureKelvin: { minimum: 300, maximum: 2300, unit: 'K', label: 'Jet temperature', reliability: 'C' },
  nozzleDiameterMetres: { minimum: .1, maximum: 3, unit: 'm', label: 'Nozzle diameter', reliability: 'C' }
});

const JET_NUMBERS = Object.freeze(['startSeconds', 'headingDegrees', 'climbDegrees', 'mach', 'accelerationMetresPerSecondSquared', 'turnDegreesPerSecond']);

export function defaultJet(id = 'jet-1', name = 'Jet', seed = 20261015) {
  return {
    id, name, kind: 'jet', enabled: true, seed,
    startSeconds: 0,
    startMetres: { x: -2500, y: 0, z: 300 },
    headingDegrees: 90,
    climbDegrees: 0,
    mach: .44,
    accelerationMetresPerSecondSquared: 0,
    turnDegreesPerSecond: 0,
    durationSeconds: 33,
    engine: engineAtPower(.75)
  };
}

export const emitterAnchor = emitter => emitter.startMetres;

function readJet(value, { number, point, numbers }, path) {
  const engine = value.engine ?? {};
  return {
    startMetres: point(value.startMetres, `${path}.startMetres`),
    durationSeconds: number(value.durationSeconds, 'flightSeconds', `${path}.durationSeconds`),
    ...numbers(value, JET_NUMBERS, path),
    engine: {
      pressureRatio: number(engine.pressureRatio, 'pressureRatio', `${path}.engine.pressureRatio`),
      totalTemperatureKelvin: number(engine.totalTemperatureKelvin, 'totalTemperatureKelvin', `${path}.engine.totalTemperatureKelvin`),
      diameterMetres: number(engine.diameterMetres, 'nozzleDiameterMetres', `${path}.engine.diameterMetres`)
    }
  };
}

export const { PARAMETERS, MODES, defaultScene, parseScene, readScene, serializeScene, sceneInMode } = createScene({
  name: 'Rumbletect',
  format: 'rumbletect.scene',
  version: 1,
  modelVersion: MODEL_VERSION,
  anchor: emitterAnchor,
  modes: {
    jet: { kinds: ['jet'], emitter: () => defaultJet(), receiverMetres: { x: 0, y: 0, z: 1.7 } }
  },
  kinds: { jet: { defaults: () => defaultJet(), read: readJet } },
  parameters: RUMBLETECT_PARAMETERS
});
