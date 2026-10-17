# Rumbletect: Design the rumble

Rumbletect designs the continuous sound of jets from their physics. Plan a
flight in 3D, set the engine's power, place microphones, and hear the flyover:
its roar, its rumble from behind, the ground's comb, and the air's swirl. Listen
in mono, as a spaced stereo pair, or binaurally on headphones, and export WAV or
Ambisonics. Made for sound design, built on physics.

See it live: [**https://janne-s.github.io/Rumbletect/**](https://janne-s.github.io/Rumbletect/)

## How it works

A jet's mixing noise has two parts: the large structures that roar aft and the
fine-scale turbulence heard to the side and ahead. Each has its own spectrum and
directivity. Rumbletect synthesizes them as noise toward each microphone along
the flight, then delays, spreads, and filters that sound on its way there.

## Scene

- **Box** — The floor is the ground and the two far walls show the scene from
  the side. The cross on the floor is the origin.
- **Points and shadows** — Drag a point to move it horizontally, or its shadow
  on a wall to move it in that wall's plane. A flight's second point sets its
  heading.
- **Map** — A map of the place as the floor, with zoom.

## Jet

- **Power** — Idle through military power to full afterburner.
- **Mach, height, heading, climb, acceleration, turn, flight time** — The
  flight, subsonic.
- **Details** — Start point, onset, seed, and the engine's nozzle pressure
  ratio, jet temperature, and nozzle diameter.

## Rocket

- **Falcon 9 and Starship** — Launch from the pad: ignition, three seconds
  held down, liftoff, pitch kick, and a gravity turn to engine cut-off.
- **Heading, throttle, burn time, pitch kick, efficiency** — The ascent and
  how much of the plume's power becomes sound.
- **Details** — Engines, thrust, exhaust velocity, nozzle diameter, mass,
  throttle-down around max-Q, and water on the pad.
- **Source** — Sound power from thrust and exhaust velocity, with the
  spectrum and directivity of BYU's SATURN model; low frequencies radiate
  toward the plume and start once the plume has left the pad.

## Air and ground

- **Air absorption** — ISO 9613-1 at the frequency that arrives.
- **Scintillation** — The slow swirl of level that turbulence brings.
- **Ground reflection** — Over snow, forest floor, grass, soil, stony ground,
  water, or rigid ground, with its coherence lost to roughness and turbulence.

## Output

- **Level** — Peak at −3 dBFS or a fixed full scale in pascals.
- **Spatial** — Ambisonics up to third order, heard binaurally.
- **Export** — The scene, a stereo mix, one file per microphone, and AmbiX.

## Model

| Part | Source | Class |
| --- | --- | --- |
| Mixing noise spectra | Tam, Golebiowski & Seiner 1996 | B |
| Peak frequencies | full-scale F-35AA and F-22A, Gee, Neilsen & Wall 2013 | B, fitted C |
| Directivity | Tam 1996 figs. 6–7 | B |
| Flight effects | Stone, Krejsa & Clark 2003 | B, combined C |
| Skewness, intermittency | Gee et al. 2013; fitted to recordings | B, C |
| Engine settings | assumed for a single-engine fighter | C |
| Jet velocity | ideal nozzle | A |
| Air absorption | ISO 9613-1 | B |
| Ground reflection | Delany–Bazley, Weyl–Van der Pol | B |
| Turbulence coherence | Clifford & Lataitis | B |
| Scintillation | fitted to recordings | C |

Not modelled: shock-cell noise and screech, afterburner combustion noise, fan
and core noise, supersonic flight, terrain, forest, refraction by wind and
temperature. Rumbletect is a creative tool: its results are plausible, not
measured, and levels are uncalibrated model values in pascals.

## License

MIT
