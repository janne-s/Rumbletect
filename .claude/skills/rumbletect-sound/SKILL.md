---
name: rumbletect-sound
description: Make a sound with Rumbletect from a request in words, such as "a landing airliner over a lake at dusk, dark and long" — jets, airliners, formations, rockets, salvos, and volcanic eruption jets, heard from a place you describe. Writes a scene, renders it in Node, checks the result by its measurements, and hands over the WAV and the scene.
---

# Make a sound with Rumbletect

Rumbletect is a creative sound tool, not a measurement: levels are uncalibrated model values, and a result is a plausible sound. You cannot listen, so you steer by the measurements the renderer prints, and the person listens.

## Steps

1. **Read the table first.** README.md, section "Rendering from a script or an agent", maps changes to what they do to the sound. Translate the request's timbre words with it before choosing anything else: "dark", "deep", "buzzing" or "thin", "whining", "bright" decide the engine class as much as the source does.
2. **Start from the nearest file in `examples/`.** Copy it to the output folder and change only what the request names: source kind and class, path (start, heading, climb, speed, duration), place (ground type, forest, surroundings), air (temperature, humidity, wind, ground layer), and the microphone. A partial scene is enough; missing fields take their defaults. `src/domain/scene.js` lists every parameter with its range; app macros are not scene fields.
3. **Render:** `node tools/render.mjs <scene.json> <folder>`. Each render takes seconds to a minute or two. Add `--ambix` only when spatial audio is asked for.
4. **Check against the request** with the JSON on stdout:
   - dark or bright: `spectralCentroidHz` and how far the 2000 Hz and 4000 Hz octaves lie below the loudest band;
   - long or short: `withinFortyDecibelsSeconds`;
   - near or far, loud or soft: `loudestDecibelsAFast`. `peakDecibelsSpl` follows the lowest bands and infrasound, so compare loudness in dB(A).

   If a word is clearly missed, change one thing and render again. Stop after two or three renders: the person's ear decides, not the numbers.
5. **Hand over** the WAV and the filled `scene.json` (it opens in the app for listening and further changes), say what you chose and why in a few lines, and name the next knob if the sound is not yet right.

## Notes

- **A real place:** put its GPS coordinates in `place` and `"terrain": { "enabled": true }` in the scene, and the render loads the terrain. Ask for coordinates rather than sending an address or a home to a search service unasked. README "Place and terrain".
- **Boom and engine together** (a supersonic jet, a rocket launch with its booms): follow README "Boomtect and Rumbletect in one scene" with Boomtect cloned beside this repository, and hand over the mix and each part.
- The file starts at the first arriving sound, so a pass is earlier in the file than in the scene's time.
- **A collection whose levels compare** (a series growing louder, takes to cut together): each file is otherwise scaled to its own peak, which hides the differences. Render the loudest scene first, then set `"render": { "levelMode": "fixed", "fullScalePa": <its fullScalePa> }` in every scene. Run several renders at once; each uses one core.
- The same scene and seed give the same sound; a new `seed` gives another take.
- Over water or rigid ground a passing source sweeps through a phasing comb; that is the reflection, not a fault.
- For booms, blasts, and thunder use Boomtect, which has the same command.
