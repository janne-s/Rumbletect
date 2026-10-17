import { jetPath } from '../domain/grains.js';
import { ascentPath } from '../domain/rocket.js';
import { cached } from '../shared/ui/geometry-cache.js';

export { currentSurface, useTerrain } from '../shared/ui/geometry-cache.js';

const tracks = new Map();

export const cachedTracks = (emitter, scene) => (emitter.kind === 'rocket'
  ? cached(tracks, emitter, [], () => [ascentPath(emitter)])
  : cached(tracks, emitter, [scene.air, emitter.autoDuration ? scene.receivers.map(receiver => receiver.positionMetres) : null], () => [jetPath(emitter, scene)]));
