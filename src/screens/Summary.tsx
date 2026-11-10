import { useEffect, useMemo, useState } from 'react';
import { bestSetE1rm, DAY_TEMPLATES, getMovement, type History, type SessionLog } from '../engine';
import { kg, mmss, shortDate } from '../app/format';
import { updateSessionNotes } from '../data/store';
import { Button, Capsule, Card } from '../ui/components';
import { IconTrophy, KeelMark } from '../ui/icons';
import './summary.css';

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

export function Summary({ session, history, onDone }: { session: SessionLog; history: History; onDone: () => void }) {
  const [notes, setNotes] = useState(session.notes ?? '');
  const hs = useMemo(() => highlights(session, history), [session, history]);
  useEffect(() => window.scrollTo({ top: 0 }), []);
  const prs = hs.filter((h) => h.isPR);
  const sets = session.exercises.reduce((a, e) => a + e.sets.length, 0);
  const tonnage = session.exercises.reduce((a, e) => a + e.sets.reduce((b, s) => b + (s.loadKg ?? 0) * s.reps, 0), 0);
  const title = DAY_TEMPLATES[session.dayTypeId]?.title ?? 'Session';
  const c = session.conditioning;

  return (
    <div className="sum">
      <div className="sum-hero">
        <KeelMark size={40} />
        <div className="eyebrow" style={{ marginTop: 16 }}>
          {shortDate(session.date)} · session {session.sessionNumber}
        </div>
        <h1 className="display">{session.partial ? 'Saved.' : 'Done.'}</h1>
        <p className="muted">{title}</p>
      </div>

      <div className="sum-stats">
        <div>
          <span className="display">{session.durationMin ?? '—'}</span>
          <small>minutes</small>
        </div>
        <div>
          <span className="display">{sets}</span>
          <small>sets</small>
        </div>
        <div>
          <span className="display">{tonnage >= 1000 ? (tonnage / 1000).toFixed(1) : Math.round(tonnage)}</span>
          <small>{tonnage >= 1000 ? 'tonnes' : 'kg moved'}</small>
        </div>
      </div>

      {prs.length > 0 && (
        <Card className="sum-prs">
          <div className="sum-prs-head">
            <IconTrophy size={22} />
            <span>
              {prs.length} new e1RM best{prs.length > 1 ? 's' : ''}
            </span>
          </div>
          {prs.map((h) => (
            <div key={h.movementId} className="sum-pr">
              <span>{h.name}</span>
              <span className="num">
                {Math.round(h.e1rm)} kg <small>+{(h.e1rm - h.prevBest).toFixed(1)}</small>
              </span>
            </div>
          ))}
        </Card>
      )}

      <div className="section-label">
        <span className="eyebrow">Best sets</span>
      </div>
      <Card>
        {hs.map((h) => (
          <div key={h.movementId} className="sum-row">
            <span>{h.name}</span>
            <span className="num">
              {h.best} {h.isPR && <Capsule tone="brass">PR</Capsule>}
            </span>
          </div>
        ))}
        {c && (
          <div className="sum-row">
            <span>{c.name}</span>
            <span className="num" style={{ color: 'var(--sea)' }}>
              {c.score.timeSec != null ? mmss(c.score.timeSec) : c.score.rounds != null ? `${c.score.rounds}+${c.score.reps ?? 0}` : c.score.calories != null ? `${c.score.calories} cal` : c.score.splits ? `${c.score.splits.length} rounds` : '✓'}
              {c.score.rx === false ? ' · scaled' : ''}
            </span>
          </div>
        )}
      </Card>

      <div className="section-label">
        <span className="eyebrow">Notes</span>
      </div>
      <textarea rows={3} placeholder="Anything worth remembering?" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => updateSessionNotes(session.id, notes)} />

      <div style={{ marginTop: 'var(--s6)' }}>
        <Button
          variant="primary"
          size="lg"
          block
          onClick={async () => {
            await updateSessionNotes(session.id, notes);
            onDone();
          }}
        >
          Done
        </Button>
      </div>
    </div>
  );
}
