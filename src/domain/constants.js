export * from '../shared/domain/constants.js';

export const APP_VERSION = '0.1.0';

export const MODEL_VERSION = '0.1.0';

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

export const ENGINE = Object.freeze({
  /** Class B: hot exhaust gas, γ and c_p of combustion products. */
  gasGamma: 1.33,
  gasHeatCapacityJoulesPerKilogramKelvin: 1150,
  /**
   * Class C: assumed settings of a single-engine fighter. The nozzle is about 1 m across and changes with power
   * (F-35, Gee, Neilsen & Wall 2013); afterburning gas reaches about 2 100 K (F404-GE-400 exhaust survey, NASA, NTRS 19880010923).
   */
  settings: Object.freeze([
    Object.freeze({ power: 0, label: 'Idle', pressureRatio: 1.3, totalTemperatureKelvin: 550, diameterMetres: .8 }),
    Object.freeze({ power: .75, label: 'Military', pressureRatio: 3.5, totalTemperatureKelvin: 750, diameterMetres: .9 }),
    Object.freeze({ power: 1, label: 'Afterburner', pressureRatio: 4, totalTemperatureKelvin: 1900, diameterMetres: 1.05 })
  ])
});

export const ROCKET = Object.freeze({
  /** Class B: Mathews 2025 eq. 6.4 (SATURN, Atlas V within 1 km), dB per unit Sr = f D_eff / U_e re W_OA; peak Sr 0.0108, matching Falcon 9 (Kellison et al. 2026). */
  spectrum: Object.freeze({ lowBreak: 3.6e-3, highBreak: 4.8e-2, peakStrouhal: .0108 }),
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
  /** Class B: no intermittency; the owner's unlimited Starship recording 7 has kurtosis 3.0 at 7.7 km, as Gaussian noise. */
  kurtosis: 3,
  packetCycles: 4,
  /** Class B: liquid engines are held down until running, SpaceX's T0 3 s after ignition (Hart et al. 2025); solid motors lift off at ignition. */
  holdSeconds: 3,
  /** Class C: the spectrum opens from low to high frequencies over about 1.2 s at ignition (owner's Starship recordings 4 and 7). */
  ignitionSeconds: 1.2,
  ignitionCornerHz: Object.freeze([10, 20000]),
  /** Class C: frequencies whose source has not yet left the flame deflector (Mathews 2025, plume emergence) radiate without directivity, this much weaker. */
  padLossDecibels: 6,
  /** Class B: water deluge reduces launch noise by 3–5 dB (Gee, Lubert & James 2024), applied to the pad phase. */
  waterDecibels: 4,
  /** Class C: pitch kick and throttle ramps take this long. */
  pitchKickSeconds: 4,
  throttleRampSeconds: 3,
  integrationSeconds: .02,
  /** Echoes and scattering arrive after the direct sound; the ascent ends this much before the render's span would. */
  renderMarginSeconds: 40,
  gravity: 9.80665,
  /**
   * Exhaust velocity by propellant, class B: solid RSRM ≈ 2 500 m/s and GEM 63XL ≈ 2 470 m/s; kerosene Merlin 1D 2 984 m/s
   * (Kellison et al. 2026); methane Raptor 2 3 414 m/s (Gee et al. 2025) and BE-4 ≈ 3 180 m/s; hydrogen near the top of
   * the typical 2 400–4 000 m/s (Lubert et al. 2022, table I). Liftoff thrust-to-weight, class C.
   */
  propellants: Object.freeze({
    solid: Object.freeze({ label: 'Solid', exitVelocityMetresPerSecond: 2500, thrustToWeight: 3 }),
    kerosene: Object.freeze({ label: 'Kerosene', exitVelocityMetresPerSecond: 2984, thrustToWeight: 1.36 }),
    methane: Object.freeze({ label: 'Methane', exitVelocityMetresPerSecond: 3300, thrustToWeight: 1.45 }),
    hydrogen: Object.freeze({ label: 'Hydrogen', exitVelocityMetresPerSecond: 4000, thrustToWeight: 1.3 })
  }),
  /**
   * Class C: sizing from total thrust. The exit diameter grows as √F (the same chamber pressure and expansion), its
   * factor the geometric mean of Merlin 1D, Raptor 2, RD-180, Alpha, SRTM and GEM-60 (0.30–1.43 m, within 30 %).
   * Burn time from a hobby motor's 2 s to a first stage's 150 s. Water on pads for vehicles of 1 MN and more.
   */
  sizing: Object.freeze({
    diameterPerRootNewton: 9.2e-4,
    burnSeconds: Object.freeze([Object.freeze([10, 2]), Object.freeze([1e3, 5]), Object.freeze([1e5, 60]), Object.freeze([1e6, 120]), Object.freeze([7e6, 150])]),
    waterFromNewtons: 1e6,
    totalNewtons: Object.freeze([10, 1e8])
  }),
  /** Class C: an ascent's schedule for every size; the throttle-down follows Falcon 9's webcast telemetry (47–65 s at about 75 %). */
  defaultAscent: Object.freeze({ pitchKickAtSeconds: 10, pitchKickDegrees: 1, throttleDownSeconds: 47, throttleUpSeconds: 65, throttlePercent: 75 })
});
