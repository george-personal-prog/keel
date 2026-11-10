import { useCallback, useMemo, useState } from 'react';
import { prescribeNextSession, type Flag, type SessionPrescription, type SkipReason } from '../engine';
import { createDraft, progress } from '../app/draft';
import { componentText, exerciseSummary, kg, longDate, PHASE_LABEL, wodMeta } from '../app/format';
import { declineDeloadToday, localToday, recordSkip, saveDraft, type AppData } from '../data/store';
import { Button, Capsule, Card, Sheet, Toast, Waterline } from '../ui/components';
import { haptic } from '../ui/haptics';
import { IconBolt, IconChevronRight, IconInfo, IconSkip, IconTimer, IconWave, KeelMark } from '../ui/icons';

const SKIP_REASONS: { id: SkipReason; title: string; body: string }[] = [
  { id: 'motivation', title: 'Not feeling it', body: 'Once is fine. If it keeps happening, volume comes down.' },
  { id: 'busy', title: 'Busy, no time', body: 'No penalty. Try “short on time” next time.' },
  { id: 'ill', title: 'Ill', body: 'Your first session back will be lighter.' },
  { id: 'away', title: 'Away / holiday', body: 'Long breaks get a gradual re-entry ramp.' },
];

const SHORT_OPTIONS = [20, 30, 40, 45];

function flagTone(f: Flag): { tone: string; Icon: typeof IconInfo } {
  switch (f.kind) {
    case 'deload':
    case 'deload-review':
      return { tone: 'flag-brass', Icon: IconBolt };
    case 're-entry':
    case 'ill-return':
    case 'motivation':
      return { tone: 'flag-signal', Icon: IconInfo };
    case 'calibration':
    case 'spotlight':
      return { tone: 'flag-sea', Icon: IconWave };
    case 'short-on-time':
    case 'budget-trim':
      return { tone: '', Icon: IconTimer };
    default:
      return { tone: '', Icon: IconInfo };
  }
}

export function Today({ data, onOpenLogger }: { data: AppData; onOpenLogger: () => void }) {
  const today = localToday();
  const [availableMin, setAvailableMin] = useState<number | undefined>();
  const [sheet, setSheet] = useState<'skip' | 'short' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

  const prescription: SessionPrescription = useMemo(
    () =>
      data.draft?.prescription ??
      prescribeNextSession({ settings: data.settings, state: data.state!, history: data.history, today, options: { availableMin } }),
    [data, today, availableMin],
  );

  const draft = data.draft;
  const p = prescription;
  const skippedToday = data.history.skips.filter((s) => s.date === today);
  const blockProgress = p.blockLengthWeeks > 1 ? (p.weekInBlock - 1) / p.blockLengthWeeks : 0;
  const flags = p.flags.filter((f) => f.kind !== 'budget-trim' && (f.kind !== 'deload' || !p.deload?.evidence.length));
  const trimNote = p.flags.find((f) => f.kind === 'budget-trim');

  const start = async () => {
    haptic('success');
    if (!draft) await saveDraft(createDraft(p, today, Date.now()));
    onOpenLogger();
  };

  const skip = async (reason: SkipReason) => {
    haptic();
    await recordSkip(reason, today);
    setSheet(null);
    setToast('Skipped. This session waits for you.');
  };

  return (
    <>
      <Toast message={toast} onDone={clearToast} />
      <header className="screen-head" style={{ marginBottom: 0 }}>
        <div>
          <div className="eyebrow">{longDate(today)}</div>
        </div>
        <KeelMark size={26} />
      </header>

      <section className="today-hero">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Capsule tone={p.phase === 'deload' ? 'brass' : p.phase === 'calibration' ? 'sea' : 'signal'}>{PHASE_LABEL[p.phase]}</Capsule>
          {p.spotlight && <Capsule>Spotlight · {p.spotlight.replace('-', ' ')}</Capsule>}
          {availableMin && !draft && <Capsule>{availableMin} min</Capsule>}
        </div>
        <h1 className="display">{p.title.split(' · ').map((part, i) => (i === 0 ? <span key={i}>{part}</span> : <em key={i}> · {part}</em>))}</h1>
        <div className="today-meta">
          <span>
            <b className="num">~{p.estimatedMin}</b> min
          </span>
          <span>
            <b className="num">{p.exercises.length}</b> exercises
          </span>
          {p.conditioning && (
            <span>
              <b>{p.conditioning.format === 'intervals' ? 'Intervals' : 'WOD'}</b> {p.conditioning.durationMin} min
            </span>
          )}
          <span className="faint">Session {p.sessionNumber}</span>
        </div>
        {p.blockLengthWeeks > 1 && (
          <div className="today-block">
            <div className="today-block-row">
              <span>Block {p.blockNumber}</span>
              <span>
                Week {p.weekInBlock} of {p.blockLengthWeeks}
              </span>
            </div>
            <Waterline value={blockProgress + 1 / p.blockLengthWeeks / 2} />
          </div>
        )}
      </section>

      <div className="stack">
        {p.deload && p.deload.evidence.length > 0 && !draft && (
          <Card className="deload-card">
            <Capsule tone="brass">Deload recommended</Capsule>
            <h3 style={{ marginTop: 12 }}>Your numbers say it’s time to back off for a week.</h3>
            <ul>
              {p.deload.evidence.slice(0, 5).map((e, i) => (
                <li key={i}>{e.detail}</li>
              ))}
            </ul>
            <div className="actions">
              <Button
                variant="ghost"
                onClick={async () => {
                  await declineDeloadToday();
                  setToast('Training as normal. We’ll check again in 2 weeks.');
                }}
              >
                Train normally
              </Button>
            </div>
          </Card>
        )}

        {flags.map((f, i) => {
          const { tone, Icon } = flagTone(f);
          return (
            <div key={i} className={`flag ${tone}`}>
              <Icon size={20} />
              <span>{f.message}</span>
            </div>
          );
        })}

        {skippedToday.length > 0 && !draft && (
          <div className="flag">
            <IconSkip size={20} />
            <span>Skipped today ({SKIP_REASONS.find((r) => r.id === skippedToday[skippedToday.length - 1].reason)?.title.toLowerCase()}). The session is still here when you’re ready.</span>
          </div>
        )}
      </div>

      <div className="section-label">
        <span className="eyebrow">Warm-up · {p.warmup.minutes} min</span>
      </div>
      <Card>
        <div className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
          {p.warmup.steps.join(' · ')}
          {p.warmup.rampSets?.length ? (
            <div className="num" style={{ marginTop: 6, color: 'var(--text)' }}>
              {p.warmup.rampSets.map((s) => `${kg(s.loadKg)}×${s.reps}`).join('   ')}
            </div>
          ) : null}
        </div>
      </Card>

      <div className="section-label">
        <span className="eyebrow">Training</span>
      </div>
      <Card>
        <div className="preview-list">
          {p.exercises.map((e) => {
            const s = exerciseSummary(e);
            return (
              <div className="preview-item" key={e.slotKey}>
                <Capsule tone={e.role === 'weak-point' ? 'signal' : 'default'}>{e.label}</Capsule>
                <div>
                  <div className="preview-name">{e.movementName}</div>
                  <div className="preview-scheme">
                    {s.scheme}
                    {e.tempo ? ` · tempo ${e.tempo}` : ''}
                    {e.technique ? ` · ${e.technique.replace('-', ' ')}` : ''}
                  </div>
                </div>
                <div className="preview-load display">
                  {s.load.endsWith(' kg') ? (
                    <>
                      {s.load.replace(' kg', '')}
                      <small>kg</small>
                    </>
                  ) : (
                    <small style={{ fontSize: 'var(--fs-sm)' }}>{s.load}</small>
                  )}
                </div>
                <div className="preview-why">{e.why}</div>
              </div>
            );
          })}
        </div>
      </Card>

      {trimNote && <p className="trim-note">{trimNote.message}</p>}

      {p.conditioning && (
        <>
          <div className="section-label">
            <span className="eyebrow">Conditioning</span>
          </div>
          <Card className="wod-card">
            <Capsule tone="sea">{p.conditioning.format === 'test' ? 'Test' : p.conditioning.benchmark ? 'Benchmark' : wodMeta(p.conditioning)}</Capsule>
            <h3 className="display">{p.conditioning.name}</h3>
            <div className="wod-structure">{p.conditioning.structure}</div>
            <ul className="wod-components">
              {p.conditioning.components.map((c, i) => (
                <li key={i}>
                  <span>
                    {componentText(c)}
                    {c.note && <span className="faint"> · {c.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
            {p.conditioning.target && <div className="wod-target">{p.conditioning.target}</div>}
            <div className="preview-why" style={{ marginTop: 8 }}>
              {p.conditioning.why}
            </div>
          </Card>
        </>
      )}

      <div className="today-spacer" />

      <div className="dock">
        <div className="dock-inner">
          <Button variant="primary" size="lg" block onClick={start} icon={draft ? undefined : undefined}>
            {draft ? `Resume session · ${Math.round(progress(draft) * 100)}%` : 'Start session'}
          </Button>
          {!draft && (
            <div className="dock-row">
              <Button icon={<IconTimer size={20} />} onClick={() => setSheet('short')}>
                {availableMin ? `${availableMin} min` : 'Short on time'}
              </Button>
              <Button icon={<IconSkip size={20} />} onClick={() => setSheet('skip')}>
                Skip today
              </Button>
            </div>
          )}
        </div>
      </div>

      <Sheet open={sheet === 'skip'} onClose={() => setSheet(null)} title="Skip today">
        <p className="muted" style={{ marginTop: 0, fontSize: 'var(--fs-sm)' }}>
          Nothing is lost: this session stays next in line. The reason shapes what comes next.
        </p>
        <div className="choice-list">
          {SKIP_REASONS.map((r) => (
            <button key={r.id} className="choice" onClick={() => skip(r.id)}>
              <div>
                <b>{r.title}</b>
                <span>{r.body}</span>
              </div>
              <IconChevronRight />
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={sheet === 'short'} onClose={() => setSheet(null)} title="How long have you got?">
        <p className="muted" style={{ marginTop: 0, fontSize: 'var(--fs-sm)' }}>
          The main lifts stay. Accessory sets and conditioning are trimmed first, and you’ll see exactly what was cut.
        </p>
        <div className="choice-list">
          {SHORT_OPTIONS.map((m) => (
            <button
              key={m}
              className={`choice ${availableMin === m ? 'is-on' : ''}`}
              onClick={() => {
                haptic();
                setAvailableMin(m);
                setSheet(null);
              }}
            >
              <div>
                <b className="num">{m} minutes</b>
              </div>
              <IconChevronRight />
            </button>
          ))}
          {availableMin && (
            <Button
              variant="ghost"
              onClick={() => {
                setAvailableMin(undefined);
                setSheet(null);
              }}
            >
              Back to the full session
            </Button>
          )}
        </div>
      </Sheet>
    </>
  );
}
