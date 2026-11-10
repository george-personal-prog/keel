import { useMemo, useState } from 'react';
import { benchmarkHistories, intervalSeries, observedMaxHr, weeklyVolume } from '../../analytics';
import { mmss, shortDate } from '../../app/format';
import type { AppData } from '../../data/store';
import { Capsule, Card } from '../../ui/components';
import { BarChart, LineChart } from '../../ui/charts';
import { haptic } from '../../ui/haptics';

function fmtBench(v: number, label: string, direction: 'lower' | 'higher', isTime: boolean) {
  if (isTime) return mmss(v);
  if (label.includes('+')) return `${Math.floor(v / 1000)}+${v % 1000}`;
  return direction === 'higher' ? String(Math.round(v)) : String(v);
}

export function EngineView({ data, today }: { data: AppData; today: string }) {
  const benches = useMemo(() => benchmarkHistories(data.history), [data.history]);
  const intervals = useMemo(() => [...intervalSeries(data.history).entries()], [data.history]);
  const vol = useMemo(() => weeklyVolume(data.history, today, 8), [data.history, today]);
  const maxHr = useMemo(() => observedMaxHr(data.history), [data.history]);
  const [open, setOpen] = useState<string | null>(null);
  const openBench = benches.find((b) => b.id === open);

  return (
    <div className="stack" style={{ gap: 'var(--s4)' }}>
      <Card>
        <div className="pg-card-title">
          <span className="eyebrow">Benchmarks & tests</span>
        </div>
        {benches.length === 0 && <div className="chart-empty">Benchmarks and erg tests you log appear here, with your best and your last.</div>}
        {benches.map((b) => {
          const last = b.results.at(-1)!;
          const isTime = b.direction === 'lower';
          return (
            <button
              key={b.id}
              className={`pg-bench ${open === b.id ? 'is-open' : ''}`}
              onClick={() => {
                haptic();
                setOpen(open === b.id ? null : b.id);
              }}
            >
              <span className="pg-bench-name">
                <b>{b.name}</b>
                <span className="faint">
                  {b.results.length}× · last {shortDate(last.date)}
                </span>
              </span>
              <span className="pg-bench-score">
                <span className="display">{b.best?.label ?? last.label}</span>
                <small>{b.best ? 'best' : 'scaled'}</small>
              </span>
              {last.pr && <Capsule tone="brass">PR</Capsule>}
              {open === b.id && openBench && openBench.results.length > 1 && (
                <span className="pg-bench-chart" onClick={(e) => e.stopPropagation()}>
                  <LineChart
                    label={`${b.name} results`}
                    tone="sea"
                    height={150}
                    invert={b.direction === 'lower'}
                    format={(v) => fmtBench(v, last.label, b.direction, isTime)}
                    points={openBench.results.map((r) => ({ date: r.date, y: r.value, highlight: r.pr, detail: r.rx ? 'Rx' : 'Scaled' }))}
                  />
                </span>
              )}
            </button>
          );
        })}
      </Card>

      {intervals.map(([id, s]) => (
        <Card key={id}>
          <div className="pg-card-title">
            <span className="eyebrow">{s.name} · average {s.metric === 'pace' ? 'pace /500 m' : 'calories per round'}</span>
          </div>
          {s.points.length > 1 ? (
            <LineChart
              label={`${s.name} average`}
              tone="sea"
              height={150}
              invert={s.metric === 'pace'}
              target={s.points.at(-1)?.target}
              format={(v) => (s.metric === 'pace' ? mmss(v) : String(Math.round(v)))}
              points={s.points.map((p) => ({ date: p.date, y: p.avg, detail: p.target != null ? `target ${s.metric === 'pace' ? mmss(p.target) : p.target}` : undefined }))}
            />
          ) : (
            <div className="chart-empty">One session so far: the trend appears after the next.</div>
          )}
        </Card>
      ))}

      <Card>
        <div className="pg-card-title">
          <span className="eyebrow">Conditioning load per week</span>
        </div>
        <BarChart
          label="Heart-rate training load per week"
          tone="sea"
          bars={vol.map((w, i) => ({
            key: w.weekStart,
            label: `${Number(w.weekStart.slice(8))}/${Number(w.weekStart.slice(5, 7))}`,
            value: w.hrLoad,
            emphasis: true,
            detail: `Week of ${shortDate(w.weekStart)}${i === vol.length - 1 ? ' (so far)' : ''}`,
          }))}
        />
        <p className="pg-note" style={{ margin: 'var(--s3) 0 0' }}>
          Load = minutes in each heart-rate zone × the zone number (Edwards’ method). If you only log an average HR, the whole piece counts in that
          average’s zone. Zones use your highest logged max HR ({maxHr} bpm).
        </p>
      </Card>
    </div>
  );
}
