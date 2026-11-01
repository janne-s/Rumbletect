export * from '../shared/domain/constants.js';

export const APP_VERSION = '0.2.0';

export const MODEL_VERSION = '0.3.0';

export const TRACK_MARKS = Object.freeze({ barrierPixels: 4, turnRadius: 3 });

export const JET = Object.freeze({
  /** Class B: Tam, Golebiowski & Seiner 1996, eqs. 2 and 7–10; M_j 1.37–2.0, T_r/T∞ 0.98–4.89. */
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
  /** Class C fit to class B peaks: F-35AA and F-22A at military power (Gee, Neilsen & Wall 2013). */
  /** Class B: Khavaran & Bridges 2009 fig. 2.1, 50–165°, M_a 0.5–1.4. */
  levelReferenceDiameterMetres: .0712,
  /** Class C: crackle needs supersonic convection (Ffowcs Williams et al. 1975). */
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
  /** Class C: at most fivefold at the Mach cone’s caustic. */
  smallestCompression: .04,
  /** Class C: with an automatic flight time the jet flies on until each microphone is this far below its closest approach, by spreading. */
  hearingDecibels: 30
});

/** Class B: Stone, Krejsa & Clark 2003, static model-scale jets; the flight term is theory. */
export const SHOCK_NOISE = Object.freeze({
  levelDecibels: 158,
  convectionShare: .7,
  convectionSpread: .04,
  flightDecibels: 40,
  aftFallDecibelsPerDegree: .75,
  /** Stone’s Table VII, reproduced from log S = −3.6 to 2. */
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

/** Class C: fitted to Falcon 9 (Kellison et al. 2026). */
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

/** Class C fit to class B data (ANP 2.3 NPD; Heidmann 1975): Doc/reviews/2026-10-21-airliner-reference.md. */
const CIVIL_FLIGHT = Object.freeze({ mach: .25, heightMetres: 300 });
/** Class C: below the departure rows the speed law is not extrapolated past this drop from full speed, about where ANP's approach rows leave the fan. */
const CIVIL_FAN_QUIETEST_DECIBELS = 30;
const HEIDMANN_BROADBAND = Object.freeze({ humpCentre: 2.5, humpOctaves: Math.log2(2.2) });
const civilFan = (offset, speedExponent, knee = null) => Object.freeze({ harmonics: Object.freeze([0, -6]), fullToneDecibels: offset, fullHumpDecibels: 3 + offset, speedExponent, knee, quietestDecibels: CIVIL_FAN_QUIETEST_DECIBELS, ...HEIDMANN_BROADBAND, buzzSaw: Object.freeze({ fromSpeed: .85, decibels: 3 + offset, orderSpread: .6 }) });
/** Class C fit to class B data (ANP 2.3 GE90-115B departure rows), decision 15. */
const WIDEBODY_KNEE = Object.freeze({ fromSpeed: .84, decibels: 7 });

/** Class B within Fink’s data (FAA-RD-77-29; ANOPP, NASA TM-83199). */
export const AIRFRAME = Object.freeze({
  trailingEdgeConstant: Object.freeze({ conventional: 4.464e-5, clean: 7.075e-6 }),
  flapConstant: Object.freeze({ slotted: 2.787e-4, triple: 3.509e-4 }),
  wheelConstant: Object.freeze({ two: 4.349e-4, four: 3.414e-4 }),
  strutConstant: 2.753e-4,
  /** Class C: the convective factor's base is held above this, as near grazing ahead it would grow without bound. */
  smallestConvection: .2
});

/** Class B published dimensions; tails, flaps, and struts class C. */
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
  /** Class C: settings through the ideal nozzle; decision 4. */
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
    /** Class C: a single-engine fighter (F-35; F404 exhaust survey). */
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
  /** Class B: Mathews 2025 eq. 6.4 (SATURN, Atlas V within 1 km). */
  spectrum: Object.freeze({ lowBreak: 3.6e-3, highBreak: 4.8e-2, peakStrouhal: .0108 }),
  /** Class B: a single nozzle peaks at Sr 0.02–0.025 (SP-8072; Gee et al. 2010). */
  singleNozzlePeakStrouhal: .024,
  /** Class B: Mathews 2025 eq. 6.6, GEM-60 intensity, s = 9.85 Sr^−0.21 D_eff behind the nozzle. */
  sourceLocation: Object.freeze({ coefficient: 9.85, exponent: -.21 }),
  /** Class B: SATURN and Kellison et al. 2026 take their directivity with the source 18 D_eff behind the nozzle. */
  sourceDiameters: 18,
  /** Class B: SATURN's table is reliable to its edge; its last degrees fall off as a boundary artefact. */
  directivityEdgeDegrees: 84,
  /** Class C: Hart, Gee & Cook 2023 fig. 8 forward of the table. */
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
  /** Class C: fitted to the owner’s Starship recordings. */
  shockShare: .3,
  /** Class B: no intermittency; the owner's unlimited Starship recording 7 has kurtosis 3.0 at 7.7 km, as Gaussian noise. */
  kurtosis: 3,
  packetCycles: 4,
  /** Class B: liquid engines are held down until running, SpaceX's T0 3 s after ignition (Hart et al. 2025); solid motors lift off at ignition. */
  holdSeconds: 3,
  /** Class C: from the owner’s recordings 2, 3, 4, 7 and 10. */
  ignitionSecondsPerEngine: .0375,
  shortestIgnitionSeconds: .005,
  ignitionCornerHz: Object.freeze([10, 20000]),
  /** Class B shape (Ryan et al. 1981), class C level and length; decision 19. */
  ignitionPulse: Object.freeze({
    peakPerSteady: Object.freeze({ solid: 4, liquid: .33 }),
    secondsPerMetre: Object.freeze({ solid: .0058, liquid: .025 }),
    shortestSeconds: .0005,
    decay: 1,
    linearPressureShare: .04,
    offDecibels: -60
  }),
  /** Class C, decision 19: fitted to recordings 2 and 10. */
  ignitionBurst: Object.freeze({ decibels: 13.5, offDecibels: -60 }),
  /** Class C: frequencies whose source has not yet left the flame deflector (Mathews 2025, plume emergence) radiate without directivity, this much weaker. */
  padLossDecibels: 6,
  /** Class B: water deluge reduces launch noise by 3–5 dB (Gee, Lubert & James 2024), applied to the pad phase. */
  waterDecibels: 4,
  throttleRampSeconds: 3,
  /** Class C, decision 9: the rocket equation’s shape. */
  lateAccelerationFraction: .97,
  pathSeconds: .05,
  /** Class B for the Grad; C_D and the rest class C. */
  coast: Object.freeze({ burntDensityKilogramsPerCubicMetre: 1370, dragCoefficient: .35, seconds: 120 }),
  renderMarginSeconds: 40,
  /** Class B per propellant (Kellison et al. 2026; Gee et al. 2025; Lubert et al. 2022). */
  propellants: Object.freeze({
    solid: Object.freeze({ label: 'Solid', exitVelocityMetresPerSecond: 2500 }),
    kerosene: Object.freeze({ label: 'Kerosene', exitVelocityMetresPerSecond: 2984 }),
    methane: Object.freeze({ label: 'Methane', exitVelocityMetresPerSecond: 3300 }),
    hydrogen: Object.freeze({ label: 'Hydrogen', exitVelocityMetresPerSecond: 4000 })
  }),
  /** Class C: exit diameter grows as √F, within 30 % of six engines. */
  sizing: Object.freeze({
    diameterPerRootNewton: 9.2e-4,
    /** Class C: a small solid motor’s exit is 70 % of its body. */
    smallSolidDiameterPerRootNewton: 6e-4,
    smallSolidNewtons: Object.freeze([3e5, 3e6]),
    burnSeconds: Object.freeze([Object.freeze([10, 2]), Object.freeze([1e3, 5]), Object.freeze([1e5, 60]), Object.freeze([1e6, 120]), Object.freeze([7e6, 150])]),
    waterFromNewtons: 1e6,
    totalNewtons: Object.freeze([10, 1e8])
  }),
  /** Medium and super-heavy class B, the rest class C; ascents fitted to Falcon 9 telemetry (decision 9). */
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
  /** Class C: Falcon 9 webcast telemetry. */
  defaultAscent: Object.freeze({ turnStartPercent: 1, turnLengthPercent: 30, throttleDownSeconds: 47, throttleUpSeconds: 65, throttlePercent: 75 }),
  /** Class C: laid out as Boomtect’s barrage. */
  salvoJitter: .15,
  salvoLayout: Object.freeze({ roundCount: 40, salvoSize: 1, salvoSeconds: 20, salvoSpreadSeconds: 0, launcherRadiusMetres: 2, headingSpreadDegrees: 2, launchSpreadDegrees: 1, thrustSpreadPercent: 5 })
});

export const VOLCANO = Object.freeze({
  /** Class C: Gestrich et al. 2022; Matoza et al. 2009. */
  categories: Object.freeze([
    Object.freeze({ key: 'strombolian', label: 'Strombolian', ventDiameterMetres: 12, ventVelocityMetresPerSecond: 60, gasTemperatureKelvin: 1100, eruption: Object.freeze({ burstsPercent: 100, pulsePeriodSeconds: 9, pulseDepthPercent: 33, burstSeconds: 1 }) }),
    Object.freeze({ key: 'fountain', label: 'Lava fountain', ventDiameterMetres: 15, ventVelocityMetresPerSecond: 60, gasTemperatureKelvin: 1300, eruption: Object.freeze({ burstsPercent: 0, pulsePeriodSeconds: 8, pulseDepthPercent: 30 }) }),
    Object.freeze({ key: 'subplinian', label: 'Sub-Plinian', ventDiameterMetres: 40, ventVelocityMetresPerSecond: 150, gasTemperatureKelvin: 1000, eruption: Object.freeze({ burstsPercent: 0, pulsePeriodSeconds: 8, pulseDepthPercent: 30 }) }),
    Object.freeze({ key: 'plinian', label: 'Plinian', ventDiameterMetres: 100, ventVelocityMetresPerSecond: 250, gasTemperatureKelvin: 1000, eruption: Object.freeze({ burstsPercent: 0, pulsePeriodSeconds: 8, pulseDepthPercent: 30 }) })
  ]),
  /** Class C: the mixing noise is placed this many vent diameters above the vent, near the end of the jet's potential core. */
  sourceDiameters: 5,
  /** Class B structure, class C level, decision 5: Mount Yasur recording within 2.4 dB rms. */
  ventJets: Object.freeze({ diameterShare: .1, decibels: 6 }),
  /** Class C: an eruption's slow pulsing modulates its exit velocity sinusoidally with a seeded phase wander. */
  pulseWander: .3,
  /** Class C: from the owner’s Mount Yasur recording. */
  bursts: Object.freeze({ gapSpread: .5, lengthSigma: .8, riseSeconds: .3 }),
  defaultEruption: Object.freeze({ eruptionSeconds: 120, riseSeconds: 10, fadeSeconds: 20, pulsePeriodSeconds: 8, pulseDepthPercent: 30, burstsPercent: 0, burstSeconds: 1 })
});
