/**
 * Movement library.
 *
 * Muscle weights: 1 = prime mover (a full hard set), 0.5 = meaningful synergist.
 * Press angles are degrees from horizontal (flat bench = 0, strict press = 90).
 *
 * RAW_MOVEMENTS deliberately includes some banned movements (bottom of the file) so the
 * restriction filter is exercised against real definitions. Only MOVEMENTS (filtered)
 * is ever used for programming, swaps or WODs.
 */

import type { LoadType, Movement, MovementTag, Muscle, OverheadProfile, Pattern } from '../types';
import { isAllowed } from './restrictions';

type Mus = Partial<Record<Muscle, number>>;
type Extra = Partial<Pick<Movement, 'overhead' | 'inverted' | 'anchor' | 'barKg' | 'secPerRep'>>;

function mv(
  id: string,
  name: string,
  pattern: Pattern,
  loadType: LoadType,
  muscles: Mus,
  tags: MovementTag[] = [],
  extra: Extra = {},
): Movement {
  return { id, name, pattern, loadType, muscles, tags, ...extra };
}

const anchor = (movementId: string, ratio: number) => ({ anchor: { movementId, ratio } });
const press = (pressAngleDeg: number): { overhead: OverheadProfile } => ({
  overhead: { pressAngleDeg, kind: 'press' },
});
const ballistic: { overhead: OverheadProfile } = { overhead: { pressAngleDeg: 90, kind: 'ballistic' } };
const support: { overhead: OverheadProfile } = { overhead: { pressAngleDeg: 90, kind: 'support' } };
const hang: { overhead: OverheadProfile } = { overhead: { pressAngleDeg: 90, kind: 'hang' } };

const C: MovementTag = 'compound';
const I: MovementTag = 'isolation';
const U: MovementTag = 'unilateral';
const O: MovementTag = 'olympic';
const G: MovementTag = 'gymnastics';
const L: MovementTag = 'lengthened-bias';
const S: MovementTag = 'skill';
const W: MovementTag = 'wod-friendly';

export const RAW_MOVEMENTS: Movement[] = [
  // ---------------------------------------------------------------- squat
  mv('back-squat', 'Back Squat', 'squat', 'barbell', { quads: 1, glutes: 1, adductors: 0.5 }, [C, W]),
  mv('front-squat', 'Front Squat', 'squat', 'barbell', { quads: 1, glutes: 0.5, 'upper-back': 0.5 }, [C, W], anchor('back-squat', 0.8)),
  mv('pause-back-squat', 'Pause Back Squat', 'squat', 'barbell', { quads: 1, glutes: 1, adductors: 0.5 }, [C], anchor('back-squat', 0.82)),
  mv('safety-bar-squat', 'Safety Bar Squat', 'squat', 'barbell', { quads: 1, glutes: 1, 'upper-back': 0.5 }, [C], { ...anchor('back-squat', 0.88), barKg: 25 }),
  mv('hack-squat', 'Hack Squat', 'squat', 'plate-loaded', { quads: 1, glutes: 0.5 }, [C, L]),
  mv('leg-press', 'Leg Press', 'squat', 'plate-loaded', { quads: 1, glutes: 0.5, adductors: 0.5 }, [C]),
  mv('pendulum-squat', 'Pendulum Squat', 'squat', 'plate-loaded', { quads: 1, glutes: 0.5 }, [C, L]),
  mv('heel-elevated-goblet-squat', 'Heel-Elevated Goblet Squat', 'squat', 'dumbbell', { quads: 1, glutes: 0.5 }, [C, W]),
  mv('air-squat', 'Air Squat', 'squat', 'bodyweight', { quads: 1, glutes: 0.5 }, [W]),

  // ---------------------------------------------------------------- hinge
  mv('deadlift', 'Deadlift', 'hinge', 'barbell', { hamstrings: 1, glutes: 1, 'lower-back': 1, 'upper-back': 0.5, forearms: 0.5 }, [C, W]),
  mv('trap-bar-deadlift', 'Trap Bar Deadlift', 'hinge', 'barbell', { quads: 0.5, hamstrings: 1, glutes: 1, 'lower-back': 0.5 }, [C], { ...anchor('deadlift', 0.95), barKg: 25 }),
  mv('sumo-deadlift', 'Sumo Deadlift', 'hinge', 'barbell', { hamstrings: 0.5, glutes: 1, adductors: 1, 'lower-back': 0.5 }, [C], anchor('deadlift', 0.92)),
  mv('deficit-deadlift', 'Deficit Deadlift', 'hinge', 'barbell', { hamstrings: 1, glutes: 1, 'lower-back': 1 }, [C], anchor('deadlift', 0.88)),
  mv('romanian-deadlift', 'Romanian Deadlift', 'hinge', 'barbell', { hamstrings: 1, glutes: 1, 'lower-back': 0.5 }, [C, L], anchor('deadlift', 0.62)),
  mv('db-romanian-deadlift', 'DB Romanian Deadlift', 'hinge', 'dumbbell', { hamstrings: 1, glutes: 1, 'lower-back': 0.5 }, [C, L], anchor('deadlift', 0.28)),
  mv('single-leg-rdl', 'Single-Leg DB RDL', 'hinge', 'dumbbell', { hamstrings: 1, glutes: 1 }, [C, U, L]),
  mv('good-morning', 'Good Morning', 'hinge', 'barbell', { hamstrings: 1, glutes: 0.5, 'lower-back': 1 }, [C, L], anchor('back-squat', 0.4)),
  mv('back-extension', '45° Back Extension', 'hinge', 'weighted-bodyweight', { glutes: 1, hamstrings: 0.5, 'lower-back': 0.5 }, [I]),
  mv('kb-swing', 'Kettlebell Swing', 'hinge', 'kettlebell', { glutes: 1, hamstrings: 0.5 }, [W]),

  // ---------------------------------------------------------------- lunge / unilateral knee
  mv('bulgarian-split-squat', 'Bulgarian Split Squat', 'lunge', 'dumbbell', { quads: 1, glutes: 1, adductors: 0.5 }, [C, U, L]),
  mv('db-walking-lunge', 'DB Walking Lunge', 'lunge', 'dumbbell', { quads: 1, glutes: 1 }, [C, U, W]),
  mv('front-rack-reverse-lunge', 'Front-Rack Reverse Lunge', 'lunge', 'barbell', { quads: 1, glutes: 1, 'upper-back': 0.5 }, [C, U], anchor('front-squat', 0.45)),
  mv('db-step-up', 'DB Step-Up', 'lunge', 'dumbbell', { quads: 1, glutes: 1 }, [C, U]),
  mv('db-box-step-over', 'DB Box Step-Over', 'lunge', 'dumbbell', { quads: 1, glutes: 0.5 }, [U, W]),
  mv('pistol', 'Pistol', 'lunge', 'bodyweight', { quads: 1, glutes: 0.5 }, [U, G, W, S]),

  // ---------------------------------------------------------------- isolations, legs
  mv('leg-extension', 'Leg Extension', 'knee-iso', 'machine', { quads: 1 }, [I]),
  mv('reverse-nordic', 'Reverse Nordic', 'knee-iso', 'bodyweight', { quads: 1 }, [I, L]),
  mv('seated-leg-curl', 'Seated Leg Curl', 'hamstring-iso', 'machine', { hamstrings: 1 }, [I, L]),
  mv('lying-leg-curl', 'Lying Leg Curl', 'hamstring-iso', 'machine', { hamstrings: 1 }, [I]),
  mv('nordic-curl', 'Nordic Curl', 'hamstring-iso', 'bodyweight', { hamstrings: 1 }, [I, L]),
  mv('glute-ham-raise', 'Glute-Ham Raise', 'hamstring-iso', 'bodyweight', { hamstrings: 1, glutes: 0.5 }, [I]),
  mv('hip-thrust', 'Barbell Hip Thrust', 'glute', 'barbell', { glutes: 1, hamstrings: 0.5 }, [C], anchor('deadlift', 0.8)),
  mv('cable-kickback', 'Cable Glute Kickback', 'glute', 'cable', { glutes: 1 }, [I, U]),
  mv('hip-abduction', 'Hip Abduction Machine', 'glute', 'machine', { glutes: 1 }, [I]),
  mv('standing-calf-raise', 'Standing Calf Raise', 'calf', 'machine', { calves: 1 }, [I, L]),
  mv('seated-calf-raise', 'Seated Calf Raise', 'calf', 'machine', { calves: 1 }, [I]),

  // ---------------------------------------------------------------- horizontal press
  mv('bench-press', 'Bench Press', 'horizontal-press', 'barbell', { chest: 1, triceps: 0.5, 'delts-front': 0.5 }, [C], press(0)),
  mv('paused-bench-press', 'Paused Bench Press', 'horizontal-press', 'barbell', { chest: 1, triceps: 0.5, 'delts-front': 0.5 }, [C], { ...press(0), ...anchor('bench-press', 0.92) }),
  mv('close-grip-bench', 'Close-Grip Bench Press', 'horizontal-press', 'barbell', { triceps: 1, chest: 0.5, 'delts-front': 0.5 }, [C], { ...press(0), ...anchor('bench-press', 0.88) }),
  mv('db-bench-press', 'DB Bench Press', 'horizontal-press', 'dumbbell', { chest: 1, triceps: 0.5, 'delts-front': 0.5 }, [C, L], { ...press(0), ...anchor('bench-press', 0.36) }),
  mv('machine-chest-press', 'Machine Chest Press', 'horizontal-press', 'machine', { chest: 1, triceps: 0.5, 'delts-front': 0.5 }, [C], press(0)),
  mv('deficit-push-up', 'Deficit Push-Up', 'horizontal-press', 'bodyweight', { chest: 1, triceps: 0.5, 'delts-front': 0.5 }, [C, L, W], press(0)),
  mv('push-up', 'Push-Up', 'horizontal-press', 'bodyweight', { chest: 1, triceps: 0.5 }, [W], press(0)),
  mv('ring-push-up', 'Ring Push-Up', 'horizontal-press', 'bodyweight', { chest: 1, triceps: 0.5, abs: 0.5 }, [G], press(0)),

  // ---------------------------------------------------------------- incline press (≤ 60°)
  mv('incline-bench-press', 'Incline Bench Press (30°)', 'incline-press', 'barbell', { 'chest-upper': 1, chest: 0.5, 'delts-front': 0.5, triceps: 0.5 }, [C], { ...press(30), ...anchor('bench-press', 0.8) }),
  mv('incline-db-press', 'Incline DB Press (30°)', 'incline-press', 'dumbbell', { 'chest-upper': 1, chest: 0.5, 'delts-front': 0.5, triceps: 0.5 }, [C, L], { ...press(30), ...anchor('bench-press', 0.32) }),
  mv('low-incline-db-press', 'Low-Incline DB Press (15°)', 'incline-press', 'dumbbell', { 'chest-upper': 1, chest: 1, triceps: 0.5 }, [C, L], { ...press(15), ...anchor('bench-press', 0.34) }),
  mv('high-incline-db-press', 'High-Incline DB Press (45°)', 'incline-press', 'dumbbell', { 'chest-upper': 1, 'delts-front': 1, triceps: 0.5 }, [C], { ...press(45), ...anchor('bench-press', 0.28) }),
  mv('incline-smith-press', 'Incline Smith Press (30°)', 'incline-press', 'machine', { 'chest-upper': 1, chest: 0.5, triceps: 0.5 }, [C], press(30)),
  mv('incline-machine-press', 'Incline Machine Press', 'incline-press', 'plate-loaded', { 'chest-upper': 1, chest: 0.5, triceps: 0.5 }, [C], press(35)),
  mv('landmine-press', 'Half-Kneeling Landmine Press', 'incline-press', 'plate-loaded', { 'chest-upper': 1, 'delts-front': 1, triceps: 0.5, abs: 0.5 }, [C, U], press(50)),

  // ---------------------------------------------------------------- dips
  mv('ring-dip', 'Ring Dip', 'dip', 'bodyweight', { chest: 1, triceps: 1, 'delts-front': 0.5 }, [C, G, W]),
  mv('bar-dip', 'Bar Dip', 'dip', 'bodyweight', { chest: 1, triceps: 1, 'delts-front': 0.5 }, [C, W]),
  mv('weighted-dip', 'Weighted Dip', 'dip', 'weighted-bodyweight', { chest: 1, triceps: 1, 'delts-front': 0.5 }, [C, L]),

  // ---------------------------------------------------------------- fly
  mv('low-to-high-cable-fly', 'Low-to-High Cable Fly', 'chest-fly', 'cable', { 'chest-upper': 1, chest: 0.5 }, [I, L]),
  mv('incline-db-fly', 'Incline DB Fly', 'chest-fly', 'dumbbell', { 'chest-upper': 1, chest: 0.5 }, [I, L]),
  mv('pec-deck', 'Pec Deck', 'chest-fly', 'machine', { chest: 1, 'chest-upper': 0.5 }, [I]),
  mv('cable-crossover', 'Cable Crossover', 'chest-fly', 'cable', { chest: 1 }, [I, L]),

  // ---------------------------------------------------------------- vertical pull
  mv('pull-up', 'Strict Pull-Up', 'vertical-pull', 'bodyweight', { lats: 1, 'upper-back': 0.5, biceps: 0.5 }, [C, G, W], hang),
  mv('weighted-pull-up', 'Weighted Pull-Up', 'vertical-pull', 'weighted-bodyweight', { lats: 1, 'upper-back': 0.5, biceps: 0.5 }, [C, G], hang),
  mv('chin-up', 'Chin-Up', 'vertical-pull', 'weighted-bodyweight', { lats: 1, biceps: 1 }, [C, G], hang),
  mv('lat-pulldown', 'Lat Pulldown', 'vertical-pull', 'cable', { lats: 1, 'upper-back': 0.5, biceps: 0.5 }, [C], hang),
  mv('neutral-grip-pulldown', 'Neutral-Grip Pulldown', 'vertical-pull', 'cable', { lats: 1, biceps: 0.5 }, [C, L], hang),
  mv('single-arm-pulldown', 'Single-Arm Cable Pulldown', 'vertical-pull', 'cable', { lats: 1, biceps: 0.5 }, [C, U, L], hang),
  mv('kneeling-single-arm-pulldown', 'Half-Kneeling Single-Arm Pulldown', 'vertical-pull', 'cable', { lats: 1 }, [C, U, L], hang),

  // ---------------------------------------------------------------- lat isolation
  mv('straight-arm-pulldown', 'Straight-Arm Pulldown', 'lat-iso', 'cable', { lats: 1 }, [I]),
  mv('cable-pullover', 'Cable Pullover', 'lat-iso', 'cable', { lats: 1 }, [I, L]),
  mv('db-pullover', 'DB Pullover', 'lat-iso', 'dumbbell', { lats: 1, 'chest-upper': 0.5 }, [I, L]),

  // ---------------------------------------------------------------- horizontal pull
  mv('barbell-row', 'Barbell Row', 'horizontal-pull', 'barbell', { lats: 1, 'upper-back': 1, biceps: 0.5, 'lower-back': 0.5 }, [C], anchor('bench-press', 0.75)),
  mv('pendlay-row', 'Pendlay Row', 'horizontal-pull', 'barbell', { 'upper-back': 1, lats: 1, 'lower-back': 0.5 }, [C], anchor('bench-press', 0.7)),
  mv('chest-supported-db-row', 'Chest-Supported DB Row', 'horizontal-pull', 'dumbbell', { 'upper-back': 1, lats: 0.5, 'delts-rear': 0.5 }, [C]),
  mv('single-arm-db-row', 'Single-Arm DB Row', 'horizontal-pull', 'dumbbell', { lats: 1, 'upper-back': 0.5, biceps: 0.5 }, [C, U, L]),
  mv('seal-row', 'Seal Row', 'horizontal-pull', 'barbell', { 'upper-back': 1, lats: 1, 'delts-rear': 0.5 }, [C], anchor('bench-press', 0.6)),
  mv('seated-cable-row', 'Seated Cable Row', 'horizontal-pull', 'cable', { lats: 1, 'upper-back': 1, biceps: 0.5 }, [C, L]),
  mv('machine-row', 'Plate-Loaded Row', 'horizontal-pull', 'plate-loaded', { lats: 1, 'upper-back': 1 }, [C]),
  mv('meadows-row', 'Meadows Row', 'horizontal-pull', 'plate-loaded', { lats: 1, 'upper-back': 1, 'delts-rear': 0.5 }, [C, U, L]),
  mv('ring-row', 'Ring Row', 'horizontal-pull', 'bodyweight', { 'upper-back': 1, lats: 0.5, biceps: 0.5 }, [W]),

  // ---------------------------------------------------------------- side delts (a favourite)
  mv('db-lateral-raise', 'DB Lateral Raise', 'lateral-delt', 'dumbbell', { 'delts-side': 1 }, [I]),
  mv('cable-lateral-raise', 'Single-Arm Cable Lateral Raise', 'lateral-delt', 'cable', { 'delts-side': 1 }, [I, U, L]),
  mv('cable-y-raise', 'Cable Y-Raise', 'lateral-delt', 'cable', { 'delts-side': 1, traps: 0.5 }, [I, L]),
  mv('machine-lateral-raise', 'Machine Lateral Raise', 'lateral-delt', 'machine', { 'delts-side': 1 }, [I]),
  mv('lean-away-lateral-raise', 'Lean-Away DB Lateral Raise', 'lateral-delt', 'dumbbell', { 'delts-side': 1 }, [I, U, L]),
  mv('seated-db-lateral-raise', 'Seated DB Lateral Raise', 'lateral-delt', 'dumbbell', { 'delts-side': 1 }, [I]),
  mv('cable-upright-row', 'Wide-Grip Cable Upright Row', 'lateral-delt', 'cable', { 'delts-side': 1, traps: 0.5 }, [C]),
  mv('lu-raise', 'Lu Raise', 'lateral-delt', 'dumbbell', { 'delts-side': 1, traps: 0.5 }, [I]),

  // ---------------------------------------------------------------- rear delts
  mv('reverse-pec-deck', 'Reverse Pec Deck', 'rear-delt', 'machine', { 'delts-rear': 1, 'upper-back': 0.5 }, [I]),
  mv('cable-rear-delt-fly', 'Cross-Cable Rear Delt Fly', 'rear-delt', 'cable', { 'delts-rear': 1 }, [I, L]),
  mv('chest-supported-rear-delt-raise', 'Chest-Supported Rear Delt Raise', 'rear-delt', 'dumbbell', { 'delts-rear': 1, 'upper-back': 0.5 }, [I]),
  mv('face-pull', 'Face Pull', 'rear-delt', 'cable', { 'delts-rear': 1, 'upper-back': 0.5, traps: 0.5 }, [I]),
  mv('rear-delt-row', 'Cable Rear Delt Row', 'rear-delt', 'cable', { 'delts-rear': 1, 'upper-back': 0.5 }, [I]),

  // ---------------------------------------------------------------- arms
  mv('ez-bar-curl', 'EZ-Bar Curl', 'biceps', 'barbell', { biceps: 1, forearms: 0.5 }, [I], { barKg: 10 }),
  mv('incline-db-curl', 'Incline DB Curl', 'biceps', 'dumbbell', { biceps: 1 }, [I, L]),
  mv('bayesian-cable-curl', 'Bayesian Cable Curl', 'biceps', 'cable', { biceps: 1 }, [I, U, L]),
  mv('hammer-curl', 'DB Hammer Curl', 'biceps', 'dumbbell', { biceps: 1, forearms: 1 }, [I]),
  mv('preacher-curl', 'Machine Preacher Curl', 'biceps', 'machine', { biceps: 1 }, [I, L]),
  mv('overhead-cable-extension', 'Overhead Cable Triceps Extension', 'triceps', 'cable', { triceps: 1 }, [I, L]),
  mv('rope-pushdown', 'Rope Pushdown', 'triceps', 'cable', { triceps: 1 }, [I]),
  mv('ez-skull-crusher', 'EZ-Bar Skull Crusher', 'triceps', 'barbell', { triceps: 1 }, [I, L], { barKg: 10 }),
  mv('jm-press', 'JM Press', 'triceps', 'barbell', { triceps: 1, chest: 0.5 }, [C], { ...press(0), ...anchor('close-grip-bench', 0.6) }),

  // ---------------------------------------------------------------- core & carries
  mv('hanging-knee-raise', 'Hanging Knee Raise', 'core', 'bodyweight', { abs: 1 }, [W], hang),
  mv('cable-crunch', 'Cable Crunch', 'core', 'cable', { abs: 1 }, [I]),
  mv('ab-wheel', 'Ab Wheel Rollout', 'core', 'bodyweight', { abs: 1, lats: 0.5 }, [L]),
  mv('ghd-sit-up', 'GHD Sit-Up', 'core', 'bodyweight', { abs: 1 }, [W, L]),
  mv('sit-up', 'AbMat Sit-Up', 'core', 'bodyweight', { abs: 1 }, [W]),
  mv('hollow-rock', 'Hollow Rock', 'core', 'bodyweight', { abs: 1 }, [G, W]),
  mv('pallof-press', 'Pallof Press', 'core', 'cable', { abs: 1 }, [U]),
  mv('l-sit', 'L-Sit Hold', 'core', 'bodyweight', { abs: 1, triceps: 0.5 }, [G, S]),
  mv('farmers-carry', 'DB Farmer Carry', 'carry', 'dumbbell', { forearms: 1, traps: 1, abs: 0.5 }, [W]),
  mv('suitcase-carry', 'Suitcase Carry', 'carry', 'dumbbell', { abs: 1, forearms: 0.5 }, [U]),
  mv('kb-front-rack-carry', 'KB Front-Rack Carry', 'carry', 'kettlebell', { abs: 1, 'upper-back': 0.5 }, [W]),

  // ---------------------------------------------------------------- olympic: snatch family
  mv('snatch', 'Snatch', 'snatch', 'barbell', { quads: 0.5, glutes: 0.5, traps: 0.5 }, [O, S, W], { ...ballistic, ...anchor('clean', 0.8) }),
  mv('power-snatch', 'Power Snatch', 'snatch', 'barbell', { glutes: 0.5, traps: 0.5 }, [O, S, W], { ...ballistic, ...anchor('snatch', 0.85) }),
  mv('hang-power-snatch', 'Hang Power Snatch', 'snatch', 'barbell', { glutes: 0.5, traps: 0.5 }, [O, S, W], { ...ballistic, ...anchor('snatch', 0.78) }),
  mv('hang-snatch', 'Hang Snatch', 'snatch', 'barbell', { quads: 0.5, glutes: 0.5, traps: 0.5 }, [O, S], { ...ballistic, ...anchor('snatch', 0.9) }),
  mv('snatch-balance', 'Snatch Balance', 'snatch', 'barbell', { quads: 0.5 }, [O, S], { ...ballistic, ...anchor('snatch', 0.95) }),
  mv('overhead-squat', 'Overhead Squat', 'overhead-squat', 'barbell', { quads: 1, 'upper-back': 0.5, abs: 0.5 }, [O, S, W], { ...support, ...anchor('snatch', 1.05) }),
  mv('db-snatch', 'DB Snatch', 'snatch', 'dumbbell', { glutes: 0.5, 'delts-side': 0.5 }, [U, W], ballistic),
  mv('kb-snatch', 'KB Snatch', 'snatch', 'kettlebell', { glutes: 0.5 }, [U, W], ballistic),
  mv('devil-press', 'DB Devil Press', 'snatch', 'dumbbell', { glutes: 0.5, chest: 0.5 }, [W], ballistic),

  // ---------------------------------------------------------------- olympic: clean & jerk family
  mv('clean', 'Squat Clean', 'clean', 'barbell', { quads: 1, glutes: 0.5, traps: 0.5 }, [O, S, W], anchor('front-squat', 0.85)),
  mv('power-clean', 'Power Clean', 'clean', 'barbell', { glutes: 0.5, traps: 0.5 }, [O, S, W], anchor('clean', 0.85)),
  mv('hang-power-clean', 'Hang Power Clean', 'clean', 'barbell', { glutes: 0.5, traps: 0.5 }, [O, S, W], anchor('clean', 0.8)),
  mv('hang-clean', 'Hang Squat Clean', 'clean', 'barbell', { quads: 0.5, glutes: 0.5, traps: 0.5 }, [O, S], anchor('clean', 0.9)),
  mv('clean-and-jerk', 'Clean & Jerk', 'clean', 'barbell', { quads: 1, glutes: 0.5, traps: 0.5 }, [O, S, W], { ...ballistic, ...anchor('clean', 0.95) }),
  mv('db-hang-clean-and-jerk', 'DB Hang Clean & Jerk', 'clean', 'dumbbell', { glutes: 0.5, quads: 0.5 }, [W], ballistic),
  mv('split-jerk', 'Split Jerk', 'jerk', 'barbell', { quads: 0.5, triceps: 0.5 }, [O, S, W], { ...ballistic, ...anchor('clean', 0.95) }),
  mv('push-jerk', 'Push Jerk', 'jerk', 'barbell', { quads: 0.5, triceps: 0.5 }, [O, S, W], { ...ballistic, ...anchor('clean', 0.9) }),
  mv('power-jerk', 'Power Jerk', 'jerk', 'barbell', { quads: 0.5, triceps: 0.5 }, [O, S], { ...ballistic, ...anchor('clean', 0.9) }),
  mv('clean-pull', 'Clean Pull', 'oly-pull', 'barbell', { hamstrings: 0.5, glutes: 1, traps: 1 }, [O], anchor('clean', 1.1)),
  mv('snatch-pull', 'Snatch Pull', 'oly-pull', 'barbell', { hamstrings: 0.5, glutes: 1, traps: 1, 'upper-back': 0.5 }, [O], anchor('snatch', 1.1)),

  // ---------------------------------------------------------------- WOD barbell / ballistic
  mv('thruster', 'Thruster', 'wod-ballistic', 'barbell', { quads: 1, glutes: 0.5, triceps: 0.5 }, [W], { ...ballistic, ...anchor('front-squat', 0.6) }),
  mv('db-thruster', 'DB Thruster', 'wod-ballistic', 'dumbbell', { quads: 1, glutes: 0.5 }, [W], ballistic),
  mv('wall-ball', 'Wall Ball', 'wod-ballistic', 'none', { quads: 1, glutes: 0.5 }, [W], ballistic),

  // ---------------------------------------------------------------- gymnastics
  mv('kipping-pull-up', 'Kipping Pull-Up', 'gymnastics-pull', 'bodyweight', { lats: 1 }, [G, W, S], hang),
  mv('chest-to-bar', 'Chest-to-Bar Pull-Up', 'gymnastics-pull', 'bodyweight', { lats: 1, 'upper-back': 0.5 }, [G, W, S], hang),
  mv('toes-to-bar', 'Toes-to-Bar', 'gymnastics-pull', 'bodyweight', { abs: 1, lats: 0.5 }, [G, W, S], hang),
  mv('bar-muscle-up', 'Bar Muscle-Up', 'gymnastics-pull', 'bodyweight', { lats: 1, triceps: 0.5, chest: 0.5 }, [G, W, S], hang),
  mv('ring-muscle-up', 'Ring Muscle-Up', 'gymnastics-ring', 'bodyweight', { lats: 1, triceps: 0.5, chest: 0.5 }, [G, W, S], hang),
  mv('strict-ring-muscle-up', 'Strict Ring Muscle-Up', 'gymnastics-ring', 'bodyweight', { lats: 1, triceps: 1, chest: 0.5 }, [G, S], hang),
  mv('rope-climb', 'Rope Climb', 'gymnastics-pull', 'bodyweight', { lats: 1, biceps: 0.5, forearms: 1 }, [G, W, S], hang),
  mv('legless-rope-climb', 'Legless Rope Climb', 'gymnastics-pull', 'bodyweight', { lats: 1, biceps: 1, forearms: 1 }, [G, S], hang),
  mv('ring-support-hold', 'Ring Support Hold', 'gymnastics-ring', 'bodyweight', { triceps: 0.5, chest: 0.5 }, [G]),

  // ---------------------------------------------------------------- monostructural & plyo
  mv('row', 'Row (Erg)', 'erg', 'erg', {}, [W]),
  mv('ski', 'Ski Erg', 'erg', 'erg', { lats: 0.5, triceps: 0.5 }, [W]),
  mv('bike-erg', 'Bike Erg', 'erg', 'erg', {}, [W]),
  mv('air-bike', 'Air Bike (Assault/Echo)', 'erg', 'erg', {}, [W]),
  mv('double-under', 'Double-Under', 'monostructural', 'none', { calves: 0.5 }, [W, S]),
  mv('burpee', 'Burpee', 'monostructural', 'none', {}, [W]),
  mv('burpee-box-jump-over', 'Burpee Box Jump-Over', 'monostructural', 'none', {}, [W]),
  mv('bar-facing-burpee', 'Bar-Facing Burpee', 'monostructural', 'none', {}, [W]),
  mv('box-jump', 'Box Jump', 'plyo', 'none', { quads: 0.5 }, [W]),
  mv('box-jump-over', 'Box Jump-Over', 'plyo', 'none', { quads: 0.5 }, [W]),

  // ===================================================================== BANNED
  // Kept here on purpose: the restriction filter must reject every one of these.
  mv('strict-press', 'Strict Press', 'vertical-press', 'barbell', { 'delts-front': 1, triceps: 0.5 }, [C], press(90)),
  mv('push-press', 'Push Press', 'vertical-press', 'barbell', { 'delts-front': 1, triceps: 0.5 }, [C], press(90)),
  mv('seated-db-shoulder-press', 'Seated DB Shoulder Press', 'vertical-press', 'dumbbell', { 'delts-front': 1 }, [C], press(85)),
  mv('standing-db-shoulder-press', 'Standing DB Shoulder Press', 'vertical-press', 'dumbbell', { 'delts-front': 1 }, [C], press(90)),
  mv('machine-shoulder-press', 'Machine Shoulder Press', 'vertical-press', 'machine', { 'delts-front': 1 }, [C], press(85)),
  mv('arnold-press', 'Arnold Press', 'vertical-press', 'dumbbell', { 'delts-front': 1 }, [C], press(90)),
  mv('z-press', 'Z-Press', 'vertical-press', 'barbell', { 'delts-front': 1 }, [C], press(90)),
  mv('behind-neck-press', 'Behind-the-Neck Press', 'vertical-press', 'barbell', { 'delts-front': 1 }, [C], press(90)),
  mv('kb-strict-press', 'KB Strict Press', 'vertical-press', 'kettlebell', { 'delts-front': 1 }, [U], press(90)),
  // A "sneaky" one: classed as an incline press, but at 75° it is over the limit.
  mv('steep-incline-press', 'Steep Incline Press (75°)', 'incline-press', 'dumbbell', { 'delts-front': 1, 'chest-upper': 0.5 }, [C], press(75)),
  mv('handstand-push-up', 'Handstand Push-Up', 'inverted', 'bodyweight', { 'delts-front': 1, triceps: 1 }, [G], { inverted: true, ...press(90) }),
  mv('strict-hspu', 'Strict HSPU', 'inverted', 'bodyweight', { 'delts-front': 1, triceps: 1 }, [G], { inverted: true, ...press(90) }),
  mv('handstand-walk', 'Handstand Walk', 'inverted', 'bodyweight', { 'delts-front': 0.5 }, [G], { inverted: true }),
  mv('wall-walk', 'Wall Walk', 'inverted', 'bodyweight', { 'delts-front': 0.5 }, [G], { inverted: true }),
  mv('pike-push-up', 'Pike Push-Up', 'horizontal-press', 'bodyweight', { 'delts-front': 1 }, [G], { inverted: true, ...press(75) }),
];

export const MOVEMENTS: readonly Movement[] = RAW_MOVEMENTS.filter(isAllowed);

const BY_ID = new Map(MOVEMENTS.map((m) => [m.id, m]));

export function getMovement(id: string): Movement {
  const m = BY_ID.get(id);
  if (!m) throw new Error(`Unknown or restricted movement: ${id}`);
  return m;
}

export function findMovement(id: string): Movement | undefined {
  return BY_ID.get(id);
}

export function hasMovement(id: string): boolean {
  return BY_ID.has(id);
}

/** Patterns that are interchangeable for swaps (e.g. a fly can't replace a press). */
const SWAP_FAMILIES: Pattern[][] = [
  ['squat'],
  ['hinge'],
  ['lunge'],
  ['horizontal-press'],
  ['incline-press'],
  ['dip'],
  ['vertical-pull'],
  ['horizontal-pull'],
];

/**
 * Swap options: same pattern (or swap family), allowed, not the movement itself.
 * Olympic lifts only swap within the Olympic family; non-Olympic slots never get one.
 */
export function swapOptions(movementId: string): string[] {
  const m = getMovement(movementId);
  const family = SWAP_FAMILIES.find((f) => f.includes(m.pattern)) ?? [m.pattern];
  const olympic = m.tags.includes('olympic');
  return MOVEMENTS.filter(
    (o) =>
      o.id !== m.id &&
      family.includes(o.pattern) &&
      o.tags.includes('olympic') === olympic &&
      o.loadType !== 'erg',
  ).map((o) => o.id);
}

/** Resolve an e1RM anchor chain, returning the first ancestor with a known e1RM. */
export function anchorChain(movementId: string): { movementId: string; ratio: number }[] {
  const chain: { movementId: string; ratio: number }[] = [];
  let ratio = 1;
  let current = findMovement(movementId);
  const seen = new Set<string>();
  while (current?.anchor && !seen.has(current.id)) {
    seen.add(current.id);
    ratio *= current.anchor.ratio;
    chain.push({ movementId: current.anchor.movementId, ratio });
    current = findMovement(current.anchor.movementId);
  }
  return chain;
}
