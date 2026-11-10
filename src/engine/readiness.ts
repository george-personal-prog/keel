/**
 * Readiness modifiers from gaps and skip reasons. Derived purely from history, so there is no
 * extra state to drift out of sync.
 *
 * - Time off -> a re-entry ramp scaled to the gap (longer gap: lower start, more sessions).
 * - Ill      -> first session back lighter, fewer sets, more reps in reserve.
 * - Away     -> gap ramp only (time off, not sickness).
 * - Busy     -> no penalty; suggest "short on time" mode.
 * - Motivation, repeated -> trim accessory volume ~20% and say so; also feeds deload evidence.
 */

import { sortedSessions, skipsInWindow } from './history';
import type { Modifiers } from './progression';
import type { Flag, History, SkipEvent } from './types';
import { daysBetween } from './util';

export const RAMP_MIN_GAP_DAYS = 8;

export interface Readiness {
  mods: Modifiers;
  flags: Flag[];
  /** Conditioning should be easier (illness). */
  easyConditioning: boolean;
}

export interface Ramp {
  sessions: number;
  drop: number;
}

export function rampFor(gapDays: number): Ramp | undefined {
  if (gapDays < RAMP_MIN_GAP_DAYS) return undefined;
  if (gapDays < 14) return { sessions: 1, drop: 0.075 };
  if (gapDays < 28) return { sessions: 2, drop: 0.12 };
  if (gapDays < 56) return { sessions: 3, drop: 0.18 };
  return { sessions: 4, drop: 0.25 };
}

/** Load factor for ramp session `i` (0-based) of `n`: starts at 1 - drop, climbs evenly. */
export function rampFactor(ramp: Ramp, i: number): number {
  return 1 - ramp.drop * ((ramp.sessions - i) / ramp.sessions);
}

export function assessReadiness(history: History, today: string): Readiness {
  const mods: Modifiers = { loadFactor: 1, setDelta: 0, rirDelta: 0, volumeFactor: 1 };
  const flags: Flag[] = [];
  let easyConditioning = false;
  const sessions = sortedSessions(history);
  if (!sessions.length) return { mods, flags, easyConditioning };

  const lastDate = sessions[sessions.length - 1].date;
  // Same-day skips count too: a skip logged on a day you also trained means "after it".
  const skipsSinceLast = history.skips.filter((s) => s.date >= lastDate && s.date <= today);

  // ---- re-entry ramp: either the gap is right now, or we're still inside a recent ramp
  let gap = daysBetween(lastDate, today);
  let rampIndex = 0;
  let gapSkips: SkipEvent[] = skipsSinceLast;
  if (gap < RAMP_MIN_GAP_DAYS) {
    gap = 0;
    for (let i = sessions.length - 1; i > 0; i--) {
      const g = daysBetween(sessions[i - 1].date, sessions[i].date);
      if (g >= RAMP_MIN_GAP_DAYS) {
        const ramp = rampFor(g)!;
        const done = sessions.length - i;
        if (done < ramp.sessions) {
          gap = g;
          rampIndex = done;
          gapSkips = history.skips.filter((s) => s.date > sessions[i - 1].date && s.date < sessions[i].date);
        }
        break;
      }
    }
  }
  const ramp = gap ? rampFor(gap) : undefined;
  if (ramp) {
    mods.loadFactor = rampFactor(ramp, rampIndex);
    if (rampIndex < Math.ceil(ramp.sessions / 2)) mods.setDelta = -1;
    if (gap >= 28) mods.rirDelta = 1;
    const reason = gapSkips.some((s) => s.reason === 'away') ? 'time away' : gapSkips.some((s) => s.reason === 'ill') ? 'illness' : 'the break';
    flags.push({
      kind: 're-entry',
      message: `Re-entry ${rampIndex + 1}/${ramp.sessions} after ${gap} days (${reason}): loads at ${Math.round(mods.loadFactor * 100)}%${mods.setDelta ? ', one fewer set' : ''}.`,
    });
  }

  // ---- illness: first session back is lighter regardless of gap length
  if (skipsSinceLast.some((s) => s.reason === 'ill')) {
    mods.loadFactor = Math.min(mods.loadFactor, 0.9);
    mods.setDelta = -1;
    mods.rirDelta = Math.max(mods.rirDelta, 1);
    easyConditioning = true;
    flags.push({
      kind: 'ill-return',
      message: 'First session after illness: ~90% loads, one fewer set, +1 RIR, easy conditioning. Stop if symptoms return.',
    });
  }

  // ---- repeated low-motivation skips
  const motivation = skipsInWindow(history, today, 21).filter((s) => s.reason === 'motivation');
  const latestIsMotivation = skipsSinceLast.some((s) => s.reason === 'motivation');
  if (latestIsMotivation && motivation.length >= 2) {
    mods.volumeFactor = 0.8;
    flags.push({
      kind: 'motivation',
      message: `${motivation.length} low-motivation skips in 3 weeks: accessory volume trimmed ~20% today. If this keeps happening, fatigue may be building.`,
    });
  }

  // ---- busy: suggest the short session
  if (skipsSinceLast.some((s) => s.reason === 'busy')) {
    flags.push({ kind: 'short-on-time', message: 'Busy lately? “Short on time” keeps the priority work and trims the rest.' });
  }

  return { mods, flags, easyConditioning };
}
