import { getMovement, type ExercisePrescription, type PrescribedSet, type WodComponent, type WodPrescription } from '../engine';

export function kg(v: number | null | undefined): string {
  if (v == null) return '—';
  return String(Number(v.toFixed(2)));
}

export function mmss(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function parseMmss(text: string): number | undefined {
  const t = text.trim();
  if (!t) return undefined;
  const m = t.match(/^(\d+):(\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
}

export function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function repsText(s: PrescribedSet): string {
  return s.repRange ? `${s.repRange[0]}–${s.repRange[1]}` : String(s.reps);
}

/** "Top 6 @ RIR 2 · 2 × 8" / "4 × 12–20 @ RIR 2" */
export function exerciseSummary(e: ExercisePrescription): { scheme: string; load: string } {
  const sets = e.sets;
  const first = sets[0];
  const loadOf = (s: PrescribedSet) => (s.loadKg == null ? (e.calibrating ? 'find load' : 'bodyweight') : `${kg(s.loadKg)} kg`);
  if (first.kind === 'top') {
    const backs = sets.filter((s) => s.kind === 'backoff');
    const scheme = `Top ${first.reps} @ RIR ${first.targetRir}${backs.length ? ` · ${backs.length} × ${backs[0].reps}` : ''}`;
    return { scheme, load: loadOf(first) };
  }
  const allSame = sets.every((s) => s.reps === first.reps && s.loadKg === first.loadKg);
  const scheme = `${sets.length} × ${first.repRange ? repsText(first) : allSame ? first.reps : sets.map((s) => s.reps).join('/')} @ RIR ${first.targetRir}`;
  return { scheme, load: loadOf(first) };
}

export function componentText(c: WodComponent): string {
  const name = getMovement(c.movementId).name;
  const qty = c.calories != null ? `${c.calories} cal` : c.metres != null ? `${c.metres} m` : c.reps != null ? `${c.reps}` : '';
  const load = c.loadKg != null ? ` · ${kg(c.loadKg)} kg` : '';
  return `${qty ? qty + ' ' : ''}${name}${load}`;
}

export function wodMeta(w: WodPrescription): string {
  const label: Record<string, string> = {
    amrap: 'AMRAP',
    'for-time': 'For time',
    emom: 'EMOM',
    intervals: 'Intervals',
    chipper: 'Chipper',
    test: 'Test',
  };
  return `${label[w.format]} · ${w.durationMin} min`;
}

export const PHASE_LABEL: Record<string, string> = {
  calibration: 'Calibration',
  hypertrophy: 'Hypertrophy',
  accumulation: 'Accumulation',
  intensification: 'Intensification',
  peak: 'Peak',
  taper: 'Taper',
  deload: 'Deload',
};
