import { useMemo, useState } from 'react';
import { DAY_TEMPLATES, getMovement, type SessionLog } from '../engine';
import { kg, mmss, PHASE_LABEL, shortDate } from '../app/format';
import { updateSessionNotes, type AppData } from '../data/store';
import { Capsule, Card, Sheet } from '../ui/components';
import { IconChevronRight, IconHistory, IconSkip } from '../ui/icons';

const SKIP_LABEL = { motivation: 'Not feeling it', busy: 'Busy', ill: 'Ill', away: 'Away' } as const;

type Item = { kind: 'session'; date: string; s: SessionLog } | { kind: 'skip'; date: string; reason: keyof typeof SKIP_LABEL };

function monthLabel(iso: string) {
  const [y, m] = iso.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function scoreText(s: SessionLog): string | undefined {
  const c = s.conditioning;
  if (!c) return undefined;
  const sc = c.score;
  if (sc.timeSec != null) return mmss(sc.timeSec);
  if (sc.rounds != null) return `${sc.rounds}+${sc.reps ?? 0}`;
  if (sc.calories != null) return `${sc.calories} cal`;
  if (sc.reps != null) return `${sc.reps} reps`;
  return undefined;
}

export function History({ data }: { data: AppData }) {
  const [open, setOpen] = useState<SessionLog | null>(null);
  const items: Item[] = useMemo(() => {
    const all: Item[] = [
      ...data.history.sessions.map((s) => ({ kind: 'session' as const, date: s.date, s })),
      ...data.history.skips.map((k) => ({ kind: 'skip' as const, date: k.date, reason: k.reason })),
    ];
    return all.sort((a, b) => b.date.localeCompare(a.date) || (a.kind === 'session' && b.kind === 'session' ? b.s.sessionNumber - a.s.sessionNumber : 0));
  }, [data.history]);

  const groups = useMemo(() => {
    const out: { month: string; items: Item[] }[] = [];
    for (const it of items) {
      const m = monthLabel(it.date);
      if (out[out.length - 1]?.month !== m) out.push({ month: m, items: [] });
      out[out.length - 1].items.push(it);
    }
    return out;
  }, [items]);

  return (
    <>
      <header className="screen-head">
        <div>
          <div className="eyebrow">{data.history.sessions.length} session{data.history.sessions.length === 1 ? "" : "s"} logged</div>
          <h1 className="display screen-title">History</h1>
        </div>
      </header>

      {items.length === 0 && (
        <div className="empty">
          <IconHistory size={36} />
          <h2 className="display">Nothing logged yet</h2>
          <p>Finished sessions and skipped days appear here, newest first.</p>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.month}>
          <div className="section-label">
            <span className="eyebrow">{g.month}</span>
          </div>
          <Card className="hist-card">
            {g.items.map((it, i) =>
              it.kind === 'session' ? (
                <button key={it.s.id} className="hist-row" onClick={() => setOpen(it.s)}>
                  <span className="hist-date num">{shortDate(it.date)}</span>
                  <span className="hist-main">
                    <b>{DAY_TEMPLATES[it.s.dayTypeId]?.title ?? 'Session'}</b>
                    <span>
                      {(() => {
                        const n = it.s.exercises.reduce((a, e) => a + e.sets.length, 0);
                        return `${n} set${n === 1 ? '' : 's'}`;
                      })()}
                      {scoreText(it.s) ? ` · ${it.s.conditioning?.name} ${scoreText(it.s)}` : ''}
                    </span>
                    {(it.s.partial || it.s.phase === 'deload' || it.s.phase === 'calibration') && (
                      <span className="hist-caps">
                        {it.s.phase === 'calibration' && <Capsule tone="sea">Calibration</Capsule>}
                        {it.s.phase === 'deload' && <Capsule tone="brass">Deload</Capsule>}
                        {it.s.partial && <Capsule>Partial</Capsule>}
                      </span>
                    )}
                  </span>
                  <span className="hist-tags">
                    <IconChevronRight size={18} />
                  </span>
                </button>
              ) : (
                <div key={`skip-${i}`} className="hist-row hist-skip">
                  <span className="hist-date num">{shortDate(it.date)}</span>
                  <span className="hist-main">
                    <span>
                      <IconSkip size={14} /> Skipped · {SKIP_LABEL[it.reason]}
                    </span>
                  </span>
                </div>
              ),
            )}
          </Card>
        </section>
      ))}

      <Sheet
        open={!!open}
        onClose={() => setOpen(null)}
        title={open ? `${DAY_TEMPLATES[open.dayTypeId]?.title ?? 'Session'}` : ''}
      >
        {open && <SessionDetail s={open} />}
      </Sheet>
    </>
  );
}

function SessionDetail({ s }: { s: SessionLog }) {
  const [notes, setNotes] = useState(s.notes ?? '');
  return (
    <div className="stack">
      <div className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
        {shortDate(s.date)} · {PHASE_LABEL[s.phase]} · session {s.sessionNumber}
        {s.durationMin ? ` · ${s.durationMin} min` : ''}
      </div>
      {s.exercises.map((ex, i) => (
        <div key={i} className="hist-ex">
          <b>{getMovement(ex.movementId).name}</b>
          <div className="hist-sets num">
            {ex.sets.map((x, j) => (
              <span key={j}>
                {x.loadKg != null ? `${kg(x.loadKg)}×` : ''}
                {x.reps}
                {x.rir != null && <small> @{x.rir === 4 ? '4+' : x.rir}</small>}
              </span>
            ))}
          </div>
        </div>
      ))}
      {s.conditioning && (
        <div className="hist-ex">
          <b style={{ color: 'var(--sea)' }}>{s.conditioning.name}</b>
          <div className="hist-sets num">
            <span>{scoreText(s) ?? (s.conditioning.score.splits ? s.conditioning.score.splits.map((x) => (s.conditioning!.scoreType === 'time' ? mmss(x) : x)).join(' · ') : '—')}</span>
            {s.conditioning.score.rx === false && <span className="faint">scaled</span>}
            {s.conditioning.hr?.avg && <span className="faint">avg {s.conditioning.hr.avg} bpm</span>}
            {s.conditioning.hr?.max && <span className="faint">max {s.conditioning.hr.max}</span>}
          </div>
        </div>
      )}
      <div>
        <div className="eyebrow" style={{ margin: '8px 0' }}>
          Notes
        </div>
        <textarea rows={3} value={notes} placeholder="Add a note" onChange={(e) => setNotes(e.target.value)} onBlur={() => updateSessionNotes(s.id, notes)} />
      </div>
    </div>
  );
}
