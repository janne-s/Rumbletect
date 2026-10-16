import { VIEW } from '../domain/constants.js';
import { jetOfEngine, powerLabel, powerOfEngine } from '../domain/engine.js';
import { jetComponents, speedOfSound } from '../domain/jet.js';
import { defaultJet } from '../domain/scene.js';
import { newSeed } from '../shared/domain/random.js';
import { formatMetres } from '../shared/ui/canvas.js';
import { numberField, pointFields, seedField, textField } from './fields.js';
import { cachedTracks } from './geometry-cache.js';
import { macrosFor } from './macros.js';

function summary(emitter, scene) {
  const jet = jetOfEngine(emitter.engine, scene.air.temperatureCelsius);
  return `${powerLabel(powerOfEngine(emitter.engine))}, jet ${Math.round(jet.velocityMetresPerSecond)} m/s · Mach ${emitter.mach.toFixed(2)} at ${formatMetres(emitter.startMetres.z)} for ${emitter.durationSeconds} s`;
}

function details(emitter, { updateEmitter, scene }) {
  const set = key => value => updateEmitter(emitter.id, item => { item[key] = value; });
  const setEngine = key => value => updateEmitter(emitter.id, item => { item.engine = { ...item.engine, [key]: value }; });
  const section = (title, build) => ({ title, build });
  const numbers = keys => container => keys.forEach(key => numberField(container, { key, value: emitter[key], onCommit: set(key) }));
  const jet = jetOfEngine(emitter.engine, scene.air.temperatureCelsius);
  return [
    section('Placement', container => {
      textField(container, { label: 'Name', value: emitter.name, onCommit: set('name') });
      seedField(container, { value: emitter.seed, onCommit: set('seed'), onNew: () => set('seed')(newSeed()) });
      numberField(container, { key: 'startSeconds', value: emitter.startSeconds, onCommit: set('startSeconds') });
      pointFields(container, { label: 'Start', point: emitter.startMetres, onCommit: set('startMetres') });
    }),
    section('Flight', container => {
      numbers(['headingDegrees', 'climbDegrees', 'mach', 'accelerationMetresPerSecondSquared', 'turnDegreesPerSecond'])(container);
      numberField(container, { key: 'flightSeconds', value: emitter.durationSeconds, onCommit: set('durationSeconds') });
    }),
    section('Engine', container => {
      numberField(container, { key: 'pressureRatio', value: emitter.engine.pressureRatio, onCommit: setEngine('pressureRatio') });
      numberField(container, { key: 'totalTemperatureKelvin', value: emitter.engine.totalTemperatureKelvin, onCommit: setEngine('totalTemperatureKelvin') });
      numberField(container, { key: 'nozzleDiameterMetres', value: emitter.engine.diameterMetres, onCommit: setEngine('diameterMetres') });
      const note = document.createElement('p');
      note.className = 'field-note';
      note.textContent = `Jet ${Math.round(jet.velocityMetresPerSecond)} m/s · ${jet.temperatureRatio.toFixed(2)} × ambient temperature`;
      container.append(note);
    })
  ];
}

const pathPoints = (emitter, scene, at) => { for (const path of cachedTracks(emitter, scene.air)) path.x.forEach((x, index) => at({ x, y: path.y[index], z: path.z[index] })); };

function amplitudes(emitter, scene) {
  const { air } = scene;
  const components = jetComponents(jetOfEngine(emitter.engine, air.temperatureCelsius), { temperatureCelsius: air.temperatureCelsius, flightMetresPerSecond: emitter.mach * speedOfSound(air.temperatureCelsius) });
  const amplitude = 10 ** (components.large.decibels / 20) * 20e-6 * components.diameterMetres * Math.sqrt(components.large.peakHz);
  return new Map([[`${emitter.id}:0`, { amplitude, frequencyHz: components.large.peakHz }]]);
}

function wavefrontSources(emitter, scene, placedPoint, candidates) {
  cachedTracks(emitter, scene.air).forEach((path, member) => {
    const every = Math.max(1, Math.ceil(path.seconds.length / VIEW.wavefront.flightFronts));
    for (let index = 0; index < path.seconds.length; index += every) candidates.push({ point: { x: path.x[index], y: path.y[index], z: path.z[index] }, emitted: path.seconds[index], group: `${emitter.id}:${member}` });
  });
}

export const KIND_PANELS = Object.freeze({
  jet: Object.freeze({
    label: () => 'Jet',
    summary,
    macros: macrosFor,
    details,
    seeded: () => true,
    anchorName: () => 'start',
    info: () => [],
    bounds: (emitter, scene, include) => pathPoints(emitter, scene, include),
    measure: pathPoints,
    move: () => false,
    groundAnchored: () => false,
    timeline: () => [],
    alwaysTimed: () => false,
    eventSeconds: 0,
    tracks: (emitter, scene) => cachedTracks(emitter, scene.air),
    cone: () => null,
    amplitudes,
    wavefrontSources,
    mergesSources: false
  })
});

export const ADD_EMITTERS = Object.freeze({
  jet: Object.freeze({ create: defaultJet, label: 'Jet', mode: 'jet' })
});
