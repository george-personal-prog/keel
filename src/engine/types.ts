/**
 * Core domain types for the KEEL programming engine.
 *
 * The engine is pure and deterministic:
 *   (profile/settings, track state, history, today) -> next session prescription
 * It never touches storage, the DOM, Date.now() or Math.random().
 */

// ---------------------------------------------------------------------------
// Muscles, patterns, movements
// ---------------------------------------------------------------------------

export type Muscle =
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'adductors'
  | 'calves'
  | 'chest'
  | 'chest-upper'
  | 'lats'
  | 'upper-back'
  | 'traps'
  | 'delts-front'
  | 'delts-side'
  | 'delts-rear'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'abs'
  | 'lower-back';

export type WeakPoint = 'shoulders' | 'upper-chest' | 'lats';

export type Pattern =
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'knee-iso'
  | 'hamstring-iso'
  | 'glute'
  | 'calf'
  | 'horizontal-press'
  | 'incline-press'
  | 'dip'
  | 'chest-fly'
  | 'vertical-pull'
  | 'lat-iso'
  | 'horizontal-pull'
  | 'lateral-delt'
  | 'rear-delt'
  | 'biceps'
  | 'triceps'
  | 'core'
  | 'carry'
  | 'snatch'
  | 'clean'
  | 'jerk'
  | 'oly-pull'
  | 'overhead-squat'
  | 'gymnastics-pull'
  | 'gymnastics-ring'
  | 'erg'
  | 'monostructural'
  | 'wod-ballistic'
  | 'plyo'
  // Patterns that exist only so the restriction filter can reject them.
  | 'vertical-press'
  | 'inverted';

export type LoadType =
  | 'barbell'
  | 'dumbbell'
  | 'kettlebell'
  | 'cable'
  | 'machine'
  /** Plate-loaded implements with no bar weight counted (landmine, plate-loaded machines). */
  | 'plate-loaded'
  | 'bodyweight'
  | 'weighted-bodyweight'
  | 'erg'
  | 'none';

export type MovementTag =
  | 'compound'
  | 'isolation'
  | 'unilateral'
  | 'olympic'
  | 'gymnastics'
  | 'lengthened-bias'
  | 'skill'
  | 'wod-friendly';

export interface OverheadProfile {
  /** Angle of the pressing path from horizontal (0 = flat bench, 90 = strict press). */
  pressAngleDeg: number;
  /**
   * press   = upper-body-driven pressing (the thing the restriction targets)
   * ballistic = leg-driven, bar travels overhead (jerk, thruster, wall ball, snatch)
   * support = static overhead support (OHS, overhead carries)
   * hang    = hanging from a bar/rings (pull-ups etc.)
   */
  kind: 'press' | 'ballistic' | 'support' | 'hang';
}

export interface Movement {
  id: string;
  name: string;
  pattern: Pattern;
  loadType: LoadType;
  /** Contribution per muscle: 1 = prime mover (counts as a full hard set), 0.5 = synergist. */
  muscles: Partial<Record<Muscle, number>>;
  tags: MovementTag[];
  overhead?: OverheadProfile;
  /** Inverted (handstand) work. Always banned. */
  inverted?: boolean;
  /**
   * If this movement has no history, estimate its e1RM from another movement:
   * e1RM(this) ≈ e1RM(anchor) × ratio. Ratios are deliberately conservative.
   */
  anchor?: { movementId: string; ratio: number };
  /** Default bar weight for barbell lifts (kg). Settings can override per lift. */
  barKg?: number;
  /** Rough seconds per rep at a controlled tempo, used for duration estimates. */
  secPerRep?: number;
}

// ---------------------------------------------------------------------------
// Settings & track
// ---------------------------------------------------------------------------

export type Focus = 'competition' | 'off-season';
export type Frequency = 3 | 4 | 5 | 6;

export interface Track {
  frequency: Frequency;
  focus: Focus;
  /** ISO date (YYYY-MM-DD) of the competition. Only used for `competition` focus. */
  competitionDate?: string;
}

export interface EquipmentSettings {
  /** Plate denominations available, kg (assumed to have pairs of each). */
  platesKg: number[];
  defaultBarKg: number;
  /** Per-movement bar override, e.g. { 'front-squat': 20, 'ez-bar-curl': 10 }. */
  barKgByMovement: Record<string, number>;
  dumbbellStepKg: number;
  dumbbellMinKg: number;
  dumbbellMaxKg: number;
  kettlebellsKg: number[];
  cableStepKg: number;
  machineStepKg: number;
  /** Step for added load on weighted pull-ups / dips (belt). */
  beltStepKg: number;
}

export interface Settings {
  equipment: EquipmentSettings;
  sessionBudgetMin: number;
  /** Warm-up style: ramp sets of the first lift, or a short general prep. */
  warmupStyle: 'ramp' | 'general';
  bodyweightKg?: number;
}

// ---------------------------------------------------------------------------
// Prescription
// ---------------------------------------------------------------------------

export type Scheme = 'strength' | 'hypertrophy' | 'olympic';
export type SlotRole = 'primary' | 'secondary' | 'accessory' | 'weak-point';
export type Phase =
  | 'calibration'
  | 'accumulation'
  | 'intensification'
  | 'peak'
  | 'taper'
  | 'hypertrophy'
  | 'deload';

export type IntensityTechnique = 'myo-reps' | 'lengthened-partials' | 'drop-set';

export type SetKind = 'warmup' | 'top' | 'backoff' | 'working' | 'calibration';

export interface PrescribedSet {
  kind: SetKind;
  /** Load in kg. null = bodyweight-only or still to be found (calibration). */
  loadKg: number | null;
  /** Target reps for this set. */
  reps: number;
  /** Rep range the set lives in (hypertrophy). */
  repRange?: [number, number];
  targetRir: number;
  /** Optional plate breakdown per side for barbell loads. */
  platesPerSide?: number[];
  note?: string;
}

export interface ExercisePrescription {
  slotKey: string;
  slotId: string;
  movementId: string;
  movementName: string;
  pattern: Pattern;
  scheme: Scheme;
  role: SlotRole;
  /** Display label: "A", "B1", "B2"... */
  label: string;
  /** Superset group letter shared by its members; undefined = straight sets. */
  group?: string;
  sets: PrescribedSet[];
  restSec: number;
  tempo?: string;
  technique?: IntensityTechnique;
  /** One-line explanation of the prescription. */
  why: string;
  /** Equivalent, allowed alternatives (same pattern). */
  swapOptions: string[];
  priority: number;
  calibrating: boolean;
}

export type WodFormat = 'amrap' | 'for-time' | 'emom' | 'intervals' | 'chipper' | 'test';
export type ScoreType = 'time' | 'rounds-reps' | 'load' | 'calories' | 'metres' | 'reps';

export interface WodComponent {
  movementId: string;
  reps?: number;
  calories?: number;
  metres?: number;
  loadKg?: number;
  /** Free text such as "Rx 43 kg" or "per arm". */
  note?: string;
}

export interface WodPrescription {
  id: string;
  name: string;
  format: WodFormat;
  scoreType: ScoreType;
  /** Work duration / time cap in minutes. */
  durationMin: number;
  /** For intervals: rounds × work/rest. */
  intervals?: { rounds: number; workSec: number; restSec: number; target?: string };
  components: WodComponent[];
  /** e.g. "21-15-9" or "5 rounds". */
  structure: string;
  benchmark?: string;
  target?: string;
  why: string;
}

export interface WarmupPrescription {
  style: 'ramp' | 'general';
  minutes: number;
  steps: string[];
  rampSets?: PrescribedSet[];
}

export interface Flag {
  kind:
    | 're-entry'
    | 'ill-return'
    | 'motivation'
    | 'deload'
    | 'deload-review'
    | 'calibration'
    | 'short-on-time'
    | 'budget-trim'
    | 'track-change'
    | 'taper'
    | 'spotlight';
  message: string;
}

export interface DeloadEvidence {
  movementId?: string;
  kind: 'e1rm-regression' | 'e1rm-stall' | 'effort-creep' | 'missed-targets' | 'motivation-skips';
  detail: string;
}

export interface SessionPrescription {
  /** Monotonic number of this session in the user's history (completed count + 1). */
  sessionNumber: number;
  dayTypeId: string;
  title: string;
  subtitle: string;
  phase: Phase;
  blockNumber: number;
  weekInBlock: number;
  blockLengthWeeks: number;
  warmup: WarmupPrescription;
  exercises: ExercisePrescription[];
  conditioning?: WodPrescription;
  estimatedMin: number;
  flags: Flag[];
  deload?: { evidence: DeloadEvidence[]; reason: string };
  /** Modifiers applied (for transparency and so the reducer can track ramps). */
  modifiers: {
    loadFactor: number;
    setDelta: number;
    rirDelta: number;
    volumeFactor: number;
  };
  spotlight?: WeakPoint;
}

// ---------------------------------------------------------------------------
// History (what the UI records)
// ---------------------------------------------------------------------------

export interface LoggedSet {
  kind: SetKind;
  loadKg: number | null;
  reps: number;
  /** Reps in reserve; 4 means "4+". null when not entered. */
  rir: number | null;
  targetReps?: number;
  targetRir?: number;
  /** Olympic lifts: technique broke down even though the rep was made. */
  techniquePoor?: boolean;
}

export interface LoggedExercise {
  slotKey: string;
  movementId: string;
  scheme: Scheme;
  repRange?: [number, number];
  sets: LoggedSet[];
}

export interface HeartRateEntry {
  avg?: number;
  max?: number;
  /** Seconds in zones 1..5. */
  zonesSec?: number[];
}

export interface WodScore {
  timeSec?: number;
  rounds?: number;
  reps?: number;
  loadKg?: number;
  calories?: number;
  metres?: number;
  /** For intervals: per-round achieved values (pace sec/500m, watts, cals...). */
  splits?: number[];
  rx?: boolean;
}

export interface LoggedConditioning {
  wodId: string;
  name: string;
  format: WodFormat;
  scoreType: ScoreType;
  benchmark?: string;
  score: WodScore;
  /** For interval sessions: the target that was prescribed (e.g. pace sec/500m). */
  targetSplit?: number;
  hr?: HeartRateEntry;
  /** Minutes of work (time score for "for time", otherwise the prescribed duration). */
  durationMin?: number;
}

export interface SessionLog {
  id: string;
  /** ISO date YYYY-MM-DD */
  date: string;
  sessionNumber: number;
  dayTypeId: string;
  phase: Phase;
  deload: boolean;
  partial: boolean;
  exercises: LoggedExercise[];
  conditioning?: LoggedConditioning;
  notes?: string;
  /** Wall-clock minutes from start to finish (UI-recorded). */
  durationMin?: number;
  /** Block the session belonged to (UI-recorded from the prescription). */
  blockNumber?: number;
}

export type SkipReason = 'motivation' | 'busy' | 'ill' | 'away';

export interface SkipEvent {
  date: string;
  reason: SkipReason;
}

export interface History {
  sessions: SessionLog[];
  skips: SkipEvent[];
}

// ---------------------------------------------------------------------------
// Track state (owned by reducers in state.ts)
// ---------------------------------------------------------------------------

export interface TrackState {
  schemaVersion: 1;
  track: Track;
  /** Position in the current split's day list. */
  cursor: number;
  /** 1-based block counter (drives accessory rotation and weak-point spotlight). */
  blockNumber: number;
  /** Number of completed (non-deload) sessions when the current block started. */
  blockStartSession: number;
  /** Number of sessions completed overall. */
  completedSessions: number;
  /** Calibration completes after one full pass through the split. */
  calibrated: boolean;
  /** Persistent block-level swaps: slotKey -> movementId. Cleared at block rollover. */
  swaps: Record<string, string>;
  pendingTrack?: Track;
  deload?: { startedAtSession: number; sessionsRemaining: number };
  lastDeloadEndDate?: string;
  /** User declined a recommended deload on this date; suppresses re-triggering for 14 days. */
  deloadDeclinedDate?: string;
  /** Seed for deterministic WOD generation. */
  seed: number;
}

export interface EngineInput {
  settings: Settings;
  state: TrackState;
  history: History;
  /** ISO date YYYY-MM-DD */
  today: string;
  options?: {
    /** "Short on time" mode: available minutes for this session. */
    availableMin?: number;
    /** Override deload trigger (user chose to train normally). */
    ignoreDeload?: boolean;
  };
}
