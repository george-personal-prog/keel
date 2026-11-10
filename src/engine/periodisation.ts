/**
 * Block structure, phases and effort targets.
 *
 * Block progress is counted in *completed sessions*, not calendar weeks, so skipped days
 * stretch a block rather than compress it. The one exception is competition prep with a
 * date: the date is fixed, so phases are counted back from it on the calendar.
 */

import type { Phase, TrackState, WeakPoint } from './types';
import { daysBetween } from './util';

export interface BlockInfo {
  phase: Phase;
  blockNumber: number;
  weekInBlock: number;
  blockLengthWeeks: number;
  /** Weeks to competition (competition with date only). */
  weeksOut?: number;
  spotlight?: WeakPoint;
  note?: string;
}

export const OFF_SEASON_BLOCK_WEEKS = 6;
export const ACCUMULATION_WEEKS = 4;
export const INTENSIFICATION_WEEKS = 4;
export const PEAK_WEEKS = 3;
export const TAPER_WEEKS = 1;

/** RIR targets per week of each phase (compound lifts). Isolations go one closer late in a block. */
export const RIR_BY_WEEK: Record<Phase, number[]> = {
  calibration: [2],
  hypertrophy: [3, 3, 2, 2, 1, 1],
  accumulation: [3, 2, 2, 1],
  intensification: [2, 2, 1, 1],
  peak: [2, 1, 1],
  taper: [3],
  deload: [4],
};

const SPOTLIGHT_ORDER: WeakPoint[] = ['shoulders', 'upper-chest', 'lats'];

export function spotlightFor(blockNumber: number): WeakPoint {
  return SPOTLIGHT_ORDER[(blockNumber - 1) % SPOTLIGHT_ORDER.length];
}

export function phaseLength(phase: Phase): number {
  switch (phase) {
    case 'hypertrophy':
      return OFF_SEASON_BLOCK_WEEKS;
    case 'accumulation':
      return ACCUMULATION_WEEKS;
    case 'intensification':
      return INTENSIFICATION_WEEKS;
    case 'peak':
      return PEAK_WEEKS;
    case 'taper':
      return TAPER_WEEKS;
    default:
      return 1;
  }
}

export function rirFor(phase: Phase, weekInBlock: number, isolation = false): number {
  const arr = RIR_BY_WEEK[phase];
  const base = arr[Math.min(arr.length - 1, Math.max(0, weekInBlock - 1))];
  if (isolation && (phase === 'hypertrophy' || phase === 'accumulation') && weekInBlock >= arr.length - 1) {
    return Math.max(0, base - 1);
  }
  return base;
}

/** Session-counted week within the current block (1-based). */
export function sessionWeek(state: TrackState): number {
  const done = Math.max(0, state.completedSessions - state.blockStartSession);
  return Math.floor(done / state.track.frequency) + 1;
}

export function weeksOut(competitionDate: string | undefined, today: string): number | undefined {
  if (!competitionDate) return undefined;
  const days = daysBetween(today, competitionDate);
  if (days < 0) return undefined;
  return Math.max(1, Math.ceil((days + 1) / 7));
}

/** Rolling (no-date) competition blocks alternate accumulation and intensification. */
function rollingCompPhase(blockNumber: number): Phase {
  return blockNumber % 2 === 1 ? 'accumulation' : 'intensification';
}

export function blockInfo(state: TrackState, today: string): BlockInfo {
  const { track, blockNumber } = state;

  if (!state.calibrated) {
    return { phase: 'calibration', blockNumber, weekInBlock: 1, blockLengthWeeks: 1 };
  }

  if (track.focus === 'off-season') {
    return {
      phase: 'hypertrophy',
      blockNumber,
      weekInBlock: Math.min(sessionWeek(state), OFF_SEASON_BLOCK_WEEKS),
      blockLengthWeeks: OFF_SEASON_BLOCK_WEEKS,
      spotlight: spotlightFor(blockNumber),
    };
  }

  const wo = weeksOut(track.competitionDate, today);
  if (wo !== undefined) {
    if (wo <= TAPER_WEEKS) {
      return { phase: 'taper', blockNumber, weekInBlock: 1, blockLengthWeeks: 1, weeksOut: wo };
    }
    if (wo <= TAPER_WEEKS + PEAK_WEEKS) {
      return { phase: 'peak', blockNumber, weekInBlock: TAPER_WEEKS + PEAK_WEEKS - wo + 1, blockLengthWeeks: PEAK_WEEKS, weeksOut: wo };
    }
    const intensEnd = TAPER_WEEKS + PEAK_WEEKS + INTENSIFICATION_WEEKS;
    if (wo <= intensEnd) {
      return { phase: 'intensification', blockNumber, weekInBlock: intensEnd - wo + 1, blockLengthWeeks: INTENSIFICATION_WEEKS, weeksOut: wo };
    }
    return {
      phase: 'accumulation',
      blockNumber,
      weekInBlock: Math.min(sessionWeek(state), ACCUMULATION_WEEKS),
      blockLengthWeeks: ACCUMULATION_WEEKS,
      weeksOut: wo,
    };
  }

  const phase = rollingCompPhase(blockNumber);
  const note = track.competitionDate ? 'Competition date has passed: running rolling blocks.' : undefined;
  return {
    phase,
    blockNumber,
    weekInBlock: Math.min(sessionWeek(state), phaseLength(phase)),
    blockLengthWeeks: phaseLength(phase),
    note,
  };
}

/** True when the date (not the session count) decides the phase. */
export function isDateDriven(info: BlockInfo): boolean {
  return info.weeksOut !== undefined && info.phase !== 'accumulation';
}
