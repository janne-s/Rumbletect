import test from 'node:test';
import assert from 'node:assert/strict';
import { macrosFor, parseEntry } from '../src/ui/macros.js';
import { defaultJet, parseScene, defaultScene } from '../src/domain/scene.js';

test('every macro writes values the scene accepts, across its whole slider', () => {
  for (const macro of macrosFor(defaultJet(), { onset: true })) {
    for (const t of [0, .25, .5, .75, 1]) {
      const scene = defaultScene();
      macro.write(scene.emitters[0], t);
      assert.doesNotThrow(() => parseScene(scene), macro.label);
      const difference = Math.abs(macro.read(scene.emitters[0]) - t);
      const circular = macro.label === 'Heading' ? Math.min(difference, 1 - difference) : difference;
      assert.ok(circular < .02, `${macro.label} at ${t}: ${macro.read(scene.emitters[0])}`);
    }
  }
});

test('a typed height takes metres or kilometres', () => {
  const height = macrosFor(defaultJet()).find(macro => macro.label === 'Height');
  assert.equal(parseEntry(height.entry, '1,5 km', defaultJet()), 1500);
  assert.equal(parseEntry(height.entry, '250', defaultJet()), 250);
  assert.throws(() => parseEntry(height.entry, '3 ft', defaultJet()));
});
