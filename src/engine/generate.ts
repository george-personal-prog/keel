/**
 * The engine entry point:
 *   (settings, track state, history, today, options) -> next SessionPrescription
 *
 * Pure and deterministic: same input, same output.
 */

import { buildConditioning, type ConditioningContext } from './conditioning';
import { assessDeload } from './deload';
import { getMovement, hasMovement, swapOptions } from './movements/library';
import { blockInfo, type BlockInfo } from './periodisation';
import { NO_MODS, prescribe, type Modifiers } from './progression';
import { assessReadiness } from './readiness';
import { buildWarmup, estimateMinutes, fitToBudget, restFor } from './session-time';
import { slotKey, splitFor, type DayTemplate, type SlotTemplate } from './templates';
import type {
  DeloadEvidence,
  EngineInput,
  ExercisePrescription,
  Flag,
  IntensityTechnique,
  Phase,
  SessionPrescription,
  TrackState,
  WodPrescription,
} from './types';
import { hashString } from './util';

const TECHNIQUES: IntensityTechnique[] = ['myo-reps', 'lengthened-partials', 'drop-set'];

const TECHNIQUE_NOTES: Record<IntensityTechnique, string> = {
  'myo-reps': 'Last set: myo-reps. After the set, 3–5 breaths, then mini-sets of 3–5 until you can’t hit 3.',
  'lengthened-partials': 'Last set: at failure, keep going with partial reps in the stretched half.',
  'drop-set': 'Last set: drop ~25% at failure and go again to near failure.',
};

export function currentDay(state: TrackState): DayTemplate {
  const split = splitFor(state.track.focus, state.track.frequency);
  return split[state.cursor % split.length];
}

/** Which movement fills a slot: block swap > rotation > default. */
export function resolveMovement(state: TrackState, day: DayTemplate, slot: SlotTemplate): string {
  const key = slotKey(day.id, slot.id);
  const swapped = state.swaps[key];
  if (swapped && hasMovement(swapped)) return swapped;
  const candidates = slot.candidates.filter(hasMovement);
  if (!slot.rotate || candidates.length === 1) return candidates[0];
  const offset = hashString(key) % candidates.length;
  return candidates[(state.blockNumber - 1 + offset) % candidates.length];
}

function phaseLabel(phase: Phase, info: BlockInfo): string {
  const names: Record<Phase, string> = {
    calibration: 'Calibration week',
    hypertrophy: 'Hypertrophy block',
    accumulation: 'Accumulation',
    intensification: 'Intensification',
    peak: 'Peak',
    taper: 'Taper',
    deload: 'Deload',
  };
  if (phase === 'calibration' || phase === 'deload') return names[phase];
  const wo = info.weeksOut !== undefined ? ` · ${info.weeksOut} wk${info.weeksOut === 1 ? '' : 's'} out` : '';
  return `${names[phase]} · week ${info.weekInBlock}/${info.blockLengthWeeks}${wo}`;
}

function labelSlots(slots: SlotTemplate[]): Map<string, { label: string; group?: string }> {
  const out = new Map<string, { label: string; group?: string }>();
  const groupSizes = new Map<string, number>();
  for (const s of slots) if (s.group) groupSizes.set(s.group, (groupSizes.get(s.group) ?? 0) + 1);
  let letter = 0;
  const groupLetter = new Map<string, string>();
  const groupIndex = new Map<string, number>();
  for (const s of slots) {
    const size = s.group ? groupSizes.get(s.group)! : 1;
    if (s.group && size > 1) {
      if (!groupLetter.has(s.group)) groupLetter.set(s.group, String.fromCharCode(65 + letter++));
      const L = groupLetter.get(s.group)!;
      const i = (groupIndex.get(s.group) ?? 0) + 1;
      groupIndex.set(s.group, i);
      out.set(s.id, { label: `${L}${i}`, group: L });
    } else {
      out.set(s.id, { label: String.fromCharCode(65 + letter++) });
    }
  }
  return out;
}

export function prescribeNextSession(input: EngineInput): SessionPrescription {
  const { settings, state, history, today, options = {} } = input;
  const split = splitFor(state.track.focus, state.track.frequency);
  const dayIndex = state.cursor % split.length;
  const day = split[dayIndex];
  const info = blockInfo(state, today);
  const flags: Flag[] = [];

  // ------------------------------------------------------------------ phase & deload
  let phase: Phase = info.phase;
  let deload: SessionPrescription['deload'];
  if (state.deload) {
    phase = 'deload';
    deload = { evidence: [], reason: `Deload in progress: ${state.deload.sessionsRemaining} session${state.deload.sessionsRemaining === 1 ? '' : 's'} left.` };
    flags.push({ kind: 'deload', message: deload.reason });
  } else if (phase !== 'calibration' && phase !== 'taper') {
    const a = assessDeload(history, state, today);
    if (a.trigger && !options.ignoreDeload) {
      phase = 'deload';
      deload = { evidence: a.evidence, reason: deloadReason(a.evidence) };
      flags.push({ kind: 'deload', message: `Deload recommended: ${deload.reason}` });
    } else if (a.reviewDue) {
      flags.push({
        kind: 'deload-review',
        message: `${a.weeksSinceDeload} weeks without a deload and no fatigue signals. Keep training; check how joints and sleep feel.`,
      });
    }
  }
  if (phase === 'calibration') {
    flags.push({ kind: 'calibration', message: 'Calibration week: find working weights and set conditioning baselines. Nothing here is a max test.' });
  }
  if (phase === 'taper') flags.push({ kind: 'taper', message: 'Taper: volume down, intensity kept, arrive fresh.' });
  if (info.note) flags.push({ kind: 'track-change', message: info.note });
  if (state.pendingTrack) {
    flags.push({ kind: 'track-change', message: `Track change to ${state.pendingTrack.focus} ×${state.pendingTrack.frequency} starts next block.` });
  }

  // ------------------------------------------------------------------ readiness
  const readiness = phase === 'deload' ? { mods: NO_MODS, flags: [], easyConditioning: false } : assessReadiness(history, today);
  const mods: Modifiers = readiness.mods;
  flags.push(...readiness.flags);

  const spotlight = state.track.focus === 'off-season' && (phase === 'hypertrophy' || phase === 'deload') ? info.spotlight : undefined;
  if (spotlight && info.weekInBlock === 1 && phase === 'hypertrophy' && dayIndex === 0) {
    flags.push({ kind: 'spotlight', message: `Block ${info.blockNumber} spotlight: ${spotlight.replace('-', ' ')} get extra sets this block.` });
  }

  // ------------------------------------------------------------------ exercises
  const slots = day.slots.filter((s) => !s.spotlightOnly || (spotlight === s.weakPoint && phase === 'hypertrophy'));
  const labels = labelSlots(slots);
  let techniqueUsed = false;
  const useTempo = state.track.focus === 'off-season' && phase !== 'calibration';

  const exercises: ExercisePrescription[] = slots.map((slot) => {
    const movementId = resolveMovement(state, day, slot);
    const movement = getMovement(movementId);
    const result = prescribe({
      movement,
      slot,
      phase,
      weekInBlock: info.weekInBlock,
      focus: state.track.focus,
      history,
      settings,
      spotlight,
      mods,
    });
    const { label, group } = labels.get(slot.id)!;

    let technique: IntensityTechnique | undefined;
    let sets = result.sets;
    if (
      !techniqueUsed &&
      slot.techniqueEligible &&
      phase === 'hypertrophy' &&
      info.weekInBlock >= 4 &&
      mods.loadFactor === 1 &&
      !result.calibrating
    ) {
      technique = TECHNIQUES[(state.blockNumber - 1) % TECHNIQUES.length];
      techniqueUsed = true;
      sets = sets.map((s, i) => (i === sets.length - 1 ? { ...s, targetRir: 0, note: TECHNIQUE_NOTES[technique!] } : s));
    }

    const base = { scheme: slot.scheme, role: slot.role, group, movementId };
    return {
      slotKey: slotKey(day.id, slot.id),
      slotId: slot.id,
      movementId,
      movementName: movement.name,
      pattern: movement.pattern,
      scheme: slot.scheme,
      role: slot.role,
      label,
      group,
      sets,
      restSec: restFor(base),
      tempo: useTempo && slot.scheme === 'hypertrophy' ? slot.tempo : undefined,
      technique,
      why: result.why,
      swapOptions: swapOptions(movementId),
      priority: slot.priority,
      calibrating: result.calibrating,
    };
  });

  // ------------------------------------------------------------------ conditioning
  let conditioning: WodPrescription | undefined;
  let rebuild: ((minutes: number) => WodPrescription) | undefined;
  if (day.conditioning) {
    const spec = day.conditioning;
    const lastWeek = info.blockLengthWeeks > 1 && info.weekInBlock === info.blockLengthWeeks;
    const isErg = (d: DayTemplate) => d.conditioning?.emphasis === 'erg-intervals' || d.conditioning?.emphasis === 'aerobic';
    const firstErg = split.findIndex((d) => d.conditioning && isErg(d));
    const firstMetcon = split.findIndex((d) => d.conditioning && !isErg(d));
    const benchmarkDay = lastWeek && (dayIndex === firstErg || dayIndex === firstMetcon);

    const mode: ConditioningContext['mode'] =
      phase === 'calibration'
        ? 'calibration'
        : phase === 'deload' || readiness.easyConditioning
          ? 'deload'
          : phase === 'taper'
            ? 'taper'
            : benchmarkDay && phase !== 'peak'
              ? 'benchmark'
              : 'normal';
    const ctx: ConditioningContext = {
      spec,
      history,
      settings,
      seed: state.seed,
      sessionNumber: state.completedSessions + 1,
      dayId: day.id,
      avoidPatterns: exercises.filter((e) => e.role === 'primary').map((e) => e.pattern),
      mode,
      calibrationIndex: dayIndex,
    };
    conditioning = buildConditioning(ctx);
    if (mode === 'normal') rebuild = (minutes) => buildConditioning({ ...ctx, minutes });
  }

  // ------------------------------------------------------------------ assemble & fit
  const warmup = buildWarmup(exercises[0], settings, day.region);
  let session: SessionPrescription = {
    sessionNumber: state.completedSessions + 1,
    dayTypeId: day.id,
    title: day.title,
    subtitle: phaseLabel(phase, info),
    phase,
    blockNumber: info.blockNumber,
    weekInBlock: info.weekInBlock,
    blockLengthWeeks: info.blockLengthWeeks,
    warmup,
    exercises,
    conditioning,
    estimatedMin: 0,
    flags,
    deload,
    modifiers: { ...mods },
    spotlight,
  };
  session.estimatedMin = estimateMinutes(session);

  const shortOnTime = options.availableMin != null && options.availableMin < settings.sessionBudgetMin;
  const budget = Math.min(settings.sessionBudgetMin, options.availableMin ?? Infinity);
  const fitted = fitToBudget(session, {
    budgetMin: budget,
    conditioningPriority: day.conditioning?.priority ?? 3,
    conditioningMinMinutes: day.conditioning?.minutes[0],
    rebuildConditioning: rebuild,
  });
  session = fitted.session;
  if (fitted.cuts.length) {
    session.flags = [
      ...session.flags,
      {
        kind: shortOnTime ? 'short-on-time' : 'budget-trim',
        message: `${shortOnTime ? `Short on time (${budget} min)` : `Fitted to ${budget} min`}: ${fitted.cuts.join(', ')}.`,
      },
    ];
  }
  return session;
}

function deloadReason(evidence: DeloadEvidence[]): string {
  const lifts = evidence.filter((e) => e.movementId).length;
  const parts: string[] = [];
  if (lifts) parts.push(`${lifts} lift${lifts > 1 ? 's' : ''} stalling or regressing`);
  if (evidence.some((e) => e.kind === 'missed-targets')) parts.push('missed rep targets');
  if (evidence.some((e) => e.kind === 'motivation-skips')) parts.push('repeated low-motivation skips');
  return parts.join(', ') + '.';
}
