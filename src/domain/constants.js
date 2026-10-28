export * from '../shared/domain/constants.js';

export const APP_VERSION = '0.1.2';

export const MODEL_VERSION = '0.2.0';

/** Marks on a drawn path: a tick where it reaches the speed of sound, rings where a rocket's turn starts and ends. */
export const TRACK_MARKS = Object.freeze({ barrierPixels: 4, turnRadius: 3 });

export const JET = Object.freeze({
  /** Class B: Tam, Golebiowski & Seiner 1996, eqs. 2 and 7–10, dB per 1 Hz scaled to r = D_j (their figures plot 100 D_j, 40 dB lower); M_j 1.37–2.0, T_r/T∞ 0.98–4.89. */
  large: Object.freeze({
    base: 75,
    temperature: 46,
    temperatureExponent: .3,
    velocityExponent: Object.freeze([10.06, -.495]),
    referenceAngleDegrees: 160
  }),
  fine: Object.freeze({
    base: 83.2,
    temperature: 19.3,
    temperatureExponent: .62,
    velocityExponent: Object.freeze([6.4, 1.2, 1.4]),
    referenceAngleDegrees: 90
  }),
  /** Class B: Tam 1996 fig. 6 (M_j 1.8, cold), read from the figure. */
  largePlateauStartDegrees: 144,
  largeRiseDecibelsPerDegree: .85,
  /** Class C: beyond the data, the fall of Khavaran & Bridges 2009 fig. 2.1 from 160° to 165°. */
  largeAftFallDecibelsPerDegree: .4,
  /** Class B: Tam 1996 fig. 7 (M_j 2.24, cold), 60–140°. */
  fineRiseDecibelsPerDegree: .11,
  /**
   * f·D_j/V_e. Class B: full-scale F-35AA and F-22A at military power peak in third octaves near 200 Hz aft and
   * 0.9–1 kHz sideways (Gee, Neilsen & Wall 2013, Acoustics Today, fig. 11), St 0.1–0.3 aft; the values are
   * fitted to those peaks for the default jet (class C). Tam 1996 fig. 10 gives half of it for laboratory jets.
   */
  /**
   * Class B: Tam's levels are dB per Hz at r = D_j for laboratory nozzles. Sound power grows with nozzle area, so OASPL at
   * 100 D_j does not depend on size (Khavaran & Bridges 2009 fig. 2.1); with peaks at a fixed Strouhal number that takes
   * +10 log(D_j / D_ref). D_ref fitted to Khavaran & Bridges over 50–165°, M_a 0.5–1.4, T_s 1.0 and 2.7 (residuals ±10 dB, hot slow jets low).
   */
  levelReferenceDiameterMetres: .0712,
  /**
   * Class C: crackle, the steepening index of `steepen`, grows from nothing where the large eddies convect at
   * `crackleConvection[0]` times the speed of sound to its full value at `crackleConvection[1]` (Ffowcs Williams et
   * al. 1975: crackle needs supersonic convection; F-35 at military and afterburner power, Gee et al. 2013).
   */
  crackleIndex: .8,
  crackleConvection: Object.freeze([.8, 1.6]),
  /** Class C: the share of a fully crackling jet's power that travels in shocks, its high end set by their rise instead of absorption. */
  shockShare: .3,
  /** Class C: turbomachinery radiates forward and to the side; aft of 90° it falls by this much at 180°. A hump is this many octaves wide (standard deviation). */
  turbomachineryAftDecibels: 10,
  humpOctaves: .25,
  largePeakStrouhal: .19,
  finePeakStrouhal: .45,
  /** Class B: pressure skewness 0.15–0.4 made at the source, F-35AA at military power (Gee, Neilsen & Wall 2013, fig. 10). */
  largeScaleSkewness: .3,
  /** Class C: intermittent wavepackets; with the path's scintillation a render's kurtosis meets the recordings' 4–7. */
  largeScaleKurtosis: 4,
  packetCycles: 4
});

export const JET_FLIGHT = Object.freeze({
  /** Class B: Stone, Krejsa & Clark 2003, eqs. 2, 2a, 2d; n_c their initial 0.62. */
  convectionRatio: .62,
  convectionSpread: .04,
  convectionDecibels: 15,
  /**
   * Class C: the least |1 − M cos ψ| a supersonic jet's grain is compressed by, so that its amplitude grows at most
   * fivefold at the Mach cone's caustic, as Boomtect limits a boom's focus.
   */
  smallestCompression: .04,
  /** Class C: with an automatic flight time the jet flies on until each microphone is this far below its closest approach, by spreading. */
  hearingDecibels: 30
});

/**
 * Broadband shock-cell noise of an imperfectly expanded jet. Class B: Stone, Krejsa & Clark 2003 (NASA/CR-2003-212522),
 * inner-stream shock noise, eqs. 14–15, coefficient eq. 42 for a nozzle without plug, spectra of their Table VII; their
 * data are static model-scale jets, the flight term is theory.
 */
export const SHOCK_NOISE = Object.freeze({
  levelDecibels: 158,
  convectionShare: .7,
  convectionSpread: .04,
  flightDecibels: 40,
  aftFallDecibelsPerDegree: .75,
  /**
   * Table VII: third-octave level re the unscaled overall level against log S, per 10° of inlet angle from 0 to 180,
   * as its values at log S = −0.2, −0.1, 0 and 0.1 and its fall per decade above 0.1; below −0.2 every column rises
   * `lowRiseDecibelsPerDecade`. This form reproduces the table from log S = −3.6 to 2, which spans the audible range.
   */
  spectrumLogStrouhal: Object.freeze([-.2, -.1, 0, .1]),
  lowRiseDecibelsPerDecade: 50,
  spectrum: Object.freeze([
    [-11, -6, -4, -5.5, 20], [-11, -6, -4, -5.5, 20], [-11, -6, -4, -5.5, 20], [-11, -6, -4, -5.5, 20], [-11, -6, -4, -5.5, 20],
    [-11.5, -6.5, -4.5, -6, 20], [-12, -7, -5, -6.5, 20], [-12.5, -7.5, -5.5, -7, 20], [-8, -6, -7.5, -9.5, 20],
    [-8.4, -6.4, -7.9, -9.4, 15], [-8.6, -6.6, -8.1, -9.6, 15], [-8.8, -6.8, -8.3, -9.8, 15], [-9, -7, -8.5, -10, 15],
    [-9.2, -7.2, -8.7, -10.2, 15], [-9.4, -7.4, -8.9, -10.4, 15], [-9.6, -7.6, -9.1, -10.6, 15], [-9.8, -7.8, -9.3, -10.8, 15],
    [-10, -8, -9.5, -11, 15], [-10.2, -8.2, -9.7, -11.2, 15]
  ].map(Object.freeze)),
  /** Class C: Stone's flight term is evaluated at most at this flight Mach number, +21 dB straight ahead. */
  flightMachLimit: .8
});

/**
 * Infrasound: below the crossover each source also emits long grains, synthesised at a low internal rate and evaluated
 * only up to `highestFrequencyHz`; the short grains take the rest. The bands split power by complementary fourth-order
 * shares, so their sum is the source's spectrum.
 */
/**
 * Class C: a source's shocks form at twice its peak frequency, so that Falcon 9's form within 0.75 km, where its launch
 * noise already falls 10 dB per decade at high frequencies (Kellison et al. 2026); at its 13 Hz peak they would form
 * only near 6 km.
 */
export const SHOCK_FORMATION = Object.freeze({ frequencyRatio: 2 });

export const LOW_BAND = Object.freeze({ crossoverHz: 20, grainSeconds: .68, internalSamples: 256, highestFrequencyHz: 60 });

export const SYNTHESIS = Object.freeze({
  frameSamples: 4096,
  bandLimitShare: .45,
  delayGridSamples: 64
});

export const TURBULENCE = Object.freeze({
  /** Class C, Boomtect's defaults. */
  strength: 1e-6,
  scaleMetres: 1.1
});

/**
 * Decision 12, A: airliners and business jets as a core and a fan stream (C), from take-off thrust, bypass ratio and
 * airflow (Doc/reviews/2026-10-21-airliner-reference.md): FJ44-4 16.5 kN, bypass 3.3; CF34-8C5 64.5 kN, 5, 202 kg/s;
 * CFM56-5B 120 kN, 5.7, about 400 kg/s; GE90-115B 514 kN, 9, about 1 600 kg/s; CF6-80C2 260 kN, 5.1, about 800 kg/s.
 * The core leaves 1.4 times as fast as the fan stream, at 780 K, the fan stream at 335 K.
 * Blade-passing at take-off: GE90 22 × 2 355 rpm = 864 Hz (B), CFM56-5B 36 × 5 000 rpm = 3 kHz (B); the others from
 * tip speeds about 450 m/s (C). The fan turns at the square root of the thrust share (C), about 55 % at approach and
 * 93 % at 80 % power. Idle gives 6 % of take-off thrust, within the 3–9 % that engine patents give for flight idle (C). Buzz-saw tones at the shaft's orders, most near a quarter of the blade count, fade in as the fan
 * passes 85 % of its speed and its tips the speed of sound (C). The fan's broadband noise is log-normal about 2.5 times the
 * blade-passing frequency with a geometric deviation of 2.2 (B, Heidmann 1975, NASA TM X-71763 eq. 2, fans of the 1970s;
 * Doc/reviews/2026-10-22-airframe-reference.md). The split between tones, hump and
 * buzz-saw is assumed until recordings are measured. The fan's power goes as a power of its speed (C); each class's
 * level at full speed and that exponent are fitted so its LAmax 1 000 ft under a level pass at Mach 0.24 matches the ANP
 * database 2.3 NPD at the same thrust per engine (EASA; C fit to B data), the level to the top departure row (CJ4 FJ44-4
 * 3 300 lb 87.5 dB, CRJ900 CF34-8C5 13 525 lb 85.1 dB interpolated, A320 CFM56-5A 22 500 lb 88.9 dB, 777-300ER GE90-115B
 * 97 000 lb 98.1 dB, 747-400 PW4056 50 000 lb 96.9 dB), the exponent to the lower departure rows by least squares:
 * regional N1³·³, narrowbody N1⁵·⁴, widebody N1⁴·⁸ with a knee from 84 % of its speed, 7 dB at full (decision 15), four-engine N1⁶·¹, where Heidmann's correlation gives about N1⁵; the
 * business jet's N1⁵·² to its approach rows as well, as no one power follows both. Approach rows, flown with gear and
 * flaps out, are otherwise not fitted: on them jets and airframe come within about a decibel of ANP alone. Unfitted
 * departure rows fall within −2.2 to +0.8 dB (business jet −5.8), approach rows within −1.4 to +2.4 dB except the
 * regional jet's 7 250 lb, +4.4 dB, where ANP's own departure and approach rows differ by 3.3 dB at the same thrust.
 */
const CIVIL_FLIGHT = Object.freeze({ mach: .25, heightMetres: 300 });
/** Class C: below the departure rows the speed law is not extrapolated past this drop from full speed, about where ANP's approach rows leave the fan. */
const CIVIL_FAN_QUIETEST_DECIBELS = 30;
const HEIDMANN_BROADBAND = Object.freeze({ humpCentre: 2.5, humpOctaves: Math.log2(2.2) });
const civilFan = (offset, speedExponent, knee = null) => Object.freeze({ harmonics: Object.freeze([0, -6]), fullToneDecibels: offset, fullHumpDecibels: 3 + offset, speedExponent, knee, quietestDecibels: CIVIL_FAN_QUIETEST_DECIBELS, ...HEIDMANN_BROADBAND, buzzSaw: Object.freeze({ fromSpeed: .85, decibels: 3 + offset, orderSpread: .6 }) });
/** Class C fit to B data (ANP 2.3 GE90-115B departure rows, decision 15): above this fan speed the tones and hump rise steeply as the tips turn supersonic, this many decibels over the speed law at full speed. */
const WIDEBODY_KNEE = Object.freeze({ fromSpeed: .84, decibels: 7 });

/**
 * Fink's airframe noise (FAA-RD-77-29, 1977) as ANOPP gives it (Zorumski 1982, NASA TM-83199 part 2, section 8.8, tables
 * II and III; B within Fink's data, 1970s jet transports): acoustic power re ρc³b² as K Mᵃ G for trailing edges (a = 5),
 * flaps, wheels and struts (a = 6); trailing edges at the conventional constant with flaps or slats out or numerous flap
 * tracks, the clean one 8 dB lower for simple flaps. Doc/reviews/2026-10-22-airframe-reference.md.
 */
export const AIRFRAME = Object.freeze({
  trailingEdgeConstant: Object.freeze({ conventional: 4.464e-5, clean: 7.075e-6 }),
  flapConstant: Object.freeze({ slotted: 2.787e-4, triple: 3.509e-4 }),
  wheelConstant: Object.freeze({ two: 4.349e-4, four: 3.414e-4 }),
  strutConstant: 2.753e-4,
  /** Class C: the convective factor's base is held above this, as near grazing ahead it would grow without bound. */
  smallestConvection: .2
});

/**
 * Each civil class's airframe after one aircraft. Wing areas and spans and tyre sizes are published (B): CJ4 30.66 m²,
 * 15.49 m, tyres 22 in and 16 in (Textron, Michelin); CRJ900 71.1 m², 24.9 m, flaps 45°; A320 122.6 m², 34.1 m, tyres
 * 46 in and 30 in (Airbus AC A320); 777-300ER 436.8 m², 64.8 m, two six-wheel bogies on 52 in tyres, 43 in nose tyres
 * (Boeing, Tronair); 747-400 525 m², 64.4 m, triple-slotted flaps, sixteen 49 in main and two nose tyres (Dunlop). Tails,
 * flap areas and spans, the other landing deflections, the CRJ900's tyres, and strut lengths are assumed (C); a bogie of
 * more than four wheels takes Fink's four-wheel functions with its wheel count (C).
 */
const surface = (areaSquareMetres, spanMetres) => Object.freeze({ areaSquareMetres, spanMetres });
const gearUnits = (count, wheels, tyreMetres, strutMetres) => Object.freeze({ count, wheels, tyreMetres, strutMetres });
const airframeOf = ({ wing, horizontalTail, verticalTail, flaps, slats, cleanWing = false, mainGear, noseGear }) => Object.freeze({ wing, horizontalTail, verticalTail, flaps: Object.freeze(flaps), slats, cleanWing, mainGear, noseGear });
const AIRFRAMES = Object.freeze({
  business: airframeOf({ wing: surface(30.66, 15.49), horizontalTail: surface(6.5, 6), verticalTail: surface(5, 2.6), flaps: { areaSquareMetres: 3.7, spanMetres: 8.5, landingDegrees: 35, slots: 1 }, slats: false, cleanWing: true, mainGear: gearUnits(2, 1, .56, .9), noseGear: gearUnits(1, 1, .41, .6) }),
  regional: airframeOf({ wing: surface(71.1, 24.9), horizontalTail: surface(15, 8.5), verticalTail: surface(10, 4), flaps: { areaSquareMetres: 10.7, spanMetres: 15, landingDegrees: 45, slots: 2 }, slats: true, mainGear: gearUnits(2, 2, 1.02, 1.4), noseGear: gearUnits(1, 2, .69, 1) }),
  narrowbody: airframeOf({ wing: surface(122.6, 34.1), horizontalTail: surface(31, 12.45), verticalTail: surface(21.5, 5.9), flaps: { areaSquareMetres: 21, spanMetres: 22, landingDegrees: 40, slots: 1 }, slats: true, mainGear: gearUnits(2, 2, 1.17, 1.8), noseGear: gearUnits(1, 2, .76, 1.2) }),
  widebody: airframeOf({ wing: surface(436.8, 64.8), horizontalTail: surface(101, 21.5), verticalTail: surface(53, 9.2), flaps: { areaSquareMetres: 52, spanMetres: 39, landingDegrees: 30, slots: 2 }, slats: true, mainGear: gearUnits(2, 6, 1.32, 2.4), noseGear: gearUnits(1, 2, 1.09, 1.8) }),
  quad: airframeOf({ wing: surface(525, 64.4), horizontalTail: surface(136.6, 22.2), verticalTail: surface(77.1, 10), flaps: { areaSquareMetres: 79, spanMetres: 38.6, landingDegrees: 30, slots: 3 }, slats: true, mainGear: gearUnits(4, 4, 1.24, 2.3), noseGear: gearUnits(1, 2, 1.24, 1.8) })
});

export const ENGINE = Object.freeze({
  /** Class B: hot exhaust gas, γ and c_p of combustion products. */
  gasGamma: 1.33,
  gasHeatCapacityJoulesPerKilogramKelvin: 1150,
  /**
   * The category slider's engine classes, each with its settings from idle (power 0) to full power (1), its engine count
   * and a typical flight. Nozzle diameter and pressure ratio of the smaller ones follow from thrust, mass flow and exhaust
   * temperature through the ideal nozzle (C): a JetCat P100 hobby turbine, 100 N, 0.23 kg/s, about 970 K (JetCat; AFRL
   * gives 434 m/s); a 4 kN target-drone turbojet (TRI 60 class, C); a cruise missile's F107 turbofan, 3.1 kN, bypass 1:1,
   * mixed, 6.2 kg/s assumed (C); a B-52's eight TF33-P-3, 75.6 kN each, bypass 1.42 (JT3D), 196–230 kg/s. The TF33's fan
   * stream leaves a short duct apart from the core, so the bomber has a core and a `bypass` stream as two of Tam's jets
   * (decision 4, 3C, taken 2026-10-21 when one equivalent mixed jet of 360 m/s fell silent near Mach 0.9 and left its fan
   * whistling): core 87 kg/s at 459 m/s and 750 K, fan 119 kg/s at 290 m/s and 330 K, thrust 74.5 kN, bypass 1.37 (C).
   * Idle settings are assumed (C).
   * Turbomachinery: tones at the blade-passing frequency and its harmonics (dB re the strongest) and a broadband hump
   * around it, each in dB re the class's static full-power mixing noise at 90°, idle and full, between them by power (C).
   * Hobby: the owner's recording RC-2 at 2–3 m, 4.04 kHz with harmonics at idle, 11.36 kHz at full, tones −23 dB re all
   * at full and idle −29 dB assumed (its level is held by automatic gain). Bomber: TF33 two-stage fan, about 34 blades
   * at up to about 6 800 rpm, 3.85 kHz; the owner's B-52 recordings peak in the 2–4 kHz octave overhead, about 9 dB over
   * the jet's band. Drone and cruise missile: blade speed scaled by size, levels assumed (C).
   */
  classes: Object.freeze({
    hobby: Object.freeze({
      label: 'Hobby turbine', engines: 1, defaultPower: 1, flight: Object.freeze({ mach: .2, heightMetres: 30 }),
      turbomachinery: Object.freeze({ idleBladeHz: 4040, fullBladeHz: 11360, harmonics: Object.freeze([-6, 0, -9]), toneDecibels: Object.freeze([-29, -23]), humpDecibels: null }),
      settings: Object.freeze([
        Object.freeze({ power: 0, label: 'Idle', pressureRatio: 1.03, totalTemperatureKelvin: 850, diameterMetres: .041 }),
        Object.freeze({ power: 1, label: 'Full', pressureRatio: 1.429, totalTemperatureKelvin: 970, diameterMetres: .041 })
      ])
    }),
    drone: Object.freeze({
      label: 'Jet drone', engines: 1, defaultPower: 1, flight: Object.freeze({ mach: .6, heightMetres: 200 }),
      turbomachinery: Object.freeze({ idleBladeHz: 2600, fullBladeHz: 7300, harmonics: Object.freeze([0, -6]), toneDecibels: Object.freeze([-29, -23]), humpDecibels: Object.freeze([-26, -20]) }),
      settings: Object.freeze([
        Object.freeze({ power: 0, label: 'Idle', pressureRatio: 1.1, totalTemperatureKelvin: 650, diameterMetres: .185 }),
        Object.freeze({ power: 1, label: 'Full', pressureRatio: 1.971, totalTemperatureKelvin: 1000, diameterMetres: .185 })
      ])
    }),
    cruise: Object.freeze({
      label: 'Cruise missile', engines: 1, defaultPower: 1, flight: Object.freeze({ mach: .7, heightMetres: 50 }),
      turbomachinery: Object.freeze({ idleBladeHz: 3200, fullBladeHz: 9000, harmonics: Object.freeze([0, -6]), toneDecibels: Object.freeze([-26, -20]), humpDecibels: Object.freeze([-23, -17]) }),
      settings: Object.freeze([
        Object.freeze({ power: 0, label: 'Idle', pressureRatio: 1.15, totalTemperatureKelvin: 450, diameterMetres: .148 }),
        Object.freeze({ power: 1, label: 'Full', pressureRatio: 2.238, totalTemperatureKelvin: 600, diameterMetres: .148 })
      ])
    }),
    /**
     * Class C: a single-engine fighter. The nozzle is about 1 m across and changes with power (F-35, Gee, Neilsen & Wall
     * 2013); afterburning gas reaches about 2 100 K (F404-GE-400 exhaust survey, NASA, NTRS 19880010923).
     */
    fighter: Object.freeze({
      label: 'Fighter', engines: 1, defaultPower: .75, flight: Object.freeze({ mach: .44, heightMetres: 300 }), turbomachinery: null,
      settings: Object.freeze([
        Object.freeze({ power: 0, label: 'Idle', pressureRatio: 1.3, totalTemperatureKelvin: 550, diameterMetres: .8 }),
        Object.freeze({ power: .75, label: 'Military', pressureRatio: 3.5, totalTemperatureKelvin: 750, diameterMetres: .9 }),
        Object.freeze({ power: 1, label: 'Afterburner', pressureRatio: 4, totalTemperatureKelvin: 1900, diameterMetres: 1.05 })
      ])
    }),
    bomber: Object.freeze({
      label: 'Heavy bomber', engines: 8, defaultPower: 1, flight: Object.freeze({ mach: .25, heightMetres: 300 }),
      turbomachinery: Object.freeze({ idleBladeHz: 1550, fullBladeHz: 3850, harmonics: Object.freeze([0, -8]), toneDecibels: Object.freeze([0, -3]), humpDecibels: Object.freeze([2, 3]) }),
      settings: Object.freeze([
        Object.freeze({ power: 0, label: 'Idle', pressureRatio: 1.171, totalTemperatureKelvin: 600, diameterMetres: .67 }),
        Object.freeze({ power: 1, label: 'Full', pressureRatio: 1.69, totalTemperatureKelvin: 750, diameterMetres: .67 })
      ]),
      bypass: Object.freeze([
        Object.freeze({ power: 0, pressureRatio: 1.092, totalTemperatureKelvin: 290, diameterMetres: .66 }),
        Object.freeze({ power: 1, pressureRatio: 1.605, totalTemperatureKelvin: 330, diameterMetres: .66 })
      ])
    }),
    business: Object.freeze({
      label: 'Business jet', civil: true, engines: 2, defaultPower: 1, flight: CIVIL_FLIGHT,
      turbomachinery: Object.freeze({ ...civilFan(1.4, 5.2), blades: 22, fullBladeHz: 5900 }),
      airframe: AIRFRAMES.business,
      settings: Object.freeze([
        Object.freeze({ power: 0, label: 'Idle', pressureRatio: 1.044, totalTemperatureKelvin: 600, diameterMetres: 0.266 }),
        Object.freeze({ power: 1, label: 'Take-off', pressureRatio: 1.518, totalTemperatureKelvin: 780, diameterMetres: 0.266 })
      ]),
      bypass: Object.freeze([
        Object.freeze({ power: 0, pressureRatio: 1.024, totalTemperatureKelvin: 295, diameterMetres: 0.371 }),
        Object.freeze({ power: 1, pressureRatio: 1.65, totalTemperatureKelvin: 335, diameterMetres: 0.371 })
      ])
    }),
    regional: Object.freeze({
      label: 'Regional jet', civil: true, engines: 2, defaultPower: 1, flight: CIVIL_FLIGHT,
      turbomachinery: Object.freeze({ ...civilFan(-10.7, 3.3), blades: 24, fullBladeHz: 2900 }),
      airframe: AIRFRAMES.regional,
      settings: Object.freeze([
        Object.freeze({ power: 0, label: 'Idle', pressureRatio: 1.047, totalTemperatureKelvin: 600, diameterMetres: 0.452 }),
        Object.freeze({ power: 1, label: 'Take-off', pressureRatio: 1.515, totalTemperatureKelvin: 780, diameterMetres: 0.452 })
      ]),
      bypass: Object.freeze([
        Object.freeze({ power: 0, pressureRatio: 1.025, totalTemperatureKelvin: 295, diameterMetres: 0.775 }),
        Object.freeze({ power: 1, pressureRatio: 1.646, totalTemperatureKelvin: 335, diameterMetres: 0.775 })
      ])
    }),
    narrowbody: Object.freeze({
      label: 'Narrowbody', civil: true, engines: 2, defaultPower: 1, flight: CIVIL_FLIGHT,
      turbomachinery: Object.freeze({ ...civilFan(-3.6, 5.4), blades: 36, fullBladeHz: 3000 }),
      airframe: AIRFRAMES.narrowbody,
      settings: Object.freeze([
        Object.freeze({ power: 0, label: 'Idle', pressureRatio: 1.042, totalTemperatureKelvin: 600, diameterMetres: 0.622 }),
        Object.freeze({ power: 1, label: 'Take-off', pressureRatio: 1.447, totalTemperatureKelvin: 780, diameterMetres: 0.622 })
      ]),
      bypass: Object.freeze([
        Object.freeze({ power: 0, pressureRatio: 1.023, totalTemperatureKelvin: 295, diameterMetres: 1.141 }),
        Object.freeze({ power: 1, pressureRatio: 1.557, totalTemperatureKelvin: 335, diameterMetres: 1.141 })
      ])
    }),
    widebody: Object.freeze({
      label: 'Widebody', civil: true, engines: 2, defaultPower: 1, flight: CIVIL_FLIGHT,
      turbomachinery: Object.freeze({ ...civilFan(-1.9, 4.8, WIDEBODY_KNEE), blades: 22, fullBladeHz: 864 }),
      airframe: AIRFRAMES.widebody,
      settings: Object.freeze([
        Object.freeze({ power: 0, label: 'Idle', pressureRatio: 1.055, totalTemperatureKelvin: 600, diameterMetres: 0.966 }),
        Object.freeze({ power: 1, label: 'Take-off', pressureRatio: 1.558, totalTemperatureKelvin: 780, diameterMetres: 0.966 })
      ]),
      bypass: Object.freeze([
        Object.freeze({ power: 0, pressureRatio: 1.030, totalTemperatureKelvin: 295, diameterMetres: 2.221 }),
        Object.freeze({ power: 1, pressureRatio: 1.704, totalTemperatureKelvin: 335, diameterMetres: 2.221 })
      ])
    }),
    quad: Object.freeze({
      label: 'Four-engine', civil: true, engines: 4, defaultPower: 1, flight: CIVIL_FLIGHT,
      turbomachinery: Object.freeze({ ...civilFan(-5.6, 6.1), blades: 38, fullBladeHz: 2153 }),
      airframe: AIRFRAMES.quad,
      settings: Object.freeze([
        Object.freeze({ power: 0, label: 'Idle', pressureRatio: 1.049, totalTemperatureKelvin: 600, diameterMetres: 0.881 }),
        Object.freeze({ power: 1, label: 'Take-off', pressureRatio: 1.54, totalTemperatureKelvin: 780, diameterMetres: 0.881 })
      ]),
      bypass: Object.freeze([
        Object.freeze({ power: 0, pressureRatio: 1.026, totalTemperatureKelvin: 295, diameterMetres: 1.526 }),
        Object.freeze({ power: 1, pressureRatio: 1.68, totalTemperatureKelvin: 335, diameterMetres: 1.526 })
      ])
    })
  })
});

export const ROCKET = Object.freeze({
  /** Class B: Mathews 2025 eq. 6.4 (SATURN, Atlas V within 1 km), dB per unit Sr = f D_eff / U_e re W_OA; peak Sr 0.0108, matching Falcon 9 (Kellison et al. 2026). */
  spectrum: Object.freeze({ lowBreak: 3.6e-3, highBreak: 4.8e-2, peakStrouhal: .0108 }),
  /**
   * Class B: a single nozzle's sound power peaks near Sr 0.023: RSRM 0.025 at 45° (Lubert, Gee & Tsutsumi 2022), a 12.7 cm
   * motor with RSRM propellant about 0.023 (Gee et al. 2010), rockets generally 0.02–0.025 (the review; SP-8072 0.02),
   * where SATURN's clusters peak at 0.010–0.015 on D_eff. A one-engine rocket takes SATURN's spectrum and directivity
   * stretched to peak here; Doc/reviews/2026-10-21-small-rocket-brightness.md.
   */
  singleNozzlePeakStrouhal: .024,
  /** Class B: Mathews 2025 eq. 6.6, GEM-60 intensity, s = 9.85 Sr^−0.21 D_eff behind the nozzle. */
  sourceLocation: Object.freeze({ coefficient: 9.85, exponent: -.21 }),
  /** Class B: SATURN and Kellison et al. 2026 take their directivity with the source 18 D_eff behind the nozzle. */
  sourceDiameters: 18,
  /** Class B: SATURN's table is reliable to its edge; its last degrees fall off as a boundary artefact. */
  directivityEdgeDegrees: 84,
  /**
   * Class C: forward of the table, the corrected RSRM indices of Hart, Gee & Cook 2023 fig. 8 relative to their 80°, for
   * Sr ≈ 0.015 and Sr ≥ 1, interpolated in log Sr; 180° beyond their data.
   */
  forward: Object.freeze({
    degrees: Object.freeze([84, 100, 120, 145, 180]),
    low: Object.freeze([0, -5, -7.5, -11.5, -15]),
    high: Object.freeze([0, -1, -3, -6, -9]),
    lowStrouhal: .015,
    highStrouhal: 1
  }),
  /** Class B: pressure skewness 0.3–0.7 near the peak direction at 18–80 D_e, RSRM (Gee et al. 2012). */
  skewness: .4,
  /** Class C: a rocket's plume always convects supersonically, so it crackles at this steepening index. */
  crackleIndex: .8,
  /** Class C: the share of a rocket's power that travels in shocks, its high end set by their rise instead of absorption; fitted to the owner's unlimited Starship recording 7 at 7.7 km (within 4 dB to 4 kHz). */
  shockShare: .3,
  /** Class B: no intermittency; the owner's unlimited Starship recording 7 has kurtosis 3.0 at 7.7 km, as Gaussian noise. */
  kurtosis: 3,
  packetCycles: 4,
  /** Class B: liquid engines are held down until running, SpaceX's T0 3 s after ignition (Hart et al. 2025); solid motors lift off at ignition. */
  holdSeconds: 3,
  /**
   * Class C: the spectrum opens from low to high frequencies as a cluster's engines start in turn, this long for each
   * engine after the first: Starship's 33 in about 1.2 s (owner's recordings 4 and 7), five Merlins' main rise in
   * 0.15 s (recording 3); a single motor reaches full level within 5 ms (recordings 2 and 10).
   */
  ignitionSecondsPerEngine: .0375,
  shortestIgnitionSeconds: .005,
  ignitionCornerHz: Object.freeze([10, 20000]),
  /**
   * Decision 19, the ignition pulse at the pad: a Friedlander shape (B, Ryan et al. 1981: a positive pulse and a
   * negative after-phase), its peak a share of the steady burn's omnidirectional RMS at the same distance (C: Falcon 9
   * 120–126 dB at 0.75 km, Kellison et al. 2026, rendered 123 dB with the ground's doubling; a solid motor about 3 in
   * recording 10 and 10 at Artemis-I's 146 dB at 1.8 km), its positive phase per metre of plume width (C: Falcon 9's
   * 2–3 Hz peak; the Shuttle's 6 Hz for solids).
   */
  ignitionPulse: Object.freeze({
    peakPerSteady: Object.freeze({ solid: 4, liquid: .33 }),
    secondsPerMetre: Object.freeze({ solid: .0058, liquid: .025 }),
    shortestSeconds: .0005,
    decay: 1,
    linearPressureShare: .04,
    offDecibels: -60
  }),
  /** Class C: frequencies whose source has not yet left the flame deflector (Mathews 2025, plume emergence) radiate without directivity, this much weaker. */
  padLossDecibels: 6,
  /** Class B: water deluge reduces launch noise by 3–5 dB (Gee, Lubert & James 2024), applied to the pad phase. */
  waterDecibels: 4,
  throttleRampSeconds: 3,
  /**
   * Class C, decision 9: the authored ascent. Speed follows the rocket equation's shape, v = V ln(1 − k t/T) / ln(1 − k),
   * k this many times the Acceleration share, as a propellant mass fraction; the path is sampled this often to place
   * the turn by distance flown.
   */
  lateAccelerationFraction: .97,
  pathSeconds: .05,
  /**
   * After burnout a solid rocket's body flies on unpowered, for the path another tect follows: drag over m / C_D A = density × length
   * / C_D, B for the Grad (46 kg burnt out in 2.87 m × 122 mm, 1 370 kg/m³), C_D 0.35 and the rest C; at most this long.
   */
  coast: Object.freeze({ burntDensityKilogramsPerCubicMetre: 1370, dragCoefficient: .35, seconds: 120 }),
  /** Echoes and scattering arrive after the direct sound; the ascent ends this much before the render's span would. */
  renderMarginSeconds: 40,
  /**
   * Exhaust velocity by propellant, class B: solid RSRM ≈ 2 500 m/s and GEM 63XL ≈ 2 470 m/s; kerosene Merlin 1D 2 984 m/s
   * (Kellison et al. 2026); methane Raptor 2 3 414 m/s (Gee et al. 2025) and BE-4 ≈ 3 180 m/s; hydrogen near the top of
   * the typical 2 400–4 000 m/s (Lubert et al. 2022, table I).
   */
  propellants: Object.freeze({
    solid: Object.freeze({ label: 'Solid', exitVelocityMetresPerSecond: 2500 }),
    kerosene: Object.freeze({ label: 'Kerosene', exitVelocityMetresPerSecond: 2984 }),
    methane: Object.freeze({ label: 'Methane', exitVelocityMetresPerSecond: 3300 }),
    hydrogen: Object.freeze({ label: 'Hydrogen', exitVelocityMetresPerSecond: 4000 })
  }),
  /**
   * Class C: sizing from total thrust. The exit diameter grows as √F (the same chamber pressure and expansion), its
   * factor the geometric mean of Merlin 1D, Raptor 2, RD-180, Alpha, SRTM and GEM-60 (0.30–1.43 m, within 30 %).
   * Burn time from a hobby motor's 2 s to a first stage's 150 s. Water on pads for vehicles of 1 MN and more.
   */
  sizing: Object.freeze({
    diameterPerRootNewton: 9.2e-4,
    /**
     * Class C: small solid motors burn at high chamber pressure, so their nozzles are smaller for their thrust: the exit
     * taken as 70 % of the body, Terrier Mk 70 0.457 m at about 258 kN and MLRS 0.227 m (Skyrocket, designation-systems),
     * 6e-4 √F; large solid boosters return to the common factor between 0.3 and 3 MN.
     */
    smallSolidDiameterPerRootNewton: 6e-4,
    smallSolidNewtons: Object.freeze([3e5, 3e6]),
    burnSeconds: Object.freeze([Object.freeze([10, 2]), Object.freeze([1e3, 5]), Object.freeze([1e5, 60]), Object.freeze([1e6, 120]), Object.freeze([7e6, 150])]),
    waterFromNewtons: 1e6,
    totalNewtons: Object.freeze([10, 1e8])
  }),
  /**
   * The category slider's steps. Medium is Falcon 9's thrust, engines and propellant (B); super-heavy Starship's, with
   * SATURN's 0.4 % for Flight 6 (B); heavy three medium cores; the smaller ones typical, class C: a 10 N hobby motor, an
   * artillery rocket off a tilted tube, a sounding rocket's booster (Terrier class), a small four-engine launcher like Firefly Alpha (0.73 MN).
   * The artillery rocket is a 122 mm Grad (BM-21, APR-40, M-92 Vulkan; the owner's recordings 10 and 11): about 66 kg with
   * 20 kg of propellant burnt in 2 s to about 690 m/s. The heavy artillery rocket is GMLRS-sized, a 4 s burn to about
   * Mach 2.5 as GMLRS and ATACMS; the sounding rocket a Terrier booster's 6 s burn to about Mach 3; model rockets reach
   * about 100 m/s. Each flies its category's ascent (decision 9, C): the launchers' fitted to Falcon 9's webcast
   * telemetry (T+30 s 2.1 km and 148 m/s against 1.93 km and 146 m/s, T+60 s 9.2 km and 336 m/s against 8.91 km and
   * 337 m/s, T+100 s 25.4 km and 712 m/s against 25.49 km and 874 m/s), Starship's staging near 5 500 km/h.
   * Lengths, B, of each one's vehicle: Grad 2.87 m, GMLRS 3.94 m, Terrier-Improved Orion 10.7 m, Firefly Alpha
   * 29.75 m, Falcon 9 and Falcon Heavy 70 m, Starship 121 m; a model rocket's 0.5 m is C.
   */
  categories: Object.freeze([
    Object.freeze({ label: 'Hobby', lengthMetres: 0.5, newtons: 10, engines: 1, propellant: 'solid', burnSeconds: 2, launchDegrees: 85, efficiencyPercent: .3, flight: Object.freeze({ burnoutMetresPerSecond: 80, accelerationPercent: 0, bendDegrees: 0 }) }),
    Object.freeze({ label: 'Artillery', lengthMetres: 2.87, newtons: 21e3, engines: 1, propellant: 'solid', burnSeconds: 2, launchDegrees: 50, efficiencyPercent: .3, flight: Object.freeze({ burnoutMetresPerSecond: 690, accelerationPercent: 31, bendDegrees: 0 }) }),
    Object.freeze({ label: 'Heavy artillery', lengthMetres: 3.94, newtons: 50e3, engines: 1, propellant: 'solid', burnSeconds: 4, launchDegrees: 50, efficiencyPercent: .3, flight: Object.freeze({ burnoutMetresPerSecond: 850, accelerationPercent: 35, bendDegrees: 0 }) }),
    Object.freeze({ label: 'Sounding', lengthMetres: 10.7, newtons: 250e3, engines: 1, propellant: 'solid', burnSeconds: 6, launchDegrees: 85, efficiencyPercent: .3, flight: Object.freeze({ burnoutMetresPerSecond: 1000, accelerationPercent: 50, bendDegrees: 0 }) }),
    Object.freeze({ label: 'Small launcher', lengthMetres: 29.75, newtons: .73e6, engines: 4, propellant: 'kerosene', burnSeconds: 160, launchDegrees: 90, efficiencyPercent: .3, flight: Object.freeze({ burnoutMetresPerSecond: 2300, accelerationPercent: 100, bendDegrees: 50 }) }),
    Object.freeze({ label: 'Medium launcher', lengthMetres: 70, newtons: 7.6e6, engines: 9, propellant: 'kerosene', burnSeconds: 150, launchDegrees: 90, efficiencyPercent: .3, flight: Object.freeze({ burnoutMetresPerSecond: 2400, accelerationPercent: 100, bendDegrees: 50 }) }),
    Object.freeze({ label: 'Heavy launcher', lengthMetres: 70, newtons: 22.8e6, engines: 27, propellant: 'kerosene', burnSeconds: 150, launchDegrees: 90, efficiencyPercent: .3, flight: Object.freeze({ burnoutMetresPerSecond: 2400, accelerationPercent: 100, bendDegrees: 50 }) }),
    Object.freeze({ label: 'Super-heavy', lengthMetres: 121, newtons: 74.4e6, engines: 33, propellant: 'methane', burnSeconds: 160, launchDegrees: 90, efficiencyPercent: .4, flight: Object.freeze({ burnoutMetresPerSecond: 1600, accelerationPercent: 100, bendDegrees: 40 }) })
  ]),
  /**
   * Class C: an ascent's schedule for every size. The throttle-down, which only changes the sound, follows Falcon 9's
   * webcast telemetry (47–65 s at about 75 %); a turn starts 1 % along the path and takes 30 % of the rest.
   */
  defaultAscent: Object.freeze({ turnStartPercent: 1, turnLengthPercent: 30, throttleDownSeconds: 47, throttleUpSeconds: 65, throttlePercent: 75 }),
  /**
   * Class C: a salvo as Boomtect's barrage lays it out, salvos even over its span and each moved by up to this share of
   * their interval. A salvo defaults to a 122 mm launcher's full load, 40 Artillery rockets one at a time over 20 s (BM-21, APR-40, M-92 Vulkan).
   */
  salvoJitter: .15,
  salvoLayout: Object.freeze({ roundCount: 40, salvoSize: 1, salvoSeconds: 20, salvoSpreadSeconds: 0, launcherRadiusMetres: 2, headingSpreadDegrees: 2, launchSpreadDegrees: 1, thrustSpreadPercent: 5 })
});

export const VOLCANO = Object.freeze({
  /**
   * Class C: the category slider's eruption jets, vent diameter, exit velocity and gas temperature. A Kīlauea-type lava
   * fountain (fissure 8, 2018, studied with jet-noise scaling by Gestrich et al. 2022), a sub-Plinian and a Plinian jet
   * (Mount St. Helens and Tungurahua, Matoza et al. 2009). Ash loading is not in Tam's data.
   */
  categories: Object.freeze([
    Object.freeze({ key: 'strombolian', label: 'Strombolian', ventDiameterMetres: 12, ventVelocityMetresPerSecond: 60, gasTemperatureKelvin: 1100, eruption: Object.freeze({ burstsPercent: 100, pulsePeriodSeconds: 9, pulseDepthPercent: 33, burstSeconds: 1 }) }),
    Object.freeze({ key: 'fountain', label: 'Lava fountain', ventDiameterMetres: 15, ventVelocityMetresPerSecond: 60, gasTemperatureKelvin: 1300, eruption: Object.freeze({ burstsPercent: 0, pulsePeriodSeconds: 8, pulseDepthPercent: 30 }) }),
    Object.freeze({ key: 'subplinian', label: 'Sub-Plinian', ventDiameterMetres: 40, ventVelocityMetresPerSecond: 150, gasTemperatureKelvin: 1000, eruption: Object.freeze({ burstsPercent: 0, pulsePeriodSeconds: 8, pulseDepthPercent: 30 }) }),
    Object.freeze({ key: 'plinian', label: 'Plinian', ventDiameterMetres: 100, ventVelocityMetresPerSecond: 250, gasTemperatureKelvin: 1000, eruption: Object.freeze({ burstsPercent: 0, pulsePeriodSeconds: 8, pulseDepthPercent: 30 }) })
  ]),
  /** Class C: the mixing noise is placed this many vent diameters above the vent, near the end of the jet's potential core. */
  sourceDiameters: 5,
  /**
   * Decision 5, B: the vent's smaller jets and shear layers as a second Tam jet of this share of the vent's diameter at
   * the same velocity, this many dB above its own level (C), fitted so a lava fountain at 1 km follows the owner's Mount
   * Yasur recording's octaves from 31.5 Hz to 1 kHz within 2.4 dB rms (source spectra at 90° with air absorption).
   */
  ventJets: Object.freeze({ diameterShare: .1, decibels: 6 }),
  /** Class C: an eruption's slow pulsing modulates its exit velocity sinusoidally with a seeded phase wander. */
  pulseWander: .3,
  /**
   * Class C, from the owner's Mount Yasur recording: Strombolian bursts come at gaps of 0.5–1.5 pulse periods (Yasur 4.1–13.1 s
   * about a 9.4 s median), last a lognormal length about the burst length (median 1.1 s, 90 % under 6.2 s), and rise in
   * 0.3 s (0.1–0.45 s); a burst falls over half its length. The Strombolian category's 33 % depth puts its rendered 1 s
   * levels at 1 km at +13 dB (90th percentile) and +20 dB (most) over their median, as Yasur's +14 and +20 dB.
   */
  bursts: Object.freeze({ gapSpread: .5, lengthSigma: .8, riseSeconds: .3 }),
  defaultEruption: Object.freeze({ eruptionSeconds: 120, riseSeconds: 10, fadeSeconds: 20, pulsePeriodSeconds: 8, pulseDepthPercent: 30, burstsPercent: 0, burstSeconds: 1 })
});
