import assert from 'node:assert/strict';
import test from 'node:test';
import { ADD_EMITTERS } from '../src/ui/kinds.js';
import { defaultScene, parseScene } from '../src/domain/scene.js';

test('every kind is added as the add menu adds it, with its id, name and seed', () => {
  for (const [prefix, { create, mode }] of Object.entries(ADD_EMITTERS)) {
    const scene = defaultScene(mode);
    const emitter = create(`${prefix}-2`, 'Added 2', 123456789);
    assert.equal(emitter.id, `${prefix}-2`);
    assert.equal(emitter.name, 'Added 2');
    assert.equal(emitter.seed, 123456789);
    assert.doesNotThrow(() => parseScene({ ...scene, emitters: [...scene.emitters, emitter] }), prefix);
  }
});
