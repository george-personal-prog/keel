import { useMemo } from 'react';
import { estimateE1rm, getMovement, loggedSetsByMuscle, type Muscle } from '../engine';
import { kg } from '../app/format';
import type { AppData } from '../data/store';
import { Card } from '../ui/components';
import { IconProgress } from '../ui/icons';

const MAIN_LIFTS = ['back-squat', 'front-squat', 'deadlift', 'incline-bench-press', 'bench-press', 'snatch', 'clean-and-jerk', 'weighted-pull-up'];

const MUSCLES: { id: Muscle; label: string; weak?: boolean }[] = [
  { id: 'delts-side', label: 'Side delts', weak: true },
  { id: 'delts-rear', label: 'Rear delts', weak: true },
  { id: 'chest-upper', label: 'Upper chest', weak: true },
  { id: 'lats', label: 'Lats', weak: true },
  { id: 'chest', label: 'Chest' },
  { id: 'upper-back', label: 'Upper back' },
  { id: 'quads', label: 'Quads' },
  { id: 'hamstrings', label: 'Hamstrings' },
  { id: 'glutes', label: 'Glutes' },
  { id: 'biceps', label: 'Biceps' },
  { id: 'triceps', label: 'Triceps' },
];

function daysAgo(n: number, today = new Date()): string {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function Progress({ data }: { data: AppData }) {
  const lifts = useMemo(
    () =>
      MAIN_LIFTS.map((id) => ({ id, est: estimateE1rm(data.history, id) }))
        .filter((x) => x.est?.source === 'history')
        .map((x) => ({ id: x.id, name: getMovement(x.id).name, e1rm: x.est!.e1rm })),
    [data.history],
  );
  const week = useMemo(() => {
    const since = daysAgo(7);
    const v = loggedSetsByMuscle(data.history.sessions.filter((s) => s.date > since));
    return MUSCLES.map((m) => ({ ...m, sets: v[m.id] ?? 0 }));
  }, [data.history]);
  const max = Math.max(10, ...week.map((w) => w.sets));

  return (
    <>
      <header className="screen-head">
        <div>
          <div className="eyebrow">Where you stand</div>
          <h1 className="display screen-title">Progress</h1>
        </div>
      </header>

      {data.history.sessions.length === 0 ? (
        <div className="empty">
          <IconProgress size={36} />
          <h2 className="display">Your numbers start here</h2>
          <p>After calibration week you’ll see estimated maxes and how much work each muscle gets. Full trend charts and badges come next.</p>
        </div>
      ) : (
        <>
          <div className="section-label">
            <span className="eyebrow">Estimated 1RM</span>
            <span className="faint" style={{ fontSize: 'var(--fs-xs)' }}>
              rolling, last 3 sessions
            </span>
          </div>
          <Card>
            {lifts.length === 0 && <div className="muted">Log a main lift to see it here.</div>}
            {lifts.map((l) => (
              <div className="lift-row" key={l.id}>
                <span>{l.name}</span>
                <span>
                  <span className="display">{kg(Math.round(l.e1rm * 2) / 2)}</span>
                  <small>kg</small>
                </span>
              </div>
            ))}
          </Card>

          <div className="section-label">
            <span className="eyebrow">Hard sets · last 7 days</span>
            <span className="faint" style={{ fontSize: 'var(--fs-xs)' }}>
              <span style={{ color: 'var(--signal)' }}>■</span> weak points
            </span>
          </div>
          <Card>
            <div className="bars">
              {week.map((w) => (
                <div key={w.id} className={`bar ${w.weak ? 'is-weak' : ''}`}>
                  <span>{w.label}</span>
                  <span className="bar-track">
                    <span style={{ width: `${(w.sets / max) * 100}%` }} />
                  </span>
                  <span className="num">{Number(w.sets.toFixed(1))}</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </>
  );
}
