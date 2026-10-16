import { APP_VERSION, GROUND, MODEL_VERSION, RENDER, VIEW } from './domain/constants.js';
import { jetOfEngine, powerLabel, powerOfEngine } from './domain/engine.js';
import { GROUND_LABELS, GROUND_TYPES } from './domain/ground.js';
import { newSeed } from './domain/random.js';
import { defaultJet, defaultReceiver, defaultScene, emitterAnchor, headingToward, PARAMETERS, parseScene, placeLabel, readScene, serializeScene } from './domain/scene.js';
import { speedOfSoundMetresPerSecond } from './domain/air.js';
import { AMBISONIC_CONVENTION, availableItems, exportDownload, exportFiles, exportPlan, exportSizes, fileStem, itemFiles } from './ui/export-package.js';
import { formatMetres, formatSeconds, microphoneColor } from './ui/canvas.js';
import { actionField, checkboxField, numberField, pointFields, seedField, selectField, textField } from './ui/fields.js';
import { searchPlace } from './ui/terrain-loader.js';
import { createPlaceMap } from './ui/place-map.js';
import { createCubeView } from './ui/cube-view.js';
import { createMapLayer } from './ui/map-layer.js';
import { createLatestTask } from './ui/latest-task.js';
import { cachedTracks, isTrackKind } from './ui/geometry-cache.js';
import { entryText, macrosFor, parseEntry } from './ui/macros.js';
import { composeListening, LISTENING_LABELS, listeningKind } from './ui/listening.js';
import { createOrientationBall } from './ui/orientation-ball.js';
import { createMobileLayout } from './ui/mobile.js';
import { createSettings } from './ui/settings.js';
import { createPlayer } from './ui/player.js';
import { drawArrivals, drawWaveform, plotSeconds } from './ui/plots.js';
import { attachSplitters } from './ui/splitters.js';
import { attachTimelineSeek } from './ui/timeline.js';
import { createRenderMarker, unfinishedRenderText } from './ui/render-marker.js';

const SCENE_STORAGE_KEY = 'rumbletect.scene';
const PREFERENCES_STORAGE_KEY = 'rumbletect.preferences';
let resetting = false;
window.addEventListener('app-reset', () => { resetting = true; });
const WORKER_COUNT = Math.max(1, Math.min(RENDER.maximumWorkers, (navigator.hardwareConcurrency || 2) - 1));
const workerLimit = () => Math.max(1, Math.min(WORKER_COUNT, state.preferences.threads || WORKER_COUNT));

const KIND_LABELS = Object.freeze({ jet: 'Jet' });

const $ = id => document.getElementById(id);

const RENDER_MARKER_STORAGE_KEY = 'rumbletect.renderUnfinished';
const renderMarker = createRenderMarker({
  getItem: key => localStorage.getItem(key),
  setItem: (key, value) => { if (!resetting) localStorage.setItem(key, value); },
  removeItem: key => localStorage.removeItem(key)
}, RENDER_MARKER_STORAGE_KEY);
// Read before anything renders, which would replace it.
const unfinishedRender = renderMarker.take();

const storage = {
  read(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  },
  write(key, value) {
    if (resetting) return;
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }
};

function restoredScene() {
  try {
    return readScene(storage.read(SCENE_STORAGE_KEY));
  } catch {}
  return defaultScene();
}

const preferences = {
  realDelay: true, map: false, autoRender: true, cubeView: null,
  panelWidth: 340, resultsHeight: 220,
  ...(storage.read(PREFERENCES_STORAGE_KEY) ?? {})
};

const state = {
  scene: restoredScene(),
  selection: null,
  results: null,
  pause: null,
  envelopes: new Map(),
  revision: 0,
  workers: [],
  renderTimer: null,
  watchdog: null,
  detailsId: null,
  soloId: null,
  preferences
};
state.selection = { type: 'emitter', id: state.scene.emitters[0]?.id ?? null };

const player = createPlayer();
const mobile = createMobileLayout({ onResults: () => drawResults() });
createSettings({
  read: () => ({ threads: workerLimit(), maximumThreads: WORKER_COUNT }),
  save: ({ threads }) => {
    state.preferences.threads = threads === WORKER_COUNT ? 0 : threads;
    savePreferences();
  }
});

const liveFields = { receiver: null, orientation: null };

function panelOnNextFrame() {
  if (panelOnNextFrame.pending) return;
  panelOnNextFrame.pending = true;
  requestAnimationFrame(() => { panelOnNextFrame.pending = false; refreshPanel(); });
}

const orientationBall = createOrientationBall($('cube-orientation-ball'), {
  getView: () => views[0].getView(),
  onChange: (heading, pitch) => { const target = orientationTarget(); if (target) orient(target.id, heading, pitch); },
  onCommit: () => storeScene()
});

document.addEventListener('keydown', event => { if (event.key === 'Tab') document.documentElement.dataset.keyboard = ''; }, true);
document.addEventListener('pointerdown', () => { delete document.documentElement.dataset.keyboard; }, true);

const mapLayer = createMapLayer(() => redrawViews());

const views = [createCubeView($('cube'), {
  onView: next => { state.preferences.cubeView = next; savePreferences(); },
  onViewChange: () => orientationBall?.draw(),
  onSelect: selection => { select(selection); refreshPanel(); },
  onMove: (handle, point) => {
    const item = findItem(handle.type, handle.id);
    if (handle.field === 'flightHeading') {
      const heading = headingToward(emitterAnchor(item), point);
      if (heading === item.headingDegrees) return;
      item.headingDegrees = heading;
      handle.changed = true;
      invalidateResults();
      redrawViews();
      drawInfo();
      panelOnNextFrame();
      return;
    }
    if (handle.field === 'headingDegrees') {
      orient(item.id, headingToward(item.positionMetres, point), item.pitchDegrees);
      return;
    }
    const before = JSON.stringify(item[handle.field]);
    item[handle.field] = storedPoint(handle, item, point);
    const live = liveFields[handle.type]?.[handle.field];
    if (live) {
      panelOnNextFrame.skip = true;
      live.set(item[handle.field]);
    }
    if (JSON.stringify(item[handle.field]) === before) { panelOnNextFrame.skip = false; return; }
    handle.changed = true;
    invalidateResults();
    redrawViews();
    drawInfo();
    if (!panelOnNextFrame.skip) panelOnNextFrame();
    panelOnNextFrame.skip = false;
  },
  onCommit: handle => {
    if (handle.field === 'headingDegrees') storeScene();
    else if (handle.changed) commit(() => {});
  },
  focus: () => focusReceiver(),
  map: () => state.preferences.map,
  mapTiles: area => mapLayer.tiles(state.scene.place, area)
})];

function storedPoint(handle, item, point) {
  if (handle.field !== 'positionMetres') return point;
  if (handle.onGround) return { ...point, z: 0 };
  if (handle.plane?.fixed === 'z') return { ...point, z: item[handle.field].z };
  const step = Math.min(.1, handle.resolution ?? .1);
  return { ...point, z: +(Math.round(Math.min(PARAMETERS.heightMetres.maximum, Math.max(0, point.z)) / step) * step).toFixed(Math.max(0, -Math.log10(step))) };
}
views[0].setView(state.preferences.cubeView ?? VIEW.box.defaultView);
attachSplitters($('cube').closest('.layout'), { column: $('split-column'), row: $('split-row') }, state.preferences, sizes => {
  Object.assign(state.preferences, sizes);
  savePreferences();
});

function findItem(type, id) {
  if (!type) return null;
  return (type === 'emitter' ? state.scene.emitters : state.scene.receivers).find(item => item.id === id);
}

function select(selection) {
  state.selection = selection;
  if (selection.type === 'receiver') state.soloId = selection.id;
}

function setStatus(text, error = false) {
  const status = $('status');
  clearTimeout(setStatus.timer);
  status.textContent = text;
  status.classList.toggle('error', error);
  status.classList.remove('faded');
  if (text && !error) setStatus.timer = setTimeout(() => status.classList.add('faded'), VIEW.statusSeconds * 1000);
}

function applyScene(change) {
  const next = structuredClone(state.scene);
  change(next);
  try {
    state.scene = parseScene(next);
  } catch (error) {
    setStatus(error.message, true);
    refreshPanel();
    return false;
  }
  storeScene();
  return true;
}

function commit(change) {
  if (!applyScene(change)) return;
  if (state.selection.type && !findItem(state.selection.type, state.selection.id)) state.selection = { type: null, id: null };
  if (state.soloId && !findItem('receiver', state.soloId)) state.soloId = null;
  invalidateResults();
  refreshPanel();
  requestRender();
}

function invalidateResults() {
  clearTimeout(state.renderTimer);
  stopWorkers();
  player.stop();
  state.pause = null;
  state.results = null;
  $('export').disabled = true;
  syncPlayButton();
}

const operations = new Map();
let operationsTimer = null;

function operation(key, text, { share = null, limitSeconds = null } = {}) {
  if (text === null) operations.delete(key);
  else operations.set(key, { text, share, limitSeconds, since: operations.get(key)?.since ?? performance.now() });
  drawOperations();
  if (key === 'render') {
    renderMarker.phase(text);
    syncPlayButton();
  }
}

function drawOperations() {
  const now = performance.now();
  $('cube-operations').replaceChildren(...[...operations.values()].map(({ text, share, limitSeconds, since }) => {
    const seconds = Math.floor((now - since) / 1000);
    const parts = [text];
    if (share !== null) parts.push(`${Math.round(share * 100)} %`);
    if (limitSeconds) parts.push(`${seconds} / ${limitSeconds} s`);
    else if (seconds >= 1) parts.push(`${seconds} s`);
    const bar = element('li', 'operation', parts.join(' · '));
    bar.style.setProperty('--share', share === null ? '0%' : `${Math.min(100, share * 100)}%`);
    return bar;
  }));
  if (operations.size && !operationsTimer) operationsTimer = setInterval(drawOperations, 500);
  if (!operations.size && operationsTimer) { clearInterval(operationsTimer); operationsTimer = null; }
}

function syncPlayButton() {
  const button = $('play');
  const playing = player.playing();
  const rendering = operations.has('render');
  const busy = !playing && rendering;
  button.textContent = playing ? 'Stop' : busy ? '' : state.results ? 'Play' : 'Render';
  button.setAttribute('aria-label', busy ? 'Rendering' : button.textContent);
  if (busy) button.setAttribute('aria-busy', 'true'); else button.removeAttribute('aria-busy');
  button.disabled = !playing && (rendering || (!state.results && !state.scene.emitters.some(emitter => emitter.enabled)));
  button.setAttribute('aria-pressed', playing ? 'true' : 'false');
  const pause = $('plot-play');
  pause.disabled = !state.results;
  pause.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  pause.classList.toggle('playing', playing);
  $('results').classList.toggle('playable', Boolean(state.results));
}

function requestRender() {
  clearTimeout(state.renderTimer);
  if (state.preferences.autoRender) scheduleRender();
  else syncPlayButton();
}

function scheduleRender() {
  clearTimeout(state.renderTimer);
  state.renderTimer = setTimeout(startRender, RENDER.autoDelayMilliseconds);
}

function failRender(message) {
  stopWorkers();
  setStatus(message, true);
  drawResults();
}

function stopWorkers() {
  state.revision += 1;
  state.workers.forEach(worker => worker.terminate());
  state.workers = [];
  clearInterval(state.watchdog);
  operation('render', null);
}

function spawnWorker(revision, message, { onProgress, onResult }) {
  const worker = new Worker(new URL('./render-worker.js', import.meta.url), { type: 'module' });
  state.workers.push(worker);
  worker.addEventListener('message', ({ data }) => {
    if (data.revision !== state.revision) return;
    state.heard = performance.now();
    if (data.type === 'progress') { onProgress?.(data.fraction); return; }
    if (data.type === 'error') { failRender(data.message); return; }
    worker.terminate();
    onResult(data);
  });
  worker.addEventListener('error', event => {
    if (revision !== state.revision) return;
    failRender(event.message || 'The renderer failed to start.');
  });
  worker.postMessage({ revision, ...message });
}

function startRender() {
  stopWorkers();
  const revision = state.revision;
  setStatus('');
  const { scene } = state;
  if (!scene.emitters.some(emitter => emitter.enabled)) {
    if (scene.emitters.length) setStatus('No emitter is enabled.');
    drawResults();
    return;
  }
  const started = performance.now();
  state.heard = performance.now();
  operation('render', 'Rendering', { share: 0 });
  // A worker the browser stops, as when it runs out of memory, may never report; this ends the wait.
  state.watchdog = setInterval(() => {
    if (revision !== state.revision || performance.now() - state.heard < RENDER.stallSeconds * 1000) return;
    failRender('The render stopped responding, likely out of memory');
  }, 5000);
  const workers = Math.min(workerLimit(), scene.receivers.length);
  const jobs = Array.from({ length: workers }, (_, job) => scene.receivers.map((_, index) => index).filter(index => index % workers === job));
  const progress = new Array(workers).fill(0);
  const results = new Map();
  let remaining = workers;
  jobs.forEach((receivers, job) => spawnWorker(revision, { scene, receivers }, {
    onProgress: fraction => {
      progress[job] = fraction;
      operation('render', 'Rendering', { share: progress.reduce((a, b) => a + b, 0) / workers });
    },
    onResult: data => {
      data.results.forEach(result => results.set(result.receiverId, result));
      remaining -= 1;
      if (remaining === 0) finishRender(scene, results, { started, workers });
    }
  }));
}

function finishRender(scene, rendered, { started, workers }) {
  state.workers = [];
  clearInterval(state.watchdog);
  state.results = new Map(scene.receivers.map(receiver => [receiver.id, rendered.get(receiver.id)]));
  state.envelopes = envelopes([...state.results.values()]);
  const jets = scene.emitters.filter(emitter => emitter.enabled).length;
  setStatus(`Rendered ${jets} jet${jets === 1 ? '' : 's'} at ${scene.receivers.length} microphone${scene.receivers.length === 1 ? '' : 's'} in ${((performance.now() - started) / 1000).toFixed(1)} s on ${workers} thread${workers === 1 ? '' : 's'}`);
  operation('render', null);
  $('export').disabled = false;
  drawResults();
  drawInfo();
}

function envelopes(results) {
  const raw = results.map(result => {
    const window = Math.max(1, Math.round(result.sampleRate * VIEW.envelopeSeconds));
    const values = new Float32Array(Math.ceil(result.samples.length / window));
    for (let block = 0; block < values.length; block += 1) {
      let sum = 0;
      const end = Math.min(result.samples.length, (block + 1) * window);
      for (let index = block * window; index < end; index += 1) sum += result.samples[index] ** 2;
      values[block] = Math.sqrt(sum / Math.max(1, end - block * window));
    }
    return { result, values };
  });
  const maximum = Math.max(0, ...raw.map(({ values }) => values.reduce((a, b) => Math.max(a, b), 0)));
  for (const { values } of raw) {
    for (let block = 0; block < values.length; block += 1) {
      values[block] = maximum > 0 && values[block] > 0 ? Math.max(0, 1 + 20 * Math.log10(values[block] / maximum) / VIEW.envelopeRangeDb) : 0;
    }
  }
  return new Map(raw.map(({ result, values }) => [result.receiverId, { window: VIEW.envelopeSeconds, startSeconds: result.startSeconds, values }]));
}

function focusReceiver() {
  const solo = state.soloId && findItem('receiver', state.soloId);
  if (solo) return solo;
  const { heads, omnis } = listeningKind(state.scene.receivers, state.scene.render.ambisonicOrder);
  return heads[0] ?? omnis[0] ?? state.scene.receivers[0];
}

function outputGainForPeak(peakPa) {
  const { levelMode, fullScalePa } = state.scene.render;
  if (levelMode === 'fixed') return 1 / fullScalePa;
  return peakPa > 0 ? RENDER.peakTarget / peakPa : 1;
}

function playedPeakPa() {
  const { heads, omnis } = listeningKind(state.scene.receivers, state.scene.render.ambisonicOrder);
  return Math.max(0, ...[...heads, ...omnis].map(receiver => state.results?.get(receiver.id)?.peakPa ?? 0));
}

function listening() {
  const composition = composeListening(state.scene, state.results);
  if (!composition) return null;
  let gain = outputGainForPeak(composition.peakPa);
  if (composition.heads.length) gain *= RENDER.binauralHeadroom;
  if (composition.kind === 'mix') gain /= Math.sqrt(composition.parts);
  return { composition, gain };
}

function savePreferences() {
  storage.write(PREFERENCES_STORAGE_KEY, state.preferences);
}

const emitterKindLabel = emitter => KIND_LABELS[emitter.kind];

const updateEmitter = (id, change) => commit(scene => change(scene.emitters.find(emitter => emitter.id === id)));
const updateReceiver = (id, change) => commit(scene => change(scene.receivers.find(receiver => receiver.id === id)));

function preview(change) {
  change(state.scene);
  invalidateResults();
  redrawViews();
  drawInfo();
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(text, onClick, { disabled = false, title = '' } = {}) {
  const node = element('button', '', text);
  node.type = 'button';
  node.disabled = disabled;
  if (title) node.title = title;
  node.addEventListener('click', onClick);
  return node;
}

function emitterSummary(emitter) {
  const jet = jetOfEngine(emitter.engine, state.scene.air.temperatureCelsius);
  return `${powerLabel(powerOfEngine(emitter.engine))}, jet ${Math.round(jet.velocityMetresPerSecond)} m/s · Mach ${emitter.mach.toFixed(2)} at ${formatMetres(emitter.startMetres.z)} for ${emitter.durationSeconds} s`;
}

function paintTrack(element, from, to) {
  const at = t => `calc(${VIEW.panels.thumbHalfPixels}px + (100% - ${2 * VIEW.panels.thumbHalfPixels}px) * ${t})`;
  element.style.setProperty('--from', from === 0 ? '0%' : at(from));
  element.style.setProperty('--to', at(to));
}

function holdViews(on) {
  views.forEach(view => view.hold(on));
}

function typeEntry(value, emitter, macro) {
  const field = element('input', 'macro-entry');
  field.type = 'text';
  field.value = entryText(macro.entry, emitter);
  field.setAttribute('aria-label', macro.label);
  let done = false;
  const finish = apply => {
    if (done) return;
    done = true;
    if (!apply) { field.replaceWith(value); value.focus(); return; }
    let number;
    try {
      number = parseEntry(macro.entry, field.value, emitter);
    } catch (error) {
      setStatus(`${macro.label}: ${error.message}`, true);
      field.replaceWith(value);
      return;
    }
    commit(scene => macro.entry.set(scene.emitters.find(item => item.id === emitter.id), number));
  };
  field.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); finish(true); }
    if (event.key === 'Escape') { event.preventDefault(); finish(false); }
  });
  field.addEventListener('blur', () => finish(true));
  value.replaceWith(field);
  field.focus();
  field.select();
}

function macroRow(container, emitter, macro) {
  const id = `macro-${emitter.id}-${macro.label}`;
  const label = element('label', '', macro.label);
  label.htmlFor = id;
  const steps = macro.steps ?? VIEW.panels.macroSteps;
  const value = element(macro.entry ? 'button' : 'span', 'macro-value', macro.show(emitter));
  if (macro.entry) {
    value.type = 'button';
    value.setAttribute('aria-label', `${macro.label} ${macro.show(emitter)}`);
    value.addEventListener('click', () => typeEntry(value, emitter, macro));
  }
  const input = element('input');
  input.type = 'range';
  input.min = '0';
  input.max = String(steps);
  input.step = '1';
  input.value = String(Math.round(macro.read(emitter) * steps));
  input.id = id;
  const apply = () => preview(scene => {
    const item = scene.emitters.find(candidate => candidate.id === emitter.id);
    macro.write(item, Number(input.value) / steps);
    value.textContent = macro.show(item);
    if (macro.entry) value.setAttribute('aria-label', `${macro.label} ${value.textContent}`);
  });
  paintTrack(input, 0, Number(input.value) / steps);
  input.addEventListener('input', () => { holdViews(true); paintTrack(input, 0, Number(input.value) / steps); apply(); });
  input.addEventListener('change', () => { holdViews(false); commit(() => {}); });
  container.append(label, input, value);
}

function cardNode(selected, { checked, title, onCheck, onToggle }, ...parts) {
  const node = element('div', 'card');
  node.setAttribute('aria-selected', String(selected));
  const header = element('div', 'card-header');
  header.tabIndex = 0;
  header.setAttribute('role', 'button');
  header.setAttribute('aria-expanded', String(selected));
  const checkbox = element('input');
  checkbox.type = 'checkbox';
  checkbox.checked = checked;
  checkbox.title = title;
  checkbox.addEventListener('click', event => event.stopPropagation());
  checkbox.addEventListener('change', () => onCheck(checkbox.checked));
  header.append(checkbox, ...parts);
  header.addEventListener('click', onToggle);
  header.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onToggle(); } });
  node.append(header);
  return node;
}

function emitterCard(container, emitter, selected) {
  const { scene } = state;
  const remove = element('button', 'icon-button');
  remove.type = 'button';
  remove.title = 'Remove';
  remove.setAttribute('aria-label', `Remove ${emitter.name}`);
  remove.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
  remove.addEventListener('click', event => {
    event.stopPropagation();
    commit(next => { next.emitters = next.emitters.filter(item => item.id !== emitter.id); });
  });
  remove.addEventListener('keydown', event => event.stopPropagation());
  const card = cardNode(selected, {
    checked: emitter.enabled, title: 'Enabled',
    onCheck: on => updateEmitter(emitter.id, item => { item.enabled = on; }),
    onToggle: () => { state.selection = selected ? { type: null, id: null } : { type: 'emitter', id: emitter.id }; refreshPanel(); }
  }, element('span', 'name', emitter.name), element('span', 'kind', emitterKindLabel(emitter)), remove);
  if (selected) {
    card.append(element('p', 'card-summary', emitterSummary(emitter)));
    const macros = element('div', 'macros');
    macrosFor(emitter, { onset: scene.emitters.length > 1 || emitter.startSeconds > 0 }).forEach(macro => macroRow(macros, emitter, macro));
    card.append(macros);
    const actions = element('div', 'card-actions');
    actions.append(button('Details…', () => openDetails(emitter.id)));
    actions.append(button('New noise', () => updateEmitter(emitter.id, item => { item.seed = newSeed(); }), { title: 'Same parameters, new seed' }));
    actions.append(button('Variant', () => addEmitter(next => {
      const source = next.emitters.find(item => item.id === emitter.id);
      source.enabled = false;
      return { ...structuredClone(source), id: uniqueId(source.kind, next.emitters), name: `${source.name} variant`.slice(0, 64), seed: newSeed(), enabled: true };
    }), { disabled: scene.emitters.length >= RENDER.maximumEmitters, title: 'Copy with a new seed; the original is switched off' }));
    card.append(actions);
  }
  container.append(card);
}

function commitListening(change) {
  if (!applyScene(change)) return;
  refreshPanel();
  drawInfo();
  if (player.playing()) resumePlayback();
}

function orient(receiverId, headingDegrees, pitchDegrees) {
  const item = state.scene.receivers.find(candidate => candidate.id === receiverId);
  item.headingDegrees = headingDegrees;
  item.pitchDegrees = pitchDegrees;
  player.setOrientation(receiverId, headingDegrees, pitchDegrees);
  if (liveFields.orientation?.receiverId === receiverId) liveFields.orientation.set(item);
  if (orientationTarget()?.id === receiverId) orientationBall.set(item);
  $('cube-orientation-value').textContent = orientationText(item);
  redrawViews();
}

function orientationTarget() {
  const selected = state.selection.type === 'receiver' ? findItem('receiver', state.selection.id) : null;
  if (selected?.type === 'binaural') return selected;
  return state.scene.receivers.find(receiver => receiver.listen && receiver.type === 'binaural') ?? null;
}

const orientationText = receiver => `${compassLabel(receiver.headingDegrees)} · ${receiver.pitchDegrees > 0 ? '+' : ''}${receiver.pitchDegrees}°`;

function drawOrientation() {
  const target = orientationTarget();
  $('cube-orientation').hidden = !target;
  if (!target) return;
  $('cube-orientation-name').textContent = target.name;
  $('cube-orientation-value').textContent = orientationText(target);
  orientationBall.set(target);
}

function storeScene() {
  storage.write(SCENE_STORAGE_KEY, state.scene);
}

const RECEIVER_TYPE_LABELS = Object.freeze({ omni: 'Omni', binaural: 'Binaural' });

function receiverCard(container, receiver, selected) {
  const remove = element('button', 'icon-button');
  remove.type = 'button';
  remove.title = 'Remove';
  remove.disabled = state.scene.receivers.length <= 1;
  remove.style.visibility = remove.disabled ? 'hidden' : '';
  remove.setAttribute('aria-label', `Remove ${receiver.name}`);
  remove.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
  remove.addEventListener('click', event => {
    event.stopPropagation();
    commit(next => { next.receivers = next.receivers.filter(item => item.id !== receiver.id); });
  });
  remove.addEventListener('keydown', event => event.stopPropagation());
  const card = cardNode(selected, {
    checked: receiver.listen, title: 'Listen',
    onCheck: on => commitListening(next => { next.receivers.find(item => item.id === receiver.id).listen = on; }),
    onToggle: () => { select(selected ? { type: null, id: null } : { type: 'receiver', id: receiver.id }); refreshPanel(); }
  }, element('span', 'name', receiver.name), element('span', 'kind', `${RECEIVER_TYPE_LABELS[receiver.type]} · ${formatMetres(receiver.positionMetres.z)}`), remove);
  if (selected) {
    const fields = element('div', 'fields');
    textField(fields, { label: 'Name', value: receiver.name, onCommit: value => updateReceiver(receiver.id, item => { item.name = value; }) });
    selectField(fields, {
      label: 'Type', value: receiver.type, options: Object.entries(RECEIVER_TYPE_LABELS),
      onCommit: value => {
        if (value === 'binaural' && state.scene.render.ambisonicOrder === 0) {
          commit(next => { next.receivers.find(item => item.id === receiver.id).type = value; next.render.ambisonicOrder = 1; });
        } else commitListening(next => { next.receivers.find(item => item.id === receiver.id).type = value; });
      }
    });
    liveFields.receiver = {
      positionMetres: pointFields(fields, {
        label: 'Position (m)', point: receiver.positionMetres,
        onCommit: value => updateReceiver(receiver.id, item => { item.positionMetres = value; })
      })
    };
    card.append(fields);
    if (receiver.type === 'binaural') {
      const orientation = element('div', 'fields');
      const facing = numberField(orientation, {
        key: 'facingDegrees', value: receiver.headingDegrees,
        onCommit: heading => commitListening(next => { next.receivers.find(item => item.id === receiver.id).headingDegrees = heading; })
      });
      const elevation = numberField(orientation, {
        key: 'pitchDegrees', value: receiver.pitchDegrees,
        onCommit: pitch => commitListening(next => { next.receivers.find(item => item.id === receiver.id).pitchDegrees = pitch; })
      });
      liveFields.orientation = { receiverId: receiver.id, set: item => { facing.set(item.headingDegrees); elevation.set(item.pitchDegrees); } };
      card.append(orientation);
    }
  }
  container.append(card);
}

function detailSections(emitter) {
  const set = key => value => updateEmitter(emitter.id, item => { item[key] = value; });
  const setEngine = key => value => updateEmitter(emitter.id, item => { item.engine = { ...item.engine, [key]: value }; });
  const section = (title, build) => ({ title, build });
  const numbers = keys => container => keys.forEach(key => numberField(container, { key, value: emitter[key], onCommit: set(key) }));
  const jet = jetOfEngine(emitter.engine, state.scene.air.temperatureCelsius);
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
      container.append(element('p', 'field-note', `Jet ${Math.round(jet.velocityMetresPerSecond)} m/s · ${jet.temperatureRatio.toFixed(2)} × ambient temperature`));
    })
  ];
}

function openDetails(id) {
  state.detailsId = id;
  renderDetails();
  if ($('details').open) return;
  $('details').showModal();
  // Focus the dialog itself, so its first control is not ringed when it opens.
  $('details').focus();
}

function renderDetails() {
  if (deferWhileEditing($('details-body'), renderDetails)) return;
  keepingFocus($('details-body'), rebuildDetails);
}

function rebuildDetails() {
  const emitter = state.scene.emitters.find(item => item.id === state.detailsId);
  if (!emitter) { $('details').close(); return; }
  const kind = emitterKindLabel(emitter);
  $('details-title').textContent = kind === emitter.name ? emitter.name : `${emitter.name} · ${kind}`;
  const body = $('details-body');
  const scroll = body.scrollTop;
  body.replaceChildren(...detailSections(emitter).map(({ title, build }) => {
    const group = element('section', 'details-section');
    group.append(element('h3', '', title));
    const fields = element('div', 'fields');
    build(fields);
    group.append(fields);
    return group;
  }));
  body.scrollTop = scroll;
}

const placeSearchTask = createLatestTask();

function sceneExtentMetres() {
  const bounds = { west: Infinity, east: -Infinity, south: Infinity, north: -Infinity };
  const include = (x, y) => {
    bounds.west = Math.min(bounds.west, x); bounds.east = Math.max(bounds.east, x);
    bounds.south = Math.min(bounds.south, y); bounds.north = Math.max(bounds.north, y);
  };
  for (const emitter of state.scene.emitters) {
    for (const path of cachedTracks(emitter, state.scene.air)) path.x.forEach((x, index) => include(x, path.y[index]));
  }
  state.scene.receivers.forEach(receiver => include(receiver.positionMetres.x, receiver.positionMetres.y));
  return Math.max(VIEW.box.minimumSpanMetres, bounds.east - bounds.west, bounds.north - bounds.south);
}

function setPlace(change) {
  commit(next => { next.place = { ...next.place, ...change }; });
}

function placePanel(container) {
  const { scene } = state;
  const mapButton = button('', () => openPlaceDialog(), { title: 'Choose on a map' });
  mapButton.className = 'map-button';
  mapButton.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M1 3l4-2 4 2 4-2v10l-4 2-4-2-4 2z M5 1v10 M9 3v10" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';
  mapButton.setAttribute('aria-label', 'Choose on a map');
  actionField(container, {
    label: 'Place', value: scene.place.name, action: 'Find', extra: mapButton,
    onAction: async (text, trigger) => {
      trigger.disabled = true;
      const found = await findPlace(text);
      if (found) {
        setStatus(found.name);
        setPlace({ name: text, latitude: +found.latitude.toFixed(5), longitude: +found.longitude.toFixed(5) });
      }
      trigger.disabled = false;
    }
  });
  for (const key of ['latitude', 'longitude']) {
    numberField(container, { key, value: scene.place[key], onCommit: value => setPlace({ name: '', [key]: value }) });
  }
  container.append(element('p', 'field-note', `${placeLabel(scene.place)} · level ground`));
}

const placeMap = createPlaceMap($('place-map'), $('place-overlay'), { onChange: showPlaceCoordinates });
let placeShown = '';

function showPlaceCoordinates({ latitude, longitude }) {
  $('place-coordinates').textContent = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
}

function openPlaceDialog() {
  const { place } = state.scene;
  $('place-query').value = place.name;
  placeShown = place.name;
  $('place-dialog').showModal();
  // Focus the dialog itself, so its first control is not ringed when it opens.
  $('place-dialog').focus();
  placeMap.show(place, sceneExtentMetres());
  showPlaceCoordinates(place);
}

async function findPlace(text) {
  const task = placeSearchTask.start(GROUND.terrain.placeSearchLimitSeconds * 1000);
  operation('place', `Finding ${text}`, { limitSeconds: GROUND.terrain.placeSearchLimitSeconds });
  try {
    const found = await searchPlace(text, { signal: task.signal });
    if (!task.current()) return null;
    if (!found) setStatus(`No place found for ${text}`, true);
    return found;
  } catch (error) {
    if (task.current()) setStatus(`The place search failed: ${error.message}`, true);
    return null;
  } finally {
    if (placeSearchTask.finish(task)) operation('place', null);
  }
}

async function showFoundPlace(text) {
  const found = await findPlace(text);
  if (!found) return false;
  placeMap.show(found, sceneExtentMetres());
  showPlaceCoordinates(found);
  placeShown = text;
  return true;
}

$('place-search').addEventListener('submit', event => {
  event.preventDefault();
  const text = $('place-query').value.trim();
  if (text) showFoundPlace(text);
});
$('place-overlay').addEventListener('pointerdown', () => { placeShown = $('place-query').value.trim(); });
$('place-cancel').addEventListener('click', () => { placeSearchTask.cancel(); operation('place', null); $('place-dialog').close(); });
$('place-dialog').addEventListener('close', () => { placeSearchTask.cancel(); operation('place', null); });
$('place-done').addEventListener('click', async () => {
  const text = $('place-query').value.trim();
  if (text && text !== placeShown && !(await showFoundPlace(text))) return;
  const { latitude, longitude } = placeMap.centre();
  $('place-dialog').close();
  setPlace({ name: $('place-query').value.trim(), latitude: +latitude.toFixed(5), longitude: +longitude.toFixed(5) });
});

function keepingFocus(root, rebuild) {
  const focused = document.activeElement;
  const fields = () => [...root.querySelectorAll('input, select')];
  const index = root.contains(focused) ? fields().indexOf(focused) : -1;
  rebuild();
  if (index < 0) return;
  const again = fields()[index];
  if (again && again.dataset.key === focused.dataset.key && again.type === focused.type) again.focus({ preventScroll: true });
}

/** Waits for a focused number field to blur: replacing it ends its steps, in Safari even with the focus put back. */
function refreshPanel() {
  const panel = document.querySelector('aside.panel');
  if (deferWhileEditing(panel, refreshPanel)) return;
  keepingFocus(panel, rebuildPanel);
}

function deferWhileEditing(root, again) {
  const active = document.activeElement;
  if (!(root.contains(active) && active.matches('input[type="number"]'))) return false;
  if (!active.dataset.deferred) {
    active.dataset.deferred = 'true';
    active.addEventListener('focusout', () => requestAnimationFrame(again), { once: true });
  }
  return true;
}

function rebuildPanel() {
  const { scene, selection } = state;
  const emitterList = $('emitter-list');
  emitterList.replaceChildren();
  scene.emitters.forEach(emitter => emitterCard(emitterList, emitter, selection.type === 'emitter' && selection.id === emitter.id));

  const receiverList = $('receiver-list');
  receiverList.replaceChildren();
  liveFields.receiver = null;
  liveFields.orientation = null;
  scene.receivers.forEach(receiver => receiverCard(receiverList, receiver, selection.type === 'receiver' && selection.id === receiver.id));

  const environment = $('environment-fields');
  environment.replaceChildren();
  const airField = key => numberField(environment, { key, value: scene.air[key], onCommit: value => commit(next => { next.air[key] = value; }) });
  ['temperatureCelsius', 'relativeHumidityPercent', 'pressureKpa', 'turbulenceStrength', 'turbulenceScaleMetres'].forEach(airField);
  checkboxField(environment, { label: 'Air absorption', value: scene.air.absorption, reliability: 'B', onCommit: value => commit(next => { next.air.absorption = value; }) });
  checkboxField(environment, { label: 'Scintillation', value: scene.air.scintillation, reliability: 'C', onCommit: value => commit(next => { next.air.scintillation = value; }) });
  checkboxField(environment, { label: 'Ground reflection', value: scene.ground.enabled, reliability: 'B', onCommit: value => commit(next => { next.ground.enabled = value; }) });
  selectField(environment, {
    label: 'Ground', value: scene.ground.type, reliability: 'B',
    options: GROUND_TYPES.map(type => [type, GROUND_LABELS[type]]),
    onCommit: value => commit(next => { next.ground.type = value; })
  });

  const placeFields = $('place-fields');
  placeFields.replaceChildren();
  placePanel(placeFields);
  $('cube-attribution').hidden = !state.preferences.map;
  syncZoomButtons();
  syncToggles();

  const output = $('output-fields');
  output.replaceChildren();
  selectField(output, {
    label: 'Level', value: scene.render.levelMode,
    options: [['peak', 'Peak −3 dBFS'], ['fixed', 'Fixed full scale']],
    onCommit: value => commitListening(next => { next.render.levelMode = value; })
  });
  if (scene.render.levelMode === 'fixed') {
    numberField(output, { key: 'fullScalePa', value: scene.render.fullScalePa, onCommit: value => commitListening(next => { next.render.fullScalePa = value; }) });
  }
  selectField(output, {
    label: 'Spatial', value: String(scene.render.ambisonicOrder),
    options: [['0', 'Off'], ['1', '1st order'], ['2', '2nd order'], ['3', '3rd order']],
    onCommit: value => commit(next => { next.render.ambisonicOrder = Number(value); })
  });

  const { kind, heads, omnis } = listeningKind(scene.receivers, scene.render.ambisonicOrder);
  const names = [...heads, ...omnis].map(receiver => receiver.name).join(', ');
  const kindLabel = kind === 'surround' ? `Surround ${omnis.length} ch` : LISTENING_LABELS[kind];
  $('listen-label').textContent = names ? `${kindLabel} · ${names}` : kindLabel;
  $('add-jet').disabled = scene.emitters.length >= RENDER.maximumEmitters;
  $('add-receiver').disabled = scene.receivers.length >= RENDER.maximumReceivers;
  if ($('details').open) renderDetails();
  redrawViews();
  drawResults();
  drawInfo();
}

const COMPASS = Object.freeze(['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']);

function compassLabel(degrees) {
  return `${Math.round(degrees)}° ${COMPASS[Math.round(degrees / 45) % 8]}`;
}

function bearing(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const angle = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
  return { metres: Math.hypot(dx, dy), direction: COMPASS[Math.round(angle / 45) % 8] };
}

function drawInfo() {
  drawOrientation();
  const { scene, selection } = state;
  const receiver = focusReceiver();
  const selected = findItem(selection.type, selection.id);
  const selectedInfo = $('cube-selected');
  selectedInfo.replaceChildren();
  if (selected && selection.type === 'emitter') {
    const kind = emitterKindLabel(selected);
    selectedInfo.append(element('strong', '', selected.name));
    if (kind !== selected.name || !selected.enabled) selectedInfo.append(element('span', '', kind + (selected.enabled ? '' : ' · off')));
    selectedInfo.append(element('span', '', emitterSummary(selected)));
    const { metres, direction } = bearing(receiver.positionMetres, emitterAnchor(selected));
    selectedInfo.append(element('span', '', metres < 1 ? `${receiver.name} is under its start` : `Its start is ${formatMetres(metres)} ${direction} of ${receiver.name}`));
    if (selected.startSeconds) selectedInfo.append(element('span', '', `Onset ${formatSeconds(selected.startSeconds)}`));
  } else if (selected) {
    selectedInfo.append(element('strong', '', selected.name), element('span', '', `${formatMetres(selected.positionMetres.z)} above ground`));
    const { metres, direction } = bearing({ x: 0, y: 0 }, selected.positionMetres);
    selectedInfo.append(element('span', '', metres < 1 ? 'At the origin' : `${formatMetres(metres)} ${direction} of the origin`));
  }
  const listenInfo = $('cube-listen');
  listenInfo.replaceChildren(element('strong', '', receiver.listen ? `Listening at ${receiver.name}` : `At ${receiver.name} · muted`));
  let nearest = Infinity;
  for (const item of scene.emitters) {
    if (!item.enabled || !isTrackKind(item)) continue;
    for (const path of cachedTracks(item, scene.air)) {
      path.x.forEach((x, index) => { nearest = Math.min(nearest, Math.hypot(x - receiver.positionMetres.x, path.y[index] - receiver.positionMetres.y, path.z[index] - receiver.positionMetres.z)); });
    }
  }
  if (Number.isFinite(nearest)) listenInfo.append(element('span', '', `Nearest pass ${formatMetres(nearest)}`));
  const result = state.results?.get(receiver.id);
  if (result?.samples.length) {
    listenInfo.append(element('span', '', `Sound ${formatSeconds(result.startSeconds)}–${formatSeconds(result.startSeconds + result.samples.length / result.sampleRate)}`));
    listenInfo.append(element('span', '', `Peak ${result.peakPa.toPrecision(3)} Pa · c ${result.speedOfSound.toFixed(1)} m/s`));
    const over = 20 * Math.log10(playedPeakPa() / scene.render.fullScalePa);
    if (scene.render.levelMode === 'fixed' && over > 0) {
      const severe = over >= RENDER.breakUpDecibels;
      listenInfo.append(element('span', severe ? 'warning severe' : 'warning', `Peak ${Math.max(1, Math.round(over))} dB above full scale: ${severe ? 'playback may break up' : 'clips'}`));
    }
  }
  if (scene.emitters.filter(item => item.enabled).length > 1) listenInfo.append(element('span', 'warning', 'Several emitters sound together'));
  mobile.update({ name: selected?.name ?? receiver.name, selected: selected ? selection.type : null });
}

function redrawViews() {
  views.forEach(view => view.update(state.scene, state.selection));
}

function uniqueId(prefix, items) {
  let index = items.length + 1;
  while (items.some(item => item.id === `${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

function addEmitter(create) {
  commit(scene => {
    const emitter = create(scene);
    scene.emitters.push(emitter);
    state.selection = { type: 'emitter', id: emitter.id };
  });
}

function drawResults(playheadSeconds = state.pause?.seconds ?? null, { frame = false } = {}) {
  const { receivers } = state.scene;
  const soloId = receivers.length > 1 && state.soloId && findItem('receiver', state.soloId) ? state.soloId : null;
  const traces = receivers.map((receiver, index) => ({ id: receiver.id, index, listening: receiver.listen, result: state.results?.get(receiver.id) ?? null }));
  const key = `${state.results ? state.revision : 'none'}|${soloId}|${traces.map(trace => `${trace.id}:${trace.listening}`).join(',')}`;
  drawWaveform($('waveform'), { key, traces, soloId }, playheadSeconds);
  drawArrivals($('arrivals'), { key, traces, soloId }, playheadSeconds);
  if (!frame) drawPlotTabs(soloId);
}

function drawPlotTabs(soloId) {
  const tabs = $('plot-tabs');
  const { receivers } = state.scene;
  if (receivers.length < 2) { tabs.replaceChildren(); return; }
  tabs.replaceChildren(...receivers.map(receiver => {
    const tab = button(receiver.name, () => {
      state.soloId = soloId === receiver.id ? null : receiver.id;
      drawResults();
      drawInfo();
      redrawViews();
    });
    tab.setAttribute('aria-pressed', String(soloId === receiver.id));
    tab.style.setProperty('--mic', microphoneColor(receivers.indexOf(receiver)));
    tab.classList.toggle('muted', !receiver.listen);
    return tab;
  }));
}

function animationState() {
  const clock = playbackClock();
  if (!clock) return null;
  const now = clock.sceneSeconds();
  const receivers = new Map();
  for (const [id, envelopeData] of state.envelopes) {
    receivers.set(id, envelopeData.values[Math.floor((now - envelopeData.startSeconds) / envelopeData.window)] ?? 0);
  }
  const flights = new Map();
  for (const emitter of state.scene.emitters) {
    if (!isTrackKind(emitter) || !emitter.enabled) continue;
    flights.set(emitter.id, cachedTracks(emitter, state.scene.air).flatMap(path => {
      const index = Math.round((now - path.seconds[0]) / path.step);
      return index >= 0 && index < path.seconds.length ? [{ x: path.x[index], y: path.y[index], z: path.z[index] }] : [];
    }));
  }
  return { receivers, flights };
}

views.forEach(view => view.setAnimation(animationState));

let animating = false;

function startAnimation() {
  if (animating) return;
  animating = true;
  requestAnimationFrame(animate);
}

function animate() {
  const clock = player.clock();
  redrawViews();
  drawResults(clock ? clock.sceneSeconds() : null, { frame: true });
  drawTimeline(clock && player.playing() ? clock.sceneSeconds() : null);
  if (player.playing()) requestAnimationFrame(animate);
  else { animating = false; drawStill(); }
}

function drawStill() {
  redrawViews();
  drawResults();
  drawTimeline(state.pause?.seconds ?? null);
}

function playbackClock() {
  const pause = state.pause;
  return player.clock() ?? (pause ? { skippedSeconds: pause.skippedSeconds ?? 0, sceneSeconds: () => pause.seconds } : null);
}

function drawTimeline(seconds) {
  const holder = $('cube-timeline');
  const result = state.results?.get(focusReceiver().id);
  if (seconds === null || !result) { holder.hidden = true; return; }
  holder.hidden = false;
  const end = result.startSeconds + result.samples.length / result.sampleRate;
  const share = value => `${Math.min(100, Math.max(0, value / end * 100))}%`;
  $('cube-timeline-time').textContent = `${Math.max(0, seconds).toFixed(2)} s`;
  $('cube-timeline-arrival').style.left = share(result.startSeconds);
  $('cube-timeline-progress').style.width = share(seconds);
  const seek = $('cube-timeline-seek');
  seek.max = String(end);
  seek.value = String(Math.max(0, Math.min(end, seconds)));
  seek.setAttribute('aria-valuetext', `${Math.max(0, seconds).toFixed(2)} seconds`);
}

function showPlaying() {
  syncPlayButton();
  startAnimation();
}

let resuming = null;

async function resumePlayback() {
  if (resuming) { resuming.again = true; return; }
  if (!player.playing() || !player.clock()) return;
  resuming = { again: false };
  let started = false;
  try {
    const current = listening();
    const clock = player.clock();
    if (!player.playing() || !clock) return;
    if (!current) { player.stop(); syncPlayButton(); return; }
    started = await player.play(current.composition, current.gain, {
      realDelay: state.preferences.realDelay, onEnded: syncPlayButton, atSceneSeconds: clock.sceneSeconds(), skippedSeconds: clock.skippedSeconds, continuing: true
    });
  } catch (error) {
    player.stop();
    syncPlayButton();
    setStatus(`Playback failed: ${error.message}`, true);
  } finally {
    const { again } = resuming;
    resuming = null;
    if (started) showPlaying();
    if (started && again) resumePlayback();
  }
}

/** Call it first thing in a user gesture, which the audio context needs. */
async function startPlayback() {
  const unlocked = player.unlock(state.scene.render.sampleRate);
  try {
    const current = listening();
    if (!current) { setStatus('No sound reaches the listening microphones'); return; }
    await unlocked;
    const from = state.pause;
    state.pause = null;
    const options = { realDelay: state.preferences.realDelay, onEnded: syncPlayButton };
    if (from) Object.assign(options, { atSceneSeconds: from.seconds, skippedSeconds: from.skippedSeconds });
    if (await player.play(current.composition, current.gain, options)) showPlaying();
  } catch (error) {
    player.stop();
    syncPlayButton();
    setStatus(`Playback failed: ${error.message}`, true);
  }
}

function pausePlayback() {
  const clock = player.clock();
  if (!clock || !player.playing()) return;
  state.pause = { seconds: clock.sceneSeconds(), skippedSeconds: clock.skippedSeconds };
  player.stop();
  syncPlayButton();
}

$('play').addEventListener('click', () => {
  if (player.playing()) {
    state.pause = null;
    player.stop();
    syncPlayButton();
    return;
  }
  if (!state.results) {
    if (!operations.has('render')) {
      clearTimeout(state.renderTimer);
      startRender();
    }
    return;
  }
  startPlayback();
});

$('plot-play').addEventListener('click', () => {
  if (player.playing()) pausePlayback();
  else if (state.results) startPlayback();
});

attachTimelineSeek($('cube-timeline-seek'), {
  seek(seconds) {
    if (!state.results) return;
    const skippedSeconds = player.clock()?.skippedSeconds ?? state.pause?.skippedSeconds ?? null;
    player.stop();
    state.pause = { seconds, skippedSeconds };
    syncPlayButton();
    drawStill();
  },
  play() { if (state.pause && state.results) startPlayback(); }
});

for (const canvas of [$('waveform'), $('arrivals')]) {
  canvas.addEventListener('pointerdown', event => {
    if (!state.results || event.button !== 0) return;
    const seconds = plotSeconds(canvas, event.clientX);
    if (seconds === null) return;
    const clock = player.clock();
    const skippedSeconds = clock ? clock.skippedSeconds : state.pause?.skippedSeconds ?? null;
    if (player.playing()) { player.stop(); syncPlayButton(); }
    state.pause = { seconds, skippedSeconds };
    drawStill();
    canvas.setPointerCapture(event.pointerId);
    const move = moveEvent => {
      state.pause = { seconds: plotSeconds(canvas, moveEvent.clientX, true), skippedSeconds };
      drawStill();
    };
    const release = () => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', release);
      canvas.removeEventListener('pointercancel', release);
      if (state.pause && state.results) startPlayback();
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
  });
}

function download(name, blob) {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('save').addEventListener('click', () => {
  download('rumbletect-scene.json', new Blob([serializeScene(state.scene)], { type: 'application/json' }));
});

$('open').addEventListener('click', () => $('open-file').click());
$('open-file').addEventListener('change', async () => {
  const file = $('open-file').files[0];
  $('open-file').value = '';
  if (!file) return;
  try {
    const scene = readScene(JSON.parse(await file.text()));
    placeSearchTask.cancel();
    state.scene = scene;
    state.selection = { type: 'emitter', id: scene.emitters[0]?.id ?? null };
    storeScene();
    invalidateResults();
    refreshPanel();
    requestRender();
    setStatus(`Opened ${file.name}`);
  } catch (error) {
    setStatus(`Could not open ${file.name}: ${error.message}`, true);
  }
});

const EXPORT_LABELS = Object.freeze({ scene: 'Scene (JSON)', stereo: 'Stereo', microphones: 'Microphones', ambix: 'Ambisonics' });
const formatBytes = bytes => (bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.ceil(bytes / 1024))} KB`);
let exportState = null;

function exportSelection() {
  return new Set([...document.querySelectorAll('#export-list input:checked')].map(input => input.value));
}

function updateExportSummary() {
  const { plan } = exportState;
  const selected = exportSelection();
  const sizes = exportSizes(plan, selected);
  for (const item of availableItems(plan)) $(`export-size-${item}`).textContent = formatBytes(sizes[item]);
  const count = [...selected].reduce((sum, item) => sum + itemFiles(plan, item), 0);
  const bytes = [...selected].reduce((sum, item) => sum + sizes[item], 0);
  $('export-summary').textContent = selected.size ? `${count} file${count === 1 ? '' : 's'} · ≈ ${formatBytes(bytes)}${count > 1 ? ' · ZIP' : ''}` : '';
  const aligned = selected.has('microphones') || selected.has('ambix');
  const timeline = aligned ? plan.everyone : plan.listening;
  $('export-contract').textContent = `${timeline.sampleRate / 1000} kHz · 32-bit float · full scale ${Number((1 / plan.gain).toPrecision(3)).toLocaleString('en')} Pa · from ${formatSeconds(timeline.startSeconds)} after the start`;
  $('export-submit').disabled = selected.size === 0;
}

$('export').addEventListener('click', () => {
  const current = listening();
  if (!current) return;
  const plan = exportPlan(state.scene, state.results, current.gain);
  if (!plan) return;
  exportState = { plan, composition: current.composition };
  const chosen = new Set(state.preferences.exportItems ?? ['scene', 'stereo']);
  $('export-list').replaceChildren(...availableItems(plan).map(item => {
    const row = element('label');
    const box = Object.assign(document.createElement('input'), { type: 'checkbox', value: item, checked: chosen.has(item) });
    box.addEventListener('change', updateExportSummary);
    const text = element('span');
    text.append(element('strong', '', EXPORT_LABELS[item]));
    const size = element('small');
    size.id = `export-size-${item}`;
    row.append(box, text, size);
    return row;
  }));
  $('export-name').value = state.preferences.exportName ?? 'rumbletect-jet';
  $('export-error').hidden = true;
  updateExportSummary();
  $('export-dialog').showModal();
  // Focus the dialog itself, so its first control is not ringed when it opens.
  $('export-dialog').focus();
});

$('export-all').addEventListener('click', () => {
  document.querySelectorAll('#export-list input').forEach(input => { input.checked = true; });
  updateExportSummary();
});

$('export-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (event.submitter?.value === 'cancel') { $('export-dialog').close(); return; }
  const name = $('export-name').value.trim();
  if (!name) { $('export-name').reportValidity(); return; }
  const selected = exportSelection();
  if (!selected.size) return;
  state.preferences.exportItems = [...selected];
  state.preferences.exportName = name;
  savePreferences();
  const submit = $('export-submit');
  submit.disabled = true;
  $('export-error').hidden = true;
  operation('export', 'Exporting');
  try {
    const { plan, composition } = exportState;
    const stem = fileStem(name);
    const files = await exportFiles(plan, selected, stem, ({ files: written, startSeconds, sampleRate }) => ({
      ...parseScene(state.scene),
      export: {
        listening: composition.kind,
        heads: composition.heads.map(head => ({ receiverId: head.receiverId, headingDegrees: head.headingDegrees, pitchDegrees: head.pitchDegrees })),
        omnis: composition.omnis.map(omni => omni.receiverId),
        files: written,
        ambisonics: plan.order > 0 ? AMBISONIC_CONVENTION : null,
        sampleRate,
        sampleFormat: 'ieee-float32',
        startSeconds,
        fullScalePa: 1 / plan.gain,
        peakPa: composition.peakPa,
        speedOfSoundMetresPerSecond: speedOfSoundMetresPerSecond(state.scene.air.temperatureCelsius),
        appVersion: APP_VERSION,
        modelVersion: MODEL_VERSION,
        exportedAt: new Date().toISOString()
      }
    }));
    const { name: fileName, blob } = exportDownload(files, stem);
    download(fileName, blob);
    $('export-dialog').close();
  } catch (error) {
    $('export-error').textContent = error instanceof Error ? error.message : String(error);
    $('export-error').hidden = false;
  } finally {
    submit.disabled = false;
    operation('export', null);
  }
});

$('details-close').addEventListener('click', () => $('details').close());
$('details').addEventListener('close', () => { state.detailsId = null; });

const TOGGLES = Object.freeze({
  'auto-render': {
    read: () => state.preferences.autoRender,
    write: on => { state.preferences.autoRender = on; },
    after: () => { if (state.preferences.autoRender && !state.results && !operations.has('render')) startRender(); }
  },
  'real-delay': { read: () => state.preferences.realDelay, write: on => { state.preferences.realDelay = on; } },
  map: {
    read: () => state.preferences.map,
    write: on => { state.preferences.map = on; },
    after: () => {
      if (!state.preferences.map) mapLayer.clear();
      $('cube-attribution').hidden = !state.preferences.map;
      syncZoomButtons(); redrawViews();
    }
  }
});

function syncToggles() {
  for (const [id, { read }] of Object.entries(TOGGLES)) $(id).setAttribute('aria-pressed', String(Boolean(read())));
}

for (const [id, { read, write, after }] of Object.entries(TOGGLES)) {
  $(id).addEventListener('click', () => {
    write(!read());
    savePreferences();
    syncToggles();
    after?.();
  });
}
syncToggles();

const ZOOM_STEP = 1.5;
function syncZoomButtons() {
  const shown = Boolean(state.preferences.map);
  $('zoom-in').hidden = !shown;
  $('zoom-out').hidden = !shown;
}
$('zoom-in').addEventListener('click', () => views[0].zoomBy(ZOOM_STEP));
$('zoom-out').addEventListener('click', () => views[0].zoomBy(1 / ZOOM_STEP));
syncZoomButtons();
$('attribution-button').addEventListener('click', () => {
  const open = $('attribution-text').hidden;
  $('attribution-text').hidden = !open;
  $('attribution-button').setAttribute('aria-expanded', String(open));
});
$('add-jet').addEventListener('click', () => addEmitter(scene => defaultJet(uniqueId('jet', scene.emitters), `Jet ${scene.emitters.length + 1}`, newSeed())));
$('add-receiver').addEventListener('click', () => commit(scene => {
  const receiver = defaultReceiver(uniqueId('receiver', scene.receivers), `Mic ${scene.receivers.length + 1}`);
  receiver.positionMetres = { ...receiver.positionMetres, x: receiver.positionMetres.x + 500 * scene.receivers.length };
  const source = scene.emitters.find(emitter => emitter.enabled) ?? scene.emitters[0];
  if (source) receiver.headingDegrees = headingToward(receiver.positionMetres, emitterAnchor(source));
  scene.receivers.push(receiver);
  select({ type: 'receiver', id: receiver.id });
}));

window.addEventListener('resize', () => drawResults());

window.addEventListener('pagehide', () => renderMarker.suspend());
window.addEventListener('pageshow', event => { if (event.persisted && operations.has('render')) renderMarker.restore(); });

refreshPanel();
// Not rendered again by itself: that would stop the page again.
if (unfinishedRender) {
  setStatus(unfinishedRenderText(unfinishedRender), true);
  syncPlayButton();
} else if (state.preferences.autoRender) startRender();
else syncPlayButton();
