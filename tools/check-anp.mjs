// Checks each airliner class against the ANP database's NPD rows, as in Doc/reviews/2026-10-21-airliner-reference.md.
// node tools/check-anp.mjs <ANP folder> [class[=ANP aircraft] ...] [--spectra]
// The ANP tables are downloaded from EASA (https://www.easa.europa.eu/en/downloads/138164/en) and stay out of the repository.
// For each LAmax row of the class's aircraft: a level pass at Mach 0.24 (160 kt), 1 000 ft above an omni at 1.2 m over grass,
// 25 °C and 70 %, at the power whose thrust per engine equals the row's, approach rows with gear and flaps out as ANP
// measured them; LAmax is the largest 1 s A-weighted level.
// --spectra also prints the third-octave spectrum of that second against the ANP spectral class, both re 70 dB at 1 kHz.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENGINE } from '../src/domain/constants.js';
import { AIRLINER_CLASSES, engineAtPower, thrustNewtons } from '../src/domain/engine.js';
import { defaultAirliner, defaultScene, parseScene } from '../src/domain/scene.js';
import { prepareScene, renderReceiver } from '../src/domain/render.js';
import { THIRDS, aWeightedSum, bandPowers, decibels, windowPower } from './bands.mjs';

const ANP_AIRCRAFT = { business: 'CNA525C', regional: 'CRJ9-ER', narrowbody: 'A320-211', widebody: '7773ER', quad: '747400' };
const NEWTONS_PER_POUND = 4.448222;
const METRES_PER_FOOT = .3048;
const NPD_MACH = .24;
const NPD_HEIGHT_FEET = 1000;
const MICROPHONE_HEIGHT_METRES = 1.2;
const PASS_START_METRES = 4000;
const PASS_SECONDS = 100;
const REFERENCE_PA2 = 4e-10;
const SPECTRUM_REFERENCE_DECIBELS = 70;

const args = process.argv.slice(2);
const [folder, ...rest] = args.filter(arg => arg !== '--spectra');
const spectra = args.includes('--spectra');
const table = suffix => {
  const file = readdirSync(folder).find(name => name.endsWith(suffix));
  if (!file) throw new Error(`No *${suffix} in ${folder}.`);
  const [header, ...lines] = readFileSync(join(folder, file), 'utf8').split(/\r?\n/).filter(Boolean).map(line => line.split(';').map(cell => cell.trim()));
  return lines.map(cells => Object.fromEntries(header.map((key, index) => [key, cells[index]])));
};
const aircraft = table('_Aircraft.csv');
const npd = table('_NPD_data.csv');
const spectralClasses = spectra ? table('_Spectral_classes.csv') : [];

const requests = (rest.length ? rest : AIRLINER_CLASSES).map(arg => {
  const [engineClass, id] = arg.split('=');
  if (!AIRLINER_CLASSES.includes(engineClass)) throw new Error(`${engineClass} is not an airliner class (${AIRLINER_CLASSES.join(', ')}).`);
  return { engineClass, id: id ?? ANP_AIRCRAFT[engineClass] };
});

function powerForThrust(engineClass, newtons) {
  let [low, high] = [0, 1];
  for (let step = 0; step < 40; step += 1) { const middle = (low + high) / 2; if (thrustNewtons(middle, engineClass) < newtons) low = middle; else high = middle; }
  return (low + high) / 2;
}

function levelPass(engineClass, power, gearAndFlaps) {
  const base = defaultScene();
  const airliner = { ...defaultAirliner(), engineClass, engine: { ...engineAtPower(power, engineClass), engines: ENGINE.classes[engineClass].engines }, gearAndFlaps, mach: NPD_MACH, climbDegrees: 0, startMetres: { x: -PASS_START_METRES, y: 0, z: NPD_HEIGHT_FEET * METRES_PER_FOOT }, durationSeconds: PASS_SECONDS };
  const scene = parseScene({
    ...base,
    air: { ...base.air, refraction: false, temperatureCelsius: 25, relativeHumidityPercent: 70 },
    ground: { ...base.ground, type: 'grass', forest: false, surroundings: false },
    emitters: [airliner],
    receivers: [{ ...base.receivers[0], type: 'omni', positionMetres: { x: 0, y: 0, z: MICROPHONE_HEIGHT_METRES } }],
    render: { ...base.render, ambisonicOrder: 0 }
  });
  return renderReceiver(prepareScene(scene), scene.receivers[0], scene);
}

function loudestSecond({ samples, sampleRate }) {
  const size = 65536;
  let best = { level: -Infinity, power: null, sampleRate };
  for (let start = 0; start + sampleRate <= samples.length; start += sampleRate / 4) {
    const power = windowPower(samples, start, sampleRate, size);
    const level = decibels(aWeightedSum(power, sampleRate) / REFERENCE_PA2);
    if (level > best.level) best = { level, power, sampleRate };
  }
  return best;
}

const thirdsRelative = (levels, at1k) => levels.map(value => value - at1k + SPECTRUM_REFERENCE_DECIBELS);
const thirdName = centre => (centre >= 1000 ? `${centre / 1000}k` : String(centre)).padStart(5);

for (const { engineClass, id } of requests) {
  const plane = aircraft.find(row => row.ACFT_ID === id);
  if (!plane) throw new Error(`ANP has no aircraft ${id}.`);
  if (!/lb/.test(plane['Power Parameter'])) throw new Error(`${id}'s NPD power is ${plane['Power Parameter']}, not thrust in pounds.`);
  const rows = npd.filter(row => row.NPD_ID === plane.NPD_ID && row['Noise Metric'] === 'LAmax');
  const engines = ENGINE.classes[engineClass].engines;
  console.log(`${engineClass}: ANP ${id} (${plane.Description}), NPD ${plane.NPD_ID}, ${engines} engines`);
  for (const row of rows) {
    const pounds = Number(row['Power Setting']);
    const anp = Number(row[`L_${NPD_HEIGHT_FEET}ft`]);
    const power = powerForThrust(engineClass, pounds * NEWTONS_PER_POUND);
    const reached = thrustNewtons(power, engineClass) / NEWTONS_PER_POUND;
    const { level, power: spectrum, sampleRate } = loudestSecond(levelPass(engineClass, power, row['Op Mode'] === 'A'));
    const clipped = Math.abs(reached - pounds) > 1 ? ` (thrust reaches only ${Math.round(reached)} lb)` : '';
    const mode = row['Op Mode'] === 'A' ? 'approach ' : 'departure';
    console.log(`  ${mode} ${String(pounds).padStart(7)} lb  power ${power.toFixed(3)}  LAmax ${level.toFixed(1)}  ANP ${anp.toFixed(1)}  diff ${(level - anp >= 0 ? '+' : '') + (level - anp).toFixed(1)}${clipped}`);
    if (!spectra) continue;
    const classId = plane[row['Op Mode'] === 'A' ? 'Approach Spectral Class ID' : 'Departure Spectral Class ID'];
    const reference = spectralClasses.find(entry => entry['Spectral Class ID'] === classId);
    const model = bandPowers(spectrum, sampleRate, THIRDS, 3).map(value => decibels(value / REFERENCE_PA2));
    const modelRelative = thirdsRelative(model, model[THIRDS.indexOf(1000)]);
    console.log(`    ${'Hz'.padEnd(10)}${THIRDS.map(thirdName).join('')}`);
    console.log(`    ${'model'.padEnd(10)}${modelRelative.map(value => value.toFixed(0).padStart(5)).join('')}`);
    if (reference) {
      const anpLevels = THIRDS.map(centre => Number(reference[`L_${centre}Hz`]));
      console.log(`    ${`ANP ${classId}`.padEnd(10)}${anpLevels.map(value => value.toFixed(0).padStart(5)).join('')}`);
      console.log(`    ${'diff'.padEnd(10)}${modelRelative.map((value, index) => (value - anpLevels[index]).toFixed(0).padStart(5)).join('')}`);
    }
  }
}
