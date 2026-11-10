import { useMemo, useState } from 'react';
import { DEFAULT_SETTINGS, createInitialState, prescribeNextSession, type Focus, type Frequency } from './engine';

/**
 * Phase 1 holding page: shows what the engine prescribes for the first session of each track.
 * Replaced by the real app shell in phase 2.
 */
export default function App() {
  const [focus, setFocus] = useState<Focus>('off-season');
  const [frequency, setFrequency] = useState<Frequency>(4);
  const sessions = useMemo(() => {
    let state = { ...createInitialState({ focus, frequency }), calibrated: true };
    return Array.from({ length: frequency }, () => {
      const p = prescribeNextSession({ settings: DEFAULT_SETTINGS, state, history: { sessions: [], skips: [] }, today: '2026-01-05' });
      state = { ...state, cursor: state.cursor + 1 };
      return p;
    });
  }, [focus, frequency]);

  return (
    <main>
      <h1>
        KEEL<span>.</span>
      </h1>
      <p className="muted">Phase 1: programming engine. This page previews a week of sessions before any history is logged. The real app arrives in phase 2.</p>
      <p>
        <select value={focus} onChange={(e) => setFocus(e.target.value as Focus)}>
          <option value="off-season">Off-season</option>
          <option value="competition">Competition</option>
        </select>{' '}
        <select value={frequency} onChange={(e) => setFrequency(Number(e.target.value) as Frequency)}>
          {[3, 4, 5, 6].map((f) => (
            <option key={f} value={f}>
              {f}× / week
            </option>
          ))}
        </select>
      </p>
      {sessions.map((s) => (
        <section key={s.sessionNumber}>
          <strong>{s.title}</strong> <span className="muted">· ~{s.estimatedMin} min · {s.subtitle}</span>
          {s.exercises.map((e) => (
            <div className="ex" key={e.slotKey}>
              <span className="label">{e.label}</span>
              <span>
                {e.movementName}
                {e.tempo ? <span className="muted"> · tempo {e.tempo}</span> : null}
                <div className="sets">{e.sets.map((x) => `${x.loadKg ?? '—'}×${x.reps} @${x.targetRir}`).join('  ')}</div>
              </span>
              <span className="why">{e.why}</span>
            </div>
          ))}
          {s.conditioning ? (
            <div className="ex">
              <span className="label">WOD</span>
              <span>
                {s.conditioning.name} <span className="muted">· {s.conditioning.structure}</span>
              </span>
              <span className="why">{s.conditioning.why}</span>
            </div>
          ) : null}
        </section>
      ))}
    </main>
  );
}
