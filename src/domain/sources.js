import { jetGrains } from './grains.js';
import { rocketGrains } from './rocket-grains.js';

export const SOURCE_KINDS = Object.freeze({
  jet: { sources: jetGrains },
  rocket: { sources: rocketGrains }
});
