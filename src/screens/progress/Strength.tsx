import { useMemo, useState } from 'react';
import { liftSeries, repPRs, trackedLifts, trendPerWeek, weeklyVolume } from '../../analytics';
import { getMovement, type Muscle } from '../../engine';
import { kg, shortDate } from '../../app/format';
import type { AppData } from '../../data/store';
import { Card } from '../../ui/components';
import { BarChart, LineChart, Stat } from '../../ui/charts';
import { haptic } from '../../ui/haptics';
import { MUSCLE_LABEL, SET_BAND } from './Overview';

const MUSCLE_ORDER: Muscle[] = ['delts-side', 'delts-rear', 'chest-upper', 'lats', 'chest', 'upper-back', 'quads', 'hamstrings', 'glutes', 'biceps', 'triceps'];
const WEAK = new Set<Muscle>(['delts-side', 'delts-rear', 'chest-upper', 'lats']);

export function StrengthView({ data, today }: { data: AppData; today: string }) {
  const lifts = useMemo(() => trackedLifts(data.history), [data.history]);
  const [lift, setLift] = useState<string | undefined>(lifts[0]);
  const current = lift && lifts.includes(lift) ? lift : lifts[0];
  const series = useMemo(() => (current ? liftSeries(data.history, current) : undefined), [data.history, current]);
  const prs = useMemo(() => (current ? repPRs(data.history, current) : []), [data.history, current]);
  const vol = useMemo(() => weeklyVolume(data.history, today, 8), [data.history, today]);

  if (!current || !series) return <div className="chart-empty">Log a loaded lift twice to see it here.</div>;
  const pts = series.points;
  const last = pts.at(-1)!;
  const best = pts.reduce((b, p) => (p.e1rm > b.e1rm ? p : b), pts[0]);
  const trend = trendPerWeek(pts.map((p) => ({ date: p.date, e1rm: p.e1rm })));
  const first = pts[0];
  const avg4 = (m: Muscle) => vol.slice(-5, -1).reduce((a, w) => a + (w.muscles[m] ?? 0), 0) / 4;
  const maxAvg = Math.max(SET_BAND[1], ...MUSCLE_ORDER.map(avg4));

  return (
    <div className="stack" style={{ gap: 'var(--s4)' }}>
      <div className="pg-chips" role="tablist" aria-label="Lift">
        {lifts.map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={id === current}
            className={id === current ? 'is-on' : ''}
            onClick={() => {
              haptic();
              setLift(id);
            }}
          >
            {getMovement(id).name}
          </button>
        ))}
      </div>

      <Card>
        <div className="pg-stats">
          <Stat value={kg(Math.round(last.e1rm * 2) / 2)} unit="kg" label={series.metric === 'e1rm' ? 'current e1RM' : 'latest best make'} />
          <Stat value={kg(Math.round(best.e1rm * 2) / 2)} unit="kg" label={`best · ${shortDate(best.date)}`} tone="brass" />
          <Stat
            value={trend == null ? '—' : `${trend >= 0 ? '+' : ''}${trend.toFixed(1)}`}
            unit={trend == null ? undefined : 'kg/wk'}
            label="8-week trend"
            delta={pts.length > 1 ? { text: `${last.e1rm >= first.e1rm ? '+' : ''}${(last.e1rm - first.e1rm).toFixed(1)} kg since ${shortDate(first.date)}`, good: last.e1rm > first.e1rm ? true : last.e1rm < first.e1rm ? false : null } : undefined}
          />
        </div>
        <div style={{ marginTop: 'var(--s5)' }}>
          <LineChart
            label={`${getMovement(current).name} ${series.metric === 'e1rm' ? 'estimated 1RM' : 'best make'}`}
            format={(v) => `${Math.round(v)}`}
            points={pts.map((p) => ({ date: p.date, y: p.e1rm, highlight: p.pr, detail: `${kg(p.load)} kg × ${p.reps}${p.rir != null ? ` @ RIR ${p.rir === 4 ? '4+' : p.rir}` : ''}` }))}
          />
        </div>
        <p className="pg-note" style={{ margin: 'var(--s3) 0 0' }}>
          {series.metric === 'e1rm'
            ? 'e1RM = load × (1 + (reps + RIR) ÷ 30) from your best set each session. Gold dots are new bests.'
            : 'Olympic lifts show your heaviest clean make each session, since reps don’t extrapolate for skill lifts.'}
        </p>
      </Card>

      {prs.length > 0 && (
        <Card>
          <div className="pg-card-title">
            <span className="eyebrow">Rep records</span>
          </div>
          <div className="pg-reptable">
            {prs.map((p) => (
              <div key={p.reps} className="pg-rep">
                <span className="display">{p.reps}</span>
                <small>{p.reps === 1 ? 'rep' : 'reps'}</small>
                <b className="num">{kg(p.loadKg)} kg</b>
                <span className="faint num">{shortDate(p.date)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <div className="pg-card-title">
          <span className="eyebrow">Hard sets per muscle · 4-week average</span>
        </div>
        <div className="bars">
          {MUSCLE_ORDER.map((m) => {
            const v = avg4(m);
            return (
              <div key={m} className={`bar ${WEAK.has(m) ? 'is-weak' : ''}`}>
                <span>{MUSCLE_LABEL[m]}</span>
                <span className="bar-track">
                  <span className="bar-band" style={{ left: `${(SET_BAND[0] / maxAvg) * 100}%`, width: `${((SET_BAND[1] - SET_BAND[0]) / maxAvg) * 100}%` }} />
                  <span className="bar-fill" style={{ width: `${(v / maxAvg) * 100}%` }} />
                </span>
                <span className="num">{v.toFixed(1)}</span>
              </div>
            );
          })}
        </div>
        <p className="pg-note" style={{ margin: 'var(--s3) 0 0' }}>
          Prime movers count 1 set, synergists ½. Orange = weak points. Shaded = 10–20 sets.
        </p>
      </Card>

      <Card>
        <div className="pg-card-title">
          <span className="eyebrow">Weekly volume · hard sets</span>
        </div>
        <BarChart
          label="Hard sets per week"
          format={(v) => `${Math.round(v)}`}
          bars={vol.map((w, i) => ({
            key: w.weekStart,
            label: `${Number(w.weekStart.slice(8))}/${Number(w.weekStart.slice(5, 7))}`,
            value: w.hardSets,
            emphasis: i === vol.length - 1,
            detail: `${w.sessions} sessions · ${(w.tonnage / 1000).toFixed(1)} t moved`,
          }))}
        />
      </Card>
    </div>
  );
}
