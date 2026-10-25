import { createHash } from 'node:crypto';
import { diffuseTails } from '../src/shared/domain/forest.js';
import {
  addTails, arrivalTable, assemblePaths, finishSum, frameExtents, partitionSeconds, pathRange, prepareScene, previewScene,
  receiverResult, renderReceiver, renderReceiverRange, sumSegments, tailResponses, tailSamples, tailStretches, tracePart
} from '../src/domain/render.js';
import { defaultAirliner, defaultFormation, defaultJet, defaultRocket, defaultSalvo, defaultScene, defaultVolcano, parseScene } from '../src/domain/scene.js';
import { defaultReceiver } from '../src/shared/domain/scene.js';
import { syntheticTerrain } from './terrain-fixture.js';

const forestedScene = mode => { const base = defaultScene(mode); return { ...base, ground: { ...base.ground, forest: true } }; };

// Adopted from Boomtect `App/test/reference-scenes.js` at b8b844a; short versions of each kind's default.
const flight = seconds => ({ startMetres: { x: -900, y: 0, z: 300 }, durationSeconds: seconds });
const ascent = seconds => ({ ...defaultRocket().ascent, burnSeconds: seconds, throttleDownSeconds: seconds / 3, throttleUpSeconds: 2 * seconds / 3 });
const eruption = seconds => ({ ...defaultVolcano().eruption, eruptionSeconds: seconds, riseSeconds: seconds / 5, fadeSeconds: seconds / 3 });

// Adopted from Boomtect `App/test/reference-scenes.js` at b8b844a; short versions of each kind's default, shorter still over terrain.
const EMITTERS = Object.freeze({
  jet: ['jet', seconds => ({ ...defaultJet(), ...flight(seconds) }), [8, 3], { rich: true }],
  airliner: ['jet', seconds => ({ ...defaultAirliner(), ...flight(seconds), gearAndFlaps: true }), [8, 3]],
  formation: ['jet', seconds => ({ ...defaultFormation(), ...flight(seconds), memberCount: 2 }), [6, 3]],
  rocket: ['rocket', seconds => ({ ...defaultRocket(), ascent: ascent(seconds) }), [12, 4]],
  salvo: ['rocket', seconds => ({ ...defaultSalvo(), roundCount: 4, salvoSeconds: seconds }), [3, 3]],
  volcano: ['volcano', seconds => ({ ...defaultVolcano(), eruption: eruption(seconds) }), [10, 5]]
});

const hill = (x, y) => 120 + 80 * Math.exp(-((x - 700) ** 2 + (y - 300) ** 2) / 500 ** 2);

const GROUP_OF = Object.freeze({ jet: 'jet', airliner: 'aircraft', formation: 'aircraft', rocket: 'rocket', salvo: 'rocket', volcano: 'volcano' });

const flatScene = (mode, emitter) => parseScene({ ...forestedScene(mode), emitters: [emitter] });

function terrainScene(mode, emitter, { rich = false } = {}) {
  const base = forestedScene(mode);
  const second = { ...defaultReceiver('receiver-2', 'Mic 2'), positionMetres: { ...base.receivers[0].positionMetres, x: base.receivers[0].positionMetres.x - 600, y: base.receivers[0].positionMetres.y + 900 }, headingDegrees: 120 };
  return parseScene({
    ...base,
    air: { ...base.air, windSpeedMetresPerSecond: 6, windShearPerSecond: .004, groundLayerMetres: 300 },
    ground: { ...base.ground, type: 'soil' },
    terrain: syntheticTerrain(hill, { echoCellMetres: 400 }),
    emitters: [emitter],
    receivers: rich ? [...base.receivers, second] : base.receivers,
    render: { ...base.render, ambisonicOrder: rich ? 2 : 1, quality: { ...base.render.quality, sharedScatter: true, coarseForest: true } }
  });
}

export const REFERENCE_CASES = Object.freeze(Object.entries(EMITTERS).flatMap(([name, [mode, emitter, [flat, overTerrain], options]]) => [
  { name: `${name}-flat`, group: GROUP_OF[name], mode, pipeline: 'whole', scene: () => flatScene(mode, emitter(flat)) },
  { name: `${name}-terrain`, group: GROUP_OF[name], mode, pipeline: 'parts', scene: () => terrainScene(mode, emitter(overTerrain), options) }
]).concat(['jet', 'rocket', 'volcano'].map(mode => ({
  name: `${mode}-preview`, group: mode, mode, pipeline: 'parts', scene: () => previewScene(flatScene(mode, EMITTERS[mode][1](EMITTERS[mode][2][0])))
}))));

function renderWhole(scene) {
  const prepared = prepareScene(scene);
  return scene.receivers.map(receiver => renderReceiver(prepared, receiver, scene));
}

function renderInParts(scene, parts = 2) {
  const prepared = prepareScene(scene);
  return scene.receivers.map(receiver => {
    const traced = Array.from({ length: parts }, (_, part) => tracePart(prepareScene(scene), receiver, scene, { part, parts }));
    const paths = assemblePaths(prepared, receiver, scene, traced);
    const arrivals = arrivalTable(prepared, receiver, scene, { paths });
    const extents = frameExtents(prepared, paths);
    const boundaries = partitionSeconds(null, scene, parts, [arrivals]);
    const segments = Array.from({ length: parts }, (_, part) => renderReceiverRange(prepareScene(scene), receiver, scene, {
      fromSeconds: boundaries[part], toSeconds: boundaries[part + 1], paths: pathRange(paths, boundaries[part], boundaries[part + 1]), extents
    }));
    const responses = tailResponses(receiver, scene);
    const sum = sumSegments(segments, scene.render.sampleRate, tailSamples(responses));
    const length = responses ? sum.channels[0].length - tailSamples(responses) : 0;
    if (length > 0) {
      for (const [from, to] of tailStretches(length, parts, tailSamples(responses))) {
        addTails(sum, from, diffuseTails(sum.channels[0].slice(from, to), responses, sum.channels.length));
      }
    }
    const nonlinearPaths = segments.reduce((total, segment) => total + segment.nonlinearPaths, 0);
    return receiverResult(receiver, scene, finishSum(sum, scene.render.sampleRate), arrivals, nonlinearPaths);
  });
}

export function renderCase(item) {
  const scene = item.scene();
  return item.pipeline === 'whole' ? renderWhole(scene) : renderInParts(scene);
}

const bytes = array => new Uint8Array(array.buffer, array.byteOffset, array.byteLength);

export function digest(results) {
  const hash = createHash('sha256');
  for (const result of results) {
    hash.update(JSON.stringify([result.receiverId, result.startSeconds, result.peakPa, result.nonlinearPaths, result.channels.length, result.arrivals.count]));
    for (const channel of result.channels) hash.update(bytes(channel));
    for (const [key, value] of Object.entries(result.arrivals).sort(([a], [b]) => a.localeCompare(b))) {
      if (ArrayBuffer.isView(value)) { hash.update(key); hash.update(bytes(value)); }
    }
  }
  return hash.digest('hex');
}

export const REFERENCE_FILE = new URL('./fixtures/reference-renders.json', import.meta.url);
