/**
 * Session templates ("day types") and splits.
 *
 * A split is an ordered queue of day types. The user moves through it one completed session
 * at a time, so skipped calendar days never lose structure.
 *
 * Slots name candidate movements. Core lifts (rotate: false) always use candidates[0];
 * accessories (rotate: true) cycle through their candidates block by block.
 */

import type { Focus, Frequency, Scheme, SlotRole, WeakPoint, WodFormat } from './types';

export interface SlotTemplate {
  id: string;
  candidates: string[];
  role: SlotRole;
  scheme: Scheme;
  /** 1 = never dropped; higher numbers are trimmed first when time is short. */
  priority: number;
  /** Superset group letter; slots sharing a letter are performed as a superset/giant set. */
  group?: string;
  rotate?: boolean;
  /** Off-season tempo (eccentric-pause-concentric-pause). */
  tempo?: string;
  weakPoint?: WeakPoint;
  /** Included only while this weak point is the block's spotlight. */
  spotlightOnly?: boolean;
  /** Override the default rep range for hypertrophy work. */
  repRange?: [number, number];
  /** May receive an intensity technique late in an off-season block. */
  techniqueEligible?: boolean;
}

export type ConditioningEmphasis =
  | 'short-intense'
  | 'mixed'
  | 'aerobic'
  | 'erg-intervals'
  | 'gymnastics'
  | 'barbell-cycling'
  | 'long-mixed';

export interface ConditioningSpec {
  emphasis: ConditioningEmphasis;
  formats: WodFormat[];
  minutes: [number, number];
  /** 1 = the conditioning is the point of the day, never dropped for time. */
  priority: number;
}

export interface DayTemplate {
  id: string;
  title: string;
  subtitle: string;
  region: 'upper' | 'lower' | 'full' | 'engine';
  slots: SlotTemplate[];
  conditioning?: ConditioningSpec;
}

// Candidate lists. Ordering differs between days so the same block uses different variants.
const LATERALS_A = ['cable-lateral-raise', 'db-lateral-raise', 'lean-away-lateral-raise', 'machine-lateral-raise'];
const LATERALS_B = ['machine-lateral-raise', 'cable-y-raise', 'seated-db-lateral-raise', 'cable-upright-row'];
const LATERALS_C = ['db-lateral-raise', 'cable-lateral-raise', 'lu-raise', 'cable-y-raise'];
const REAR_A = ['reverse-pec-deck', 'cable-rear-delt-fly', 'chest-supported-rear-delt-raise'];
const REAR_B = ['face-pull', 'rear-delt-row', 'cable-rear-delt-fly'];
const UPPER_FLY = ['low-to-high-cable-fly', 'incline-db-fly'];
const INCLINE_SECONDARY = ['incline-db-press', 'low-incline-db-press', 'incline-machine-press', 'incline-smith-press'];
const HIGH_INCLINE = ['high-incline-db-press', 'landmine-press', 'incline-db-press'];
const LAT_ROW = ['single-arm-db-row', 'meadows-row', 'seated-cable-row', 'machine-row'];
const LAT_ISO = ['cable-pullover', 'straight-arm-pulldown', 'db-pullover'];
const PULLDOWN = ['neutral-grip-pulldown', 'single-arm-pulldown', 'lat-pulldown', 'kneeling-single-arm-pulldown'];
const UPPER_BACK_ROW = ['chest-supported-db-row', 'seal-row', 'seated-cable-row'];
const DIP_OR_PRESS = ['weighted-dip', 'machine-chest-press', 'db-bench-press'];
const SINGLE_LEG = ['bulgarian-split-squat', 'db-walking-lunge', 'db-step-up', 'front-rack-reverse-lunge'];
const QUAD_SECONDARY = ['hack-squat', 'leg-press', 'pendulum-squat'];
const HAM_CURL = ['seated-leg-curl', 'lying-leg-curl', 'nordic-curl'];
const GLUTE = ['hip-thrust', 'back-extension', 'db-romanian-deadlift'];
const BICEPS = ['incline-db-curl', 'bayesian-cable-curl', 'preacher-curl', 'hammer-curl'];
const TRICEPS = ['overhead-cable-extension', 'ez-skull-crusher', 'rope-pushdown', 'jm-press'];
const CORE = ['cable-crunch', 'ab-wheel', 'hanging-knee-raise', 'pallof-press'];
const CALF = ['standing-calf-raise', 'seated-calf-raise'];

// --------------------------------------------------------------------------- off-season

const OFF_UPPER_PUSH: DayTemplate = {
  id: 'off-upper-press',
  title: 'Upper · Press & Delts',
  subtitle: 'Upper chest and shoulder emphasis',
  region: 'upper',
  slots: [
    { id: 'a', candidates: ['incline-bench-press'], role: 'primary', scheme: 'strength', priority: 1 },
    { id: 'b1', candidates: DIP_OR_PRESS, role: 'secondary', scheme: 'hypertrophy', priority: 2, group: 'B', rotate: true, tempo: '3110' },
    { id: 'b2', candidates: REAR_A, role: 'weak-point', scheme: 'hypertrophy', priority: 2, group: 'B', rotate: true, weakPoint: 'shoulders' },
    { id: 'c1', candidates: LATERALS_A, role: 'weak-point', scheme: 'hypertrophy', priority: 2, group: 'C', rotate: true, weakPoint: 'shoulders', techniqueEligible: true },
    { id: 'c2', candidates: UPPER_FLY, role: 'weak-point', scheme: 'hypertrophy', priority: 2, group: 'C', rotate: true, weakPoint: 'upper-chest', techniqueEligible: true },
    { id: 'd1', candidates: TRICEPS, role: 'accessory', scheme: 'hypertrophy', priority: 3, group: 'D', rotate: true },
    { id: 'd2', candidates: LATERALS_B, role: 'weak-point', scheme: 'hypertrophy', priority: 4, group: 'D', rotate: true, weakPoint: 'shoulders', spotlightOnly: true },
  ],
  conditioning: { emphasis: 'short-intense', formats: ['amrap', 'for-time', 'emom'], minutes: [7, 12], priority: 3 },
};

const OFF_LOWER_SQUAT: DayTemplate = {
  id: 'off-lower-squat',
  title: 'Lower · Squat',
  subtitle: 'Quads, glutes, single-leg strength',
  region: 'lower',
  slots: [
    { id: 'a', candidates: ['back-squat'], role: 'primary', scheme: 'strength', priority: 1 },
    { id: 'b', candidates: SINGLE_LEG, role: 'secondary', scheme: 'hypertrophy', priority: 2, rotate: true, tempo: '3010' },
    { id: 'c1', candidates: HAM_CURL, role: 'accessory', scheme: 'hypertrophy', priority: 3, group: 'C', rotate: true },
    { id: 'c2', candidates: ['leg-extension', 'reverse-nordic'], role: 'accessory', scheme: 'hypertrophy', priority: 3, group: 'C', rotate: true },
    { id: 'd1', candidates: CALF, role: 'accessory', scheme: 'hypertrophy', priority: 4, group: 'D', rotate: true },
    { id: 'd2', candidates: LATERALS_B.slice().reverse(), role: 'weak-point', scheme: 'hypertrophy', priority: 3, group: 'D', rotate: true, weakPoint: 'shoulders' },
    { id: 'd3', candidates: CORE, role: 'accessory', scheme: 'hypertrophy', priority: 4, group: 'D', rotate: true },
  ],
  conditioning: { emphasis: 'mixed', formats: ['amrap', 'emom', 'for-time'], minutes: [8, 14], priority: 3 },
};

const OFF_UPPER_PULL: DayTemplate = {
  id: 'off-upper-pull',
  title: 'Upper · Lats & Back',
  subtitle: 'Lat width with an upper-chest pairing',
  region: 'upper',
  slots: [
    { id: 'a', candidates: ['weighted-pull-up'], role: 'primary', scheme: 'hypertrophy', priority: 1, repRange: [5, 8] },
    { id: 'b1', candidates: LAT_ROW, role: 'weak-point', scheme: 'hypertrophy', priority: 2, group: 'B', rotate: true, weakPoint: 'lats', tempo: '2011' },
    { id: 'b2', candidates: HIGH_INCLINE, role: 'weak-point', scheme: 'hypertrophy', priority: 2, group: 'B', rotate: true, weakPoint: 'upper-chest', tempo: '3010' },
    { id: 'c1', candidates: LAT_ISO, role: 'weak-point', scheme: 'hypertrophy', priority: 2, group: 'C', rotate: true, weakPoint: 'lats', techniqueEligible: true },
    { id: 'c2', candidates: LATERALS_C, role: 'weak-point', scheme: 'hypertrophy', priority: 2, group: 'C', rotate: true, weakPoint: 'shoulders', techniqueEligible: true },
    { id: 'd1', candidates: BICEPS, role: 'accessory', scheme: 'hypertrophy', priority: 3, group: 'D', rotate: true },
    { id: 'd2', candidates: REAR_B, role: 'weak-point', scheme: 'hypertrophy', priority: 3, group: 'D', rotate: true, weakPoint: 'shoulders' },
    { id: 'e', candidates: PULLDOWN, role: 'weak-point', scheme: 'hypertrophy', priority: 4, rotate: true, weakPoint: 'lats', spotlightOnly: true },
  ],
  conditioning: { emphasis: 'erg-intervals', formats: ['intervals'], minutes: [8, 12], priority: 3 },
};

const OFF_LOWER_HINGE: DayTemplate = {
  id: 'off-lower-hinge',
  title: 'Lower · Hinge',
  subtitle: 'Posterior chain and quad volume',
  region: 'lower',
  slots: [
    { id: 'a', candidates: ['deadlift'], role: 'primary', scheme: 'strength', priority: 1 },
    { id: 'b1', candidates: QUAD_SECONDARY, role: 'secondary', scheme: 'hypertrophy', priority: 2, group: 'B', rotate: true, tempo: '3110' },
    { id: 'b2', candidates: GLUTE, role: 'accessory', scheme: 'hypertrophy', priority: 3, group: 'B', rotate: true },
    { id: 'c1', candidates: HAM_CURL.slice().reverse(), role: 'accessory', scheme: 'hypertrophy', priority: 3, group: 'C', rotate: true },
    { id: 'c2', candidates: REAR_B.slice().reverse(), role: 'weak-point', scheme: 'hypertrophy', priority: 3, group: 'C', rotate: true, weakPoint: 'shoulders' },
    { id: 'c3', candidates: ['toes-to-bar', 'ghd-sit-up', 'ab-wheel'], role: 'accessory', scheme: 'hypertrophy', priority: 4, group: 'C', rotate: true },
  ],
  conditioning: { emphasis: 'barbell-cycling', formats: ['for-time', 'amrap', 'chipper'], minutes: [10, 15], priority: 3 },
};

const OFF_ENGINE_DELTS: DayTemplate = {
  id: 'off-engine-delts',
  title: 'Engine · Shoulders',
  subtitle: 'Aerobic intervals, then a delt and upper-chest pump',
  region: 'engine',
  slots: [
    { id: 'a1', candidates: LATERALS_B, role: 'weak-point', scheme: 'hypertrophy', priority: 2, group: 'A', rotate: true, weakPoint: 'shoulders', techniqueEligible: true },
    { id: 'a2', candidates: REAR_B.slice().reverse(), role: 'weak-point', scheme: 'hypertrophy', priority: 2, group: 'A', rotate: true, weakPoint: 'shoulders' },
    { id: 'a3', candidates: UPPER_FLY.slice().reverse(), role: 'weak-point', scheme: 'hypertrophy', priority: 2, group: 'A', rotate: true, weakPoint: 'upper-chest' },
    { id: 'b', candidates: PULLDOWN, role: 'weak-point', scheme: 'hypertrophy', priority: 3, rotate: true, weakPoint: 'lats' },
  ],
  conditioning: { emphasis: 'aerobic', formats: ['intervals', 'emom'], minutes: [20, 30], priority: 1 },
};

const OFF_GYMNASTICS_ARMS: DayTemplate = {
  id: 'off-gymnastics-arms',
  title: 'Gymnastics · Arms',
  subtitle: 'Bar and ring skill, then arms and delts',
  region: 'upper',
  slots: [
    { id: 'a1', candidates: ['ring-dip', 'bar-dip'], role: 'secondary', scheme: 'hypertrophy', priority: 2, group: 'A', rotate: true, repRange: [8, 15] },
    { id: 'a2', candidates: ['chin-up', 'pull-up'], role: 'weak-point', scheme: 'hypertrophy', priority: 2, group: 'A', rotate: true, weakPoint: 'lats', repRange: [6, 10] },
    { id: 'b1', candidates: LATERALS_C.slice().reverse(), role: 'weak-point', scheme: 'hypertrophy', priority: 2, group: 'B', rotate: true, weakPoint: 'shoulders' },
    { id: 'b2', candidates: BICEPS.slice().reverse(), role: 'accessory', scheme: 'hypertrophy', priority: 3, group: 'B', rotate: true },
    { id: 'b3', candidates: TRICEPS.slice().reverse(), role: 'accessory', scheme: 'hypertrophy', priority: 3, group: 'B', rotate: true },
  ],
  conditioning: { emphasis: 'gymnastics', formats: ['emom', 'amrap'], minutes: [10, 14], priority: 2 },
};

const OFF_FULL_A: DayTemplate = {
  id: 'off-full-a',
  title: 'Full Body · Squat',
  subtitle: 'Squat strength, lats and delts',
  region: 'full',
  slots: [
    { id: 'a', candidates: ['back-squat'], role: 'primary', scheme: 'strength', priority: 1 },
    { id: 'b1', candidates: INCLINE_SECONDARY, role: 'weak-point', scheme: 'hypertrophy', priority: 2, group: 'B', rotate: true, weakPoint: 'upper-chest', tempo: '3010' },
    { id: 'b2', candidates: PULLDOWN, role: 'weak-point', scheme: 'hypertrophy', priority: 2, group: 'B', rotate: true, weakPoint: 'lats' },
    { id: 'c1', candidates: LATERALS_A, role: 'weak-point', scheme: 'hypertrophy', priority: 2, group: 'C', rotate: true, weakPoint: 'shoulders', techniqueEligible: true },
    { id: 'c2', candidates: HAM_CURL, role: 'accessory', scheme: 'hypertrophy', priority: 3, group: 'C', rotate: true },
    { id: 'c3', candidates: REAR_A, role: 'weak-point', scheme: 'hypertrophy', priority: 4, group: 'C', rotate: true, weakPoint: 'shoulders', spotlightOnly: true },
  ],
  conditioning: { emphasis: 'short-intense', formats: ['amrap', 'for-time'], minutes: [7, 10], priority: 3 },
};

const OFF_FULL_B: DayTemplate = {
  id: 'off-full-b',
  title: 'Full Body · Press',
  subtitle: 'Incline strength, posterior chain, lats',
  region: 'full',
  slots: [
    { id: 'a', candidates: ['incline-bench-press'], role: 'primary', scheme: 'strength', priority: 1 },
    { id: 'b1', candidates: ['romanian-deadlift', 'db-romanian-deadlift', 'single-leg-rdl'], role: 'secondary', scheme: 'hypertrophy', priority: 2, group: 'B', rotate: true, tempo: '3110' },
    { id: 'b2', candidates: LAT_ROW, role: 'weak-point', scheme: 'hypertrophy', priority: 2, group: 'B', rotate: true, weakPoint: 'lats' },
    { id: 'c1', candidates: LATERALS_C, role: 'weak-point', scheme: 'hypertrophy', priority: 2, group: 'C', rotate: true, weakPoint: 'shoulders', techniqueEligible: true },
    { id: 'c2', candidates: UPPER_FLY, role: 'weak-point', scheme: 'hypertrophy', priority: 3, group: 'C', rotate: true, weakPoint: 'upper-chest' },
    { id: 'c3', candidates: LAT_ISO, role: 'weak-point', scheme: 'hypertrophy', priority: 4, group: 'C', rotate: true, weakPoint: 'lats', spotlightOnly: true },
  ],
  conditioning: { emphasis: 'erg-intervals', formats: ['intervals'], minutes: [8, 12], priority: 3 },
};

const OFF_FULL_C: DayTemplate = {
  id: 'off-full-c',
  title: 'Full Body · Pull',
  subtitle: 'Hinge strength, weighted pulls, arms',
  region: 'full',
  slots: [
    { id: 'a', candidates: ['deadlift'], role: 'primary', scheme: 'strength', priority: 1 },
    { id: 'b1', candidates: ['weighted-pull-up'], role: 'weak-point', scheme: 'hypertrophy', priority: 2, group: 'B', weakPoint: 'lats', repRange: [5, 8] },
    { id: 'b2', candidates: HIGH_INCLINE, role: 'weak-point', scheme: 'hypertrophy', priority: 2, group: 'B', rotate: true, weakPoint: 'upper-chest' },
    { id: 'c1', candidates: LATERALS_B, role: 'weak-point', scheme: 'hypertrophy', priority: 2, group: 'C', rotate: true, weakPoint: 'shoulders' },
    { id: 'c2', candidates: REAR_B, role: 'weak-point', scheme: 'hypertrophy', priority: 3, group: 'C', rotate: true, weakPoint: 'shoulders' },
    { id: 'c3', candidates: BICEPS, role: 'accessory', scheme: 'hypertrophy', priority: 4, group: 'C', rotate: true },
  ],
  conditioning: { emphasis: 'mixed', formats: ['amrap', 'emom'], minutes: [10, 14], priority: 3 },
};

// --------------------------------------------------------------------------- competition

const COMP_SNATCH_SQUAT: DayTemplate = {
  id: 'comp-snatch-squat',
  title: 'Snatch · Squat',
  subtitle: 'Snatch technique under load, back squat strength',
  region: 'full',
  slots: [
    { id: 'a', candidates: ['snatch'], role: 'primary', scheme: 'olympic', priority: 1 },
    { id: 'b', candidates: ['back-squat'], role: 'primary', scheme: 'strength', priority: 1 },
    { id: 'c1', candidates: LATERALS_A, role: 'weak-point', scheme: 'hypertrophy', priority: 3, group: 'C', rotate: true, weakPoint: 'shoulders' },
    { id: 'c2', candidates: REAR_A, role: 'weak-point', scheme: 'hypertrophy', priority: 3, group: 'C', rotate: true, weakPoint: 'shoulders' },
  ],
  conditioning: { emphasis: 'short-intense', formats: ['for-time', 'amrap'], minutes: [6, 12], priority: 2 },
};

const COMP_CJ_PRESS: DayTemplate = {
  id: 'comp-cj-press',
  title: 'Clean & Jerk · Press',
  subtitle: 'C&J, incline strength, pulling',
  region: 'upper',
  slots: [
    { id: 'a', candidates: ['clean-and-jerk'], role: 'primary', scheme: 'olympic', priority: 1 },
    { id: 'b', candidates: ['incline-bench-press'], role: 'secondary', scheme: 'strength', priority: 2 },
    { id: 'c1', candidates: ['weighted-pull-up'], role: 'weak-point', scheme: 'hypertrophy', priority: 2, group: 'C', weakPoint: 'lats', repRange: [4, 8] },
    { id: 'c2', candidates: LATERALS_C, role: 'weak-point', scheme: 'hypertrophy', priority: 3, group: 'C', rotate: true, weakPoint: 'shoulders' },
  ],
  conditioning: { emphasis: 'gymnastics', formats: ['amrap', 'emom', 'for-time'], minutes: [8, 14], priority: 2 },
};

const COMP_HINGE_ENGINE: DayTemplate = {
  id: 'comp-hinge-engine',
  title: 'Pull · Engine',
  subtitle: 'Deadlift strength and threshold intervals',
  region: 'lower',
  slots: [
    { id: 'a', candidates: ['deadlift'], role: 'primary', scheme: 'strength', priority: 1 },
    { id: 'b1', candidates: LAT_ROW, role: 'weak-point', scheme: 'hypertrophy', priority: 3, group: 'B', rotate: true, weakPoint: 'lats' },
    { id: 'b2', candidates: UPPER_FLY, role: 'weak-point', scheme: 'hypertrophy', priority: 3, group: 'B', rotate: true, weakPoint: 'upper-chest' },
  ],
  conditioning: { emphasis: 'erg-intervals', formats: ['intervals'], minutes: [14, 20], priority: 1 },
};

const COMP_MIXED: DayTemplate = {
  id: 'comp-mixed',
  title: 'Front Squat · Long WOD',
  subtitle: 'Front squat, then a longer mixed-modal piece',
  region: 'full',
  slots: [
    { id: 'a', candidates: ['front-squat'], role: 'primary', scheme: 'strength', priority: 1 },
    { id: 'b1', candidates: HIGH_INCLINE, role: 'weak-point', scheme: 'hypertrophy', priority: 3, group: 'B', rotate: true, weakPoint: 'upper-chest' },
    { id: 'b2', candidates: LATERALS_B, role: 'weak-point', scheme: 'hypertrophy', priority: 3, group: 'B', rotate: true, weakPoint: 'shoulders' },
  ],
  conditioning: { emphasis: 'long-mixed', formats: ['for-time', 'amrap', 'chipper'], minutes: [15, 22], priority: 1 },
};

const COMP_OLY_TECH: DayTemplate = {
  id: 'comp-oly-tech',
  title: 'Oly Positions · Cycling',
  subtitle: 'Hang positions, overhead stability, barbell cycling',
  region: 'full',
  slots: [
    { id: 'a', candidates: ['hang-snatch', 'snatch-balance', 'hang-power-snatch'], role: 'primary', scheme: 'olympic', priority: 1, rotate: true },
    { id: 'b', candidates: ['hang-clean', 'split-jerk', 'power-clean'], role: 'secondary', scheme: 'olympic', priority: 2, rotate: true },
    { id: 'c', candidates: ['overhead-squat'], role: 'accessory', scheme: 'olympic', priority: 3 },
  ],
  conditioning: { emphasis: 'barbell-cycling', formats: ['emom', 'for-time'], minutes: [10, 14], priority: 2 },
};

const COMP_ENGINE_GYM: DayTemplate = {
  id: 'comp-engine-gym',
  title: 'Gymnastics · Aerobic',
  subtitle: 'Gymnastics capacity and aerobic base',
  region: 'engine',
  slots: [
    { id: 'a1', candidates: PULLDOWN, role: 'weak-point', scheme: 'hypertrophy', priority: 3, group: 'A', rotate: true, weakPoint: 'lats' },
    { id: 'a2', candidates: LATERALS_C, role: 'weak-point', scheme: 'hypertrophy', priority: 3, group: 'A', rotate: true, weakPoint: 'shoulders' },
    { id: 'a3', candidates: UPPER_BACK_ROW, role: 'accessory', scheme: 'hypertrophy', priority: 4, group: 'A', rotate: true },
  ],
  conditioning: { emphasis: 'aerobic', formats: ['intervals', 'emom'], minutes: [24, 32], priority: 1 },
};

// --------------------------------------------------------------------------- splits

export const DAY_TEMPLATES: Record<string, DayTemplate> = Object.fromEntries(
  [
    OFF_UPPER_PUSH,
    OFF_LOWER_SQUAT,
    OFF_UPPER_PULL,
    OFF_LOWER_HINGE,
    OFF_ENGINE_DELTS,
    OFF_GYMNASTICS_ARMS,
    OFF_FULL_A,
    OFF_FULL_B,
    OFF_FULL_C,
    COMP_SNATCH_SQUAT,
    COMP_CJ_PRESS,
    COMP_HINGE_ENGINE,
    COMP_MIXED,
    COMP_OLY_TECH,
    COMP_ENGINE_GYM,
  ].map((d) => [d.id, d]),
);

export const SPLITS: Record<Focus, Record<Frequency, string[]>> = {
  'off-season': {
    3: ['off-full-a', 'off-full-b', 'off-full-c'],
    4: ['off-upper-press', 'off-lower-squat', 'off-upper-pull', 'off-lower-hinge'],
    5: ['off-upper-press', 'off-lower-squat', 'off-engine-delts', 'off-upper-pull', 'off-lower-hinge'],
    6: ['off-upper-press', 'off-lower-squat', 'off-gymnastics-arms', 'off-upper-pull', 'off-lower-hinge', 'off-engine-delts'],
  },
  competition: {
    3: ['comp-snatch-squat', 'comp-cj-press', 'comp-hinge-engine'],
    4: ['comp-snatch-squat', 'comp-cj-press', 'comp-hinge-engine', 'comp-mixed'],
    5: ['comp-snatch-squat', 'comp-cj-press', 'comp-hinge-engine', 'comp-oly-tech', 'comp-mixed'],
    6: ['comp-snatch-squat', 'comp-cj-press', 'comp-engine-gym', 'comp-hinge-engine', 'comp-oly-tech', 'comp-mixed'],
  },
};

export function splitFor(focus: Focus, frequency: Frequency): DayTemplate[] {
  return SPLITS[focus][frequency].map((id) => DAY_TEMPLATES[id]);
}

export function slotKey(dayId: string, slotId: string): string {
  return `${dayId}:${slotId}`;
}
