import { prepareScene as prepareWith } from '../shared/domain/render.js';
import { SOURCE_KINDS, withLowBands } from './sources.js';

export * from '../shared/domain/render.js';

export const prepareScene = scene => prepareWith({ ...scene, emitters: withLowBands(scene.emitters) }, SOURCE_KINDS);
