import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { readScene, serializeScene } from '../src/domain/scene.js';

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const KINDS = { jet: ['jet', 'formation', 'airliner'], rocket: ['rocket', 'salvo'], volcano: ['volcano', 'volcano'] };

test('every mode saved by version 1 reads back whole and keeps every kind of its emitters', () => {
  for (const [mode, kinds] of Object.entries(KINDS)) {
    const saved = fixture(`scene-v1-${mode}`);
    const scene = readScene(saved);
    assert.equal(scene.mode, mode);
    assert.deepEqual(scene.emitters.map(emitter => emitter.kind), kinds);
    assert.deepEqual(readScene(JSON.parse(serializeScene(scene))), scene);
  }
});

test('a version 1 document reads the same under any recorded version', () => {
  for (const mode of Object.keys(KINDS)) {
    const saved = fixture(`scene-v1-${mode}`);
    for (const version of [0, 2, 99]) assert.deepEqual(readScene({ ...saved, version }), readScene(saved));
  }
});
