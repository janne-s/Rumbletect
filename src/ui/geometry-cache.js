import { formationJets, jetPath } from '../domain/grains.js';
import { ascentPath } from '../domain/rocket.js';
import { salvoRounds } from '../domain/salvo.js';
import { ventPath } from '../domain/volcano.js';
import { cached } from '../shared/ui/geometry-cache.js';

export { currentSurface, useTerrain } from '../shared/ui/geometry-cache.js';

const tracks = new Map();

export const cachedTracks = (emitter, scene) => (emitter.kind === 'volcano'
  ? cached(tracks, emitter, [], () => [ventPath(emitter)])
  : emitter.kind === 'rocket'
  ? cached(tracks, emitter, [], () => salvoRounds(emitter).map(ascentPath))
  : cached(tracks, emitter, [scene.air, emitter.autoDuration ? scene.receivers.map(receiver => receiver.positionMetres) : null], () => formationJets(emitter).map(member => jetPath(member, scene))));
