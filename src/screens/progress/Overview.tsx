import { useMemo } from 'react';
import { adherence, blockSummaries, liftSeries, trackedLifts, trendPerWeek, WEAK_POINT_MUSCLES, weeklyVolume } from '../../analytics';
import type { Achievement } from '../../analytics/badges';
import { getMovement, prescribeNextSession } from '../../engine';
import { kg, shortDate } from '../../app/format';
import type { AppData } from '../../data/store';
import { Capsule, Card } from '../../ui/components';
import { BarChart, Stat } from '../../ui/charts';
import { IconChevronRight, IconTrophy } from '../../ui/icons';
import type { ProgressTab } from '../Progress';

export const MUSCLE_LABEL: Record<string, string> = {
  'delts-side': 'Side delts',
  'delts-rear': 'Rear delts',
  'chest-upper': 'Upper chest',
  lats: 'Lats',
  chest: 'Chest',
  'upper-back': 'Upper back',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  biceps: 'Biceps',
  triceps: 'Triceps',
  calves: 'Calves',
  abs: 'Abs',
};

/** Evidence-based weekly hard-set range for hypertrophy, shown as a reference band. */
export const SET_BAND: [number, number] = [10, 20];

function weekLabel(iso: string) {
  const [, m, d] = iso.split('-').map(Number);
  return `${d}/${m}`;
}

export function Overview({ data, today, achievements, onOpen }: { data: AppData; today: string; achievements: Achievement[]; onOpen: (t: ProgressTab) => void }) {
  const freq = data.state!.track.frequency;
  const adh = useMemo(() => adherence(data.history, today, freq, 12), [data.history, today, freq]);
  const vol = useMemo(() => weeklyVolume(data.history, today, 8), [data.history, today]);
  const blocks = useMemo(() => blockSummaries(data.history), [data.history]);
  const next = useMemo(
    () => prescribeNextSession({ settings: data.settings, state: data.state!, history: data.history, today }),
    [data, today],
  );
  const lifts = useMemo(
    () =>
      trackedLifts(data.history)
        .slice(0, 4)
        .map((id) => {
          const { points, metric } = liftSeries(data.history, id);
          return { id, name: getMovement(id).name, metric, last: points.at(-1), trend: trendPerWeek(points.map((p) => ({ date: p.date, e1rm: p.e1rm }))) };
        })
        .filter((l) => l.last),
    [data.history],
  );
  const thisWeek = adh.weeks[adh.weeks.length - 1];
  const records = achievements.filter((a) => a.kind !== 'badge').slice(-4).reverse();

  return (
    <div className="stack" style={{ gap: 'var(--s4)' }}>
      <Card>
        <div className="pg-head-row">
          <Capsule tone="signal">{next.phase === 'calibration' ? 'Calibration' : `Block ${next.blockNumber}`}</Capsule>
          {next.blockLengthWeeks > 1 && (
            <span className="faint" style={{ fontSize: 'var(--fs-xs)' }}>
              week {next.weekInBlock} of {next.blockLengthWeeks}
            </span>
          )}
        </div>
        <div className="pg-stats">
          <Stat value={`${thisWeek.sessions}/${freq}`} label="this week" />
          <Stat value={adh.streak} unit={adh.streak === 1 ? 'week' : 'weeks'} label="on-target streak" />
          <Stat value={`${Math.round(adh.rate * 100)}`} unit="%" label="12-week adherence" />
        </div>
        <div className="pg-weekstrip" aria-label="Sessions per week, last 12 weeks">
          {adh.weeks.map((w) => (
            <span key={w.weekStart} title={`${shortDate(w.weekStart)}: ${w.sessions}/${w.target}`} className={w.sessions >= w.target ? 'is-full' : w.sessions > 0 ? 'is-part' : ''}>
              <i style={{ transform: `scaleY(${Math.min(1, w.sessions / w.target)})` }} />
            </span>
          ))}
        </div>
        <div className="pg-weekstrip-legend faint">
          <span>12 weeks ago</span>
          <span>this week</span>
        </div>
      </Card>

      <div className="section-label" style={{ margin: 'var(--s2) 0 0' }}>
        <span className="eyebrow">Weak points · hard sets per week</span>
      </div>
      <div className="pg-multiples">
        {WEAK_POINT_MUSCLES.map((m) => {
          const now = vol[vol.length - 1].muscles[m] ?? 0;
          const prev = vol.slice(-5, -1).map((w) => w.muscles[m] ?? 0);
          const avg = prev.reduce((a, b) => a + b, 0) / Math.max(1, prev.length);
          return (
            <Card key={m} className="pg-multiple">
              <div className="pg-multiple-head">
                <span>{MUSCLE_LABEL[m]}</span>
                <span className="display">{Number(now.toFixed(1))}</span>
              </div>
              <BarChart
                compact
                height={64}
                tone="signal"
                band={SET_BAND}
                label={`${MUSCLE_LABEL[m]} sets per week`}
                format={(v) => `${Number(v.toFixed(1))} sets`}
                bars={vol.map((w, i) => ({ key: w.weekStart, label: weekLabel(w.weekStart), value: w.muscles[m] ?? 0, emphasis: true, detail: `Week of ${shortDate(w.weekStart)}${i === vol.length - 1 ? ' (so far)' : ''}` }))}
              />
              <div className="faint pg-multiple-foot">4-wk avg {avg.toFixed(1)}</div>
            </Card>
          );
        })}
      </div>
      <p className="pg-note">Shaded band: 10–20 hard sets a week, the range most hypertrophy research supports. This week is still in progress.</p>

      {lifts.length > 0 && (
        <Card onClick={() => onOpen('strength')} as="button">
          <div className="pg-card-title">
            <span className="eyebrow">Main lifts</span>
            <IconChevronRight size={18} />
          </div>
          {lifts.map((l) => (
            <div key={l.id} className="pg-lift">
              <span>{l.name}</span>
              <span className="pg-lift-val">
                <span className="display">{kg(Math.round(l.last!.e1rm * 2) / 2)}</span>
                <small>{l.metric === 'e1rm' ? 'kg e1RM' : 'kg best'}</small>
              </span>
              <span className={`pg-trend ${l.trend != null && l.trend > 0.1 ? 'is-up' : l.trend != null && l.trend < -0.1 ? 'is-down' : ''}`}>
                {l.trend == null ? '—' : `${l.trend >= 0 ? '+' : ''}${l.trend.toFixed(1)} kg/wk`}
              </span>
            </div>
          ))}
        </Card>
      )}

      {records.length > 0 && (
        <Card onClick={() => onOpen('badges')} as="button">
          <div className="pg-card-title">
            <span className="eyebrow">Latest records</span>
            <IconChevronRight size={18} />
          </div>
          {records.map((r) => (
            <div key={r.id} className="pg-record">
              <IconTrophy size={18} />
              <span>
                <b>{r.title}</b> <span className="faint">{r.detail}</span>
              </span>
              <span className="faint num">{shortDate(r.date)}</span>
            </div>
          ))}
        </Card>
      )}

      {blocks.length > 0 && (
        <>
          <div className="section-label" style={{ margin: 'var(--s2) 0 0' }}>
            <span className="eyebrow">Blocks</span>
          </div>
          {blocks.slice(0, 3).map((b) => (
            <Card key={b.blockNumber}>
              <div className="pg-head-row">
                <b>
                  Block {b.blockNumber} {b.blockNumber === data.state!.blockNumber && <Capsule>In progress</Capsule>}
                </b>
                <span className="faint num" style={{ fontSize: 'var(--fs-xs)' }}>
                  {shortDate(b.from)} – {shortDate(b.to)}
                </span>
              </div>
              <p className="pg-block-line">
                {b.sessions} sessions over {b.weeks} week{b.weeks > 1 ? 's' : ''}
                {b.deloadSessions ? `, incl. ${b.deloadSessions} deload` : ''}. Weak points averaged {b.weakPointSetsPerWeek.toFixed(0)} hard sets a week.
              </p>
              {b.liftChanges.map((l) => (
                <div key={l.movementId} className="pg-lift pg-lift-compact">
                  <span>{l.name}</span>
                  <span className="num faint">
                    {kg(Math.round(l.from))} → {kg(Math.round(l.to))}
                  </span>
                  <span className={`pg-trend ${l.to > l.from ? 'is-up' : l.to < l.from ? 'is-down' : ''}`}>
                    {l.to >= l.from ? '+' : ''}
                    {(l.to - l.from).toFixed(1)}
                  </span>
                </div>
              ))}
              {b.benchmarks.length > 0 && (
                <div className="pg-block-line faint">
                  {b.benchmarks.map((x) => `${x.name} ${x.label}${x.pr ? ' (PR)' : ''}`).join(' · ')}
                </div>
              )}
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
