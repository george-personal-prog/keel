/**
 * HARD RESTRICTION: no steep overhead pressing.
 *
 * The rule is attribute-based rather than a name blacklist, so a newly added movement
 * cannot slip through just because nobody remembered to list it:
 *   - anything inverted (handstands, HSPU, handstand walks, pike push-ups) is banned;
 *   - any upper-body-driven PRESS whose path is steeper than 60° is banned
 *     (strict press, DB/machine shoulder press, Arnold, Z-press, push press...).
 * Leg-driven ballistic overhead work (jerks, thrusters, wall balls, snatches),
 * static overhead support (overhead squat) and hanging work are allowed.
 *
 * The movement library is filtered through this at module load, and the generator,
 * swap lists and WOD builders only ever read from the filtered library.
 */

import type { Movement } from '../types';

export const MAX_PRESS_ANGLE_DEG = 60;

export interface RestrictionResult {
  banned: boolean;
  reason?: string;
}

export function checkRestriction(m: Movement): RestrictionResult {
  if (m.inverted || m.pattern === 'inverted') {
    return { banned: true, reason: 'Inverted / handstand work is excluded.' };
  }
  if (m.pattern === 'vertical-press') {
    return { banned: true, reason: 'Vertical pressing is excluded.' };
  }
  if (m.overhead?.kind === 'press' && m.overhead.pressAngleDeg > MAX_PRESS_ANGLE_DEG) {
    return {
      banned: true,
      reason: `Pressing at ${m.overhead.pressAngleDeg}° exceeds the ${MAX_PRESS_ANGLE_DEG}° limit.`,
    };
  }
  return { banned: false };
}

export function isAllowed(m: Movement): boolean {
  return !checkRestriction(m).banned;
}
