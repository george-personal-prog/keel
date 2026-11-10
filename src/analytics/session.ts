import { bestSetE1rm, getMovement, type History, type SessionLog } from '../engine';
import { kg } from '../app/format';

export interface ExerciseHighlight {
  movementId: string;
  name: string;
  best: string;
  e1rm: number;
  prevBest: number;
  isPR: boolean;
}

/** e1RM bests in this session vs everything before it. */
export function highlights(session: SessionLog, history: History): ExerciseHighlight[] {
  const before = history.sessions.filter((s) => s.id !== session.id && (s.date < session.date || (s.date === session.date && s.sessionNumber < session.sessionNumber)));
  return session.exercises.map((ex) => {
    const e1 = bestSetE1rm(ex.sets);
    const prev = Math.max(0, ...before.flatMap((s) => s.exercises.filter((x) => x.movementId === ex.movementId).map((x) => bestSetE1rm(x.sets))));
    const top = ex.sets.reduce((b, s) => ((s.loadKg ?? 0) > (b.loadKg ?? 0) ? s : b), ex.sets[0]);
    return {
      movementId: ex.movementId,
      name: getMovement(ex.movementId).name,
      best: top.loadKg != null ? `${kg(top.loadKg)} kg × ${top.reps}` : `${top.reps} reps`,
      e1rm: e1,
      prevBest: prev,
      isPR: e1 > 0 && prev > 0 && e1 > prev * 1.005 && ex.scheme !== 'olympic',
    };
  });
}
