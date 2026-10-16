import { VIEW } from '../domain/constants.js';
import { jetOfEngine, powerLabel, powerOfEngine } from '../domain/engine.js';
import { jetComponents, speedOfSound } from '../domain/jet.js';
import { defaultJet } from '../domain/scene.js';
import { newSeed } from '../shared/domain/random.js';
import { formatMetres } from '../shared/ui/canvas.js';
import { checkboxField, numberField, pointFields, seedField, textField } from './fields.js';
import { cachedTracks } from './geometry-cache.js';
import { macrosFor } from './macros.js';
import { machCone } from '../shared/domain/trajectory.js';

const flownSeconds = (emitter, scene) => { const [path] = cachedTracks(emitter, scene); return Math.round((path.seconds.length - 1) * path.step); };

function summary(emitter, scene) {
  const jet = jetOfEngine(emitter.engine, scene.air.temperatureCelsius);
  return `${powerLabel(powerOfEngine(emitter.engine))}, jet ${Math.round(jet.velocityMetresPerSecond)} m/s · Mach ${emitter.mach.toFixed(2)} at ${formatMetres(emitter.startMetres.z)} for ${flownSeconds(emitter, scene)} s`;
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
      checkboxField(container, { label: 'Auto flight time', value: emitter.autoDuration, reliability: 'C', onCommit: set('autoDuration') });
      if (!emitter.autoDuration) numberField(container, { key: 'flightSeconds', value: emitter.durationSeconds, onCommit: set('durationSeconds') });
      else {
        const note = document.createElement('p');
        note.className = 'field-note';
        note.textContent = `Flies ${flownSeconds(emitter, scene)} s, until every microphone is out of hearing`;
        container.append(note);
      }
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

const pathPoints = (emitter, scene, at) => { for (const path of cachedTracks(emitter, scene)) path.x.forEach((x, index) => at({ x, y: path.y[index], z: path.z[index] })); };

function amplitudes(emitter, scene) {
  const { air } = scene;
  const components = jetComponents(jetOfEngine(emitter.engine, air.temperatureCelsius), { temperatureCelsius: air.temperatureCelsius, flightMetresPerSecond: emitter.mach * speedOfSound(air.temperatureCelsius) });
  const amplitude = 10 ** (components.large.decibels / 20) * 20e-6 * components.diameterMetres * Math.sqrt(components.large.peakHz);
  return new Map([[`${emitter.id}:0`, { amplitude, frequencyHz: components.large.peakHz }]]);
}

function wavefrontSources(emitter, scene, placedPoint, candidates) {
  cachedTracks(emitter, scene).forEach((path, member) => {
    const every = Math.max(1, Math.ceil(path.seconds.length / VIEW.wavefront.flightFronts));
    const spacingSeconds = every * path.step;
    for (let index = 0; index < path.seconds.length; index += every) candidates.push({ point: { x: path.x[index], y: path.y[index], z: path.z[index] }, emitted: path.seconds[index], group: `${emitter.id}:${member}`, spacingSeconds });
  });
}

function warnings(emitter, scene) {
  const [path] = cachedTracks(emitter, scene);
  const sound = speedOfSound(scene.air.temperatureCelsius);
  const jet = jetOfEngine(emitter.engine, scene.air.temperatureCelsius).velocityMetresPerSecond;
  const at = index => `${(index * path.step).toFixed(1)} s`;
  const supersonic = path.speed.findIndex(speed => speed >= sound);
  const outrun = path.speed.findIndex(speed => speed >= jet);
  return [
    ...(supersonic >= 0 ? [`Passes the speed of sound at ${at(supersonic)}; its boom is not heard here`] : []),
    ...(outrun >= 0 ? [`No jet noise above Mach ${(jet / sound).toFixed(1)} at this power`] : [])
  ];
}

export const isSupersonic = (emitter, scene) => cachedTracks(emitter, scene)[0].speed.some(speed => speed >= speedOfSound(scene.air.temperatureCelsius));

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
    tracks: (emitter, scene) => cachedTracks(emitter, scene),
    cone: machCone,
    amplitudes,
    wavefrontSources,
    mergesSources: false,
    warnings
  })
});

export const ADD_EMITTERS = Object.freeze({
  jet: Object.freeze({ create: defaultJet, label: 'Jet', mode: 'jet' })
});
