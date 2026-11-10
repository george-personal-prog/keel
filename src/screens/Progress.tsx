import { useMemo, useState } from 'react';
import { computeAchievements } from '../analytics/badges';
import { localToday, type AppData } from '../data/store';
import { Segmented } from '../ui/components';
import { IconProgress } from '../ui/icons';
import { BadgesView } from './progress/Badges';
import { BodyView } from './progress/Body';
import { EngineView } from './progress/Engine';
import { Overview } from './progress/Overview';
import { StrengthView } from './progress/Strength';
import './progress/progress.css';

export type ProgressTab = 'overview' | 'strength' | 'engine' | 'body' | 'badges';

const TAB_KEY = 'keel.progress.tab';

export function Progress({ data }: { data: AppData }) {
  const [tab, setTabState] = useState<ProgressTab>(() => {
    try {
      return (localStorage.getItem(TAB_KEY) as ProgressTab) || 'overview';
    } catch {
      return 'overview';
    }
  });
  const setTab = (t: ProgressTab) => {
    setTabState(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* per-viewer convenience only */
    }
  };
  const today = localToday();
  const frequency = data.state?.track.frequency ?? 4;
  const achievements = useMemo(() => computeAchievements(data.history, frequency), [data.history, frequency]);

  return (
    <>
      <header className="screen-head" style={{ marginBottom: 'var(--s4)' }}>
        <div>
          <div className="eyebrow">Your coach’s report</div>
          <h1 className="display screen-title">Progress</h1>
        </div>
      </header>

      <div className="pg-tabs">
        <Segmented
          label="Progress section"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'overview', label: 'Overview' },
            { value: 'strength', label: 'Strength' },
            { value: 'engine', label: 'Engine' },
            { value: 'body', label: 'Body' },
            { value: 'badges', label: 'Badges' },
          ]}
        />
      </div>

      {data.history.sessions.length === 0 && tab !== 'body' && tab !== 'badges' ? (
        <div className="empty">
          <IconProgress size={36} />
          <h2 className="display">Your numbers start here</h2>
          <p>Finish calibration week and this fills with estimated maxes, weekly volume per muscle, benchmarks and records.</p>
        </div>
      ) : (
        <div className="pg-body" key={tab}>
          {tab === 'overview' && <Overview data={data} today={today} achievements={achievements} onOpen={setTab} />}
          {tab === 'strength' && <StrengthView data={data} today={today} />}
          {tab === 'engine' && <EngineView data={data} today={today} />}
          {tab === 'body' && <BodyView data={data} />}
          {tab === 'badges' && <BadgesView achievements={achievements} />}
        </div>
      )}
    </>
  );
}
