# Rumbletect: Design the rumble

Rumbletect designs the continuous sound of jets, rockets, and eruptions from their physics. Plan a
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
- **Wavefront and Mach cone** — Show propagation geometry at a readable level,
  independent of source power. Emissions along each path form one outer boundary,
  joining the initial front to supersonic propagation; interior cone lines are hidden.
  The volcano's front starts at its modeled acoustic source above the vent.

## Jet

- **Category** — Hobby turbine, jet drone, cruise missile, fighter, or heavy
  bomber: changes the engine and its count; the flight stays as set.
- **Power** — Idle to full power, for a fighter through military power to
  full afterburner.
- **Mach, height, heading** — Where and how fast it flies.
- **Bend, turn starts** — Straight, then turning by the bend from a point
  along the flight; rings on the path mark the turn. Climb, acceleration,
  turn length, and flight time in the details.
- **Formation** — Its own kind: aircraft flying a V behind the leader, each
  with its own seed; Spacing sets how far apart, the trail in its details.
- **Turbomachinery** — A small turbine's blade-passing whine rising with
  power, and a turbofan's fan hump.
- **Details** — Start point, onset, seed, engine count, the engine's nozzle pressure
  ratio, jet temperature, and nozzle diameter, and the formation's lateral
  and trail spacing.

## Airliner

- **Category** — Business jet, regional jet, narrowbody, widebody, or
  four-engine airliner: changes the engines; the flight stays as set.
- **Power, Mach, height, heading, bend, turn starts** — As for a jet.
- **Source** — A turbofan as two jets, a fast core and a slower fan stream,
  with the fan's blade-passing tones and broadband hump, and at take-off
  power the buzz-saw: tones at every order of the shaft as the fan tips pass
  the speed of sound.

## Rocket

- **Category** — Hobby, 122 mm artillery, heavy artillery, sounding, small,
  medium, and heavy launchers, and super-heavy: changes the engine, its
  propellant, and nozzle; the flight stays as set.
- **Size** — Total thrust from a 10 N hobby motor to a 100 MN super-heavy
  launcher; the nozzle and water on the pad follow.
- **Heading, launch angle, bend, turn starts** — The path, set rather than
  simulated: straight along the launch angle, or turning by the bend from a
  point along it, down toward level flight or, negative, lofting up as ATACMS
  does after leaving its rail; marks on the path show the turn and where the rocket passes
  the speed of sound of the air at its height.
- **Top speed** — The speed at burnout. The flight ends at burnout or where
  it comes down to the ground; sound already sent travels on. Burn time, how
  late the speed builds, and the turn's length in the details.
- **Salvo** — Its own kind, by default a 122 mm launcher's 40 rounds in 20 s:
  a multiple launcher's rounds, each the same
  rocket with its own seed, launch time, launcher, heading, angle, and thrust;
  rounds per salvo, spread, launcher radius, and spreads in its details.
- **Details** — The flight, and what the category sets: propellant (a faster
  exhaust sounds higher; liquid engines are held on the pad for three
  seconds), engine count, thrust, exhaust velocity, nozzle diameter, acoustic
  efficiency, and water on the pad.
- **Source** — Sound power from thrust and exhaust velocity, with the
  spectrum and directivity of BYU's SATURN model, a single nozzle's peaking
  about an octave higher than a cluster's, as measured; low frequencies radiate
  toward the plume and start once the plume has left the pad; the plume
  crackles.

## Volcano

- **Category** — Strombolian, lava fountain, sub-Plinian, or Plinian
  eruption: sets the vent, its exit velocity, gas temperature, and pulsing.
- **Intensity, duration, pulsing, pulse period, rise, fade** — The
  eruption's strength and its course in time.
- **Bursts** — From a steady swell to Strombolian bursts: a background roar
  broken every pulse period or so by a burst that rises in tenths of a
  second, as at Mount Yasur.
- **Source** — The roar of a hot jet rising from the vent, as volcano
  infrasound studies model it, and the vent's smaller jets, which carry the
  audible roar.

## Infrasound

- **Low band** — Every source reaches down to about 1.5 Hz: long grains
  carry what lies below 20 Hz, short grains the rest, so a rocket's or an
  eruption's rumble is in the exported files even where speakers cannot
  play it.

## Air and ground

- **Air absorption** — ISO 9613-1 at the frequency that arrives.
- **Scintillation** — The slow swirl of level that turbulence brings.
- **Ground reflection** — Over snow, forest floor, grass, soil, stony ground,
  water, or rigid ground, with its coherence lost to roughness and turbulence.

## Output

- **Space** — Runs the main Render / Play / Stop action outside controls and dialogs.
- **Length** — Up to 400 s from the first arrival; later sound is left out
  and the render says so.
- **Level** — Peak at −3 dBFS or a fixed full scale in pascals.
- **Spatial** — Ambisonics up to third order, heard binaurally.
- **Export** — The scene, a stereo mix, one file per microphone, and AmbiX.

## Model

| Part | Source | Class |
| --- | --- | --- |
| Mixing noise spectra | Tam, Golebiowski & Seiner 1996 | B |
| Mixing noise level with size | Khavaran & Bridges 2009, fitted | B |
| Peak frequencies | full-scale F-35AA and F-22A, Gee, Neilsen & Wall 2013 | B, fitted C |
| Directivity | Tam 1996 figs. 6–7 | B |
| Flight effects | Stone, Krejsa & Clark 2003 | B, combined C |
| Skewness, intermittency | Gee et al. 2013; fitted to recordings | B, C |
| Engine settings | from published thrust and mass flow; a heavy bomber's turbofans as one mixed jet | C |
| Turbomachinery tones and fan hump | fitted to model-turbine and B-52 recordings | C |
| Crackle | simple-wave steepening of each grain, set by the jet's convection Mach number | C |
| Rocket source | SATURN, Mathews 2025 | B |
| Ascent, sizing, salvo | assumed | C |
| Eruption jet | Tam's spectra as fitted to volcano infrasound (Matoza et al., Gestrich et al. 2021); vents and velocities assumed | B, C |
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
