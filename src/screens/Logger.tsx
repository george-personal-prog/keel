import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getMovement,
  prescribeNextSession,
  roundLoad,
  swapExercise,
  type ExercisePrescription,
  type HeartRateEntry,
  type LoadType,
  type Settings,
  type WodScore,
} from '../engine';
import {
  addSet,
  afterSet,
  nextFocus,
  nextOpenSet,
  progress,
  replaceExercise,
  setLoad,
  suggestedLoad,
  updateSet,
  type Draft,
  type DraftExercise,
} from '../app/draft';
import { componentText, kg, mmss, parseMmss, wodMeta } from '../app/format';
import { discardDraft, finishSession, saveDraft, swapForBlock, type AppData } from '../data/store';
import { Button, Capsule, IconButton, RirChips, Segmented, Sheet, Stepper, Toast, Waterline } from '../ui/components';
import { haptic } from '../ui/haptics';
import { IconCheck, IconClose, IconHeart, IconNote, IconPlus, IconSwap, IconTimer } from '../ui/icons';
import { useWakeLock } from '../app/pwa';
import './logger.css';

function stepFor(loadType: LoadType, s: Settings): number {
  const eq = s.equipment;
  switch (loadType) {
    case 'barbell':
      return 2 * Math.min(...eq.platesKg);
    case 'dumbbell':
      return eq.dumbbellStepKg;
    case 'cable':
      return eq.cableStepKg;
    case 'machine':
      return eq.machineStepKg;
    case 'weighted-bodyweight':
      return eq.beltStepKg;
    case 'kettlebell':
      return 4;
    default:
      return 2.5;
  }
}

const SET_KIND_LABEL: Record<string, string> = { top: 'Top', backoff: 'Back', working: '', calibration: 'Find', warmup: 'W' };

type EditTarget = { exIdx: number; setIdx: number; logAfter: boolean };

export function Logger({ data, draft: initial, onClose, onFinished }: { data: AppData; draft: Draft; onClose: () => void; onFinished: (id: string) => void }) {
  const [draft, setDraftState] = useState<Draft>(initial);
  const [edit, setEdit] = useState<EditTarget | null>(null);
  const [openRir, setOpenRir] = useState<{ exIdx: number; setIdx: number } | null>(null);
  const [swapIdx, setSwapIdx] = useState<number | null>(null);
  const [sheet, setSheet] = useState<'leave' | 'notes' | 'wod' | 'finish' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [editSeq, setEditSeq] = useState(0);
  const [wodSeq, setWodSeq] = useState(0);
  const openEdit = (t: EditTarget) => {
    setEditSeq((n) => n + 1);
    setEdit(t);
  };
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  useWakeLock(true); // screen stays on during the session
  const clearToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  const commit = useCallback((d: Draft) => {
    setDraftState(d);
    void saveDraft(d);
  }, []);

  const [focus, setFocus] = useState<{ exIdx: number; setIdx: number } | undefined>();
  const focusOpen = focus && draft.exercises[focus.exIdx]?.sets[focus.setIdx] && !draft.exercises[focus.exIdx].sets[focus.setIdx].done;
  const current = focusOpen ? focus : nextOpenSet(draft);
  const finishRef = useRef<HTMLDivElement>(null);
  const complete = progress(draft) >= 1;
  useEffect(() => {
    if (complete) finishRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [complete]);
  const pct = progress(draft);

  // ------------------------------------------------------------------ logging
  const logSet = (exIdx: number, setIdx: number, d0: Draft = draft) => {
    const ex = d0.exercises[exIdx];
    const s = ex.sets[setIdx];
    const m = getMovement(ex.prescription.movementId);
    const needsLoad = s.loadKg == null && !['bodyweight', 'none', 'erg'].includes(m.loadType);
    if (needsLoad) {
      const suggestion = suggestedLoad(ex, setIdx);
      if (suggestion != null) d0 = setLoad(d0, exIdx, setIdx, suggestion, false);
      setDraftState(d0);
      openEdit({ exIdx, setIdx, logAfter: true });
      return;
    }
    haptic();
    let d = updateSet(d0, exIdx, setIdx, { done: true });
    const next = afterSet(d, exIdx, setIdx);
    if (next.kind === 'rest') {
      const isLastSetOfSession = !nextOpenSet(d);
      d = isLastSetOfSession ? { ...d, rest: undefined } : { ...d, rest: { endsAt: Date.now() + next.sec * 1000, durationSec: next.sec, label: ex.prescription.label } };
    } else {
      d = { ...d, rest: undefined };
      const partnerIdx = d.exercises.findIndex((e) => e.prescription.label === next.label);
      setToast(`Now ${next.label} · ${d.exercises[partnerIdx].prescription.movementName}`);
      cardRefs.current[partnerIdx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setOpenRir({ exIdx, setIdx });
    setFocus(nextFocus(d, exIdx, setIdx));
    commit(d);
  };

  const undoSet = (exIdx: number, setIdx: number) => {
    haptic();
    commit(updateSet(draft, exIdx, setIdx, { done: false }));
    setOpenRir(null);
  };

  // ------------------------------------------------------------------ swap
  const doSwap = async (exIdx: number, movementId: string, scope: 'today' | 'block') => {
    const ex = draft.exercises[exIdx].prescription;
    const tmpState = swapExercise(data.state!, ex.slotId, movementId);
    const regenerated = prescribeNextSession({ settings: data.settings, state: tmpState, history: data.history, today: draft.date });
    const replacement = regenerated.exercises.find((e) => e.slotKey === ex.slotKey);
    if (!replacement) return;
    const fixed: ExercisePrescription = { ...replacement, label: ex.label, group: ex.group, priority: ex.priority };
    if (scope === 'block') await swapForBlock(ex.slotId, movementId);
    haptic();
    commit(replaceExercise(draft, exIdx, fixed));
    setSwapIdx(null);
    setToast(scope === 'block' ? 'Swapped for the rest of this block' : 'Swapped for today');
  };


  const finish = async () => {
    haptic('success');
    const id = await finishSession(draft);
    onFinished(id);
  };

  const p = draft.prescription;

  return (
    <div className="logger">
      <Toast message={toast} onDone={clearToast} />
      <header className="lg-head">
        <IconButton label="Close session" onClick={() => setSheet('leave')}>
          <IconClose />
        </IconButton>
        <div className="lg-head-mid">
          <div className="lg-head-title">{p.title}</div>
          <div className="lg-head-sub num">
            <Elapsed since={draft.startedAt} /> elapsed · ~{p.estimatedMin} min plan
          </div>
        </div>
        <IconButton label="Session notes" onClick={() => setSheet('notes')} className={draft.notes ? 'has-dot' : ''}>
          <IconNote />
        </IconButton>
        <div className="lg-head-progress">
          <Waterline value={pct} />
        </div>
      </header>

      <main className="lg-main">
        {p.warmup.rampSets?.length ? (
          <section className="lg-warmup">
            <div className="eyebrow">Warm-up · ramp sets</div>
            <div className="lg-ramp num">
              {p.warmup.rampSets.map((s, i) => (
                <span key={i}>
                  <b>{kg(s.loadKg)}</b>×{s.reps}
                </span>
              ))}
            </div>
          </section>
        ) : (
          <section className="lg-warmup">
            <div className="eyebrow">Warm-up · {p.warmup.minutes} min</div>
            <div className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
              {p.warmup.steps.join(' · ')}
            </div>
          </section>
        )}

        {draft.exercises.map((ex, exIdx) => (
          <ExerciseCard
            key={`${ex.prescription.slotKey}:${ex.prescription.movementId}`}
            refCb={(el) => (cardRefs.current[exIdx] = el)}
            ex={ex}
            exIdx={exIdx}
            current={current}
            openRir={openRir}
            groupStart={!!ex.prescription.group && draft.exercises[exIdx - 1]?.prescription.group !== ex.prescription.group}
            groupEnd={!!ex.prescription.group && draft.exercises[exIdx + 1]?.prescription.group !== ex.prescription.group}
            onLog={(setIdx) => logSet(exIdx, setIdx)}
            onUndo={(setIdx) => undoSet(exIdx, setIdx)}
            onEdit={(setIdx) => openEdit({ exIdx, setIdx, logAfter: false })}
            onRir={(setIdx, rir) => {
              commit(updateSet(draft, exIdx, setIdx, { rir }));
              setTimeout(() => setOpenRir(null), 250);
            }}
            onToggleRir={(setIdx) => setOpenRir(openRir?.exIdx === exIdx && openRir.setIdx === setIdx ? null : { exIdx, setIdx })}
            onAddSet={() => {
              haptic();
              commit(addSet(draft, exIdx));
            }}
            onSwap={() => setSwapIdx(exIdx)}
          />
        ))}

        {p.conditioning && draft.conditioning && (
          <section className={`lg-wod ${draft.conditioning.done ? 'is-done' : ''}`}>
            <div className="lg-card-top">
              <Capsule tone="sea">{p.conditioning.format === 'test' ? 'Test' : p.conditioning.benchmark ? 'Benchmark' : wodMeta(p.conditioning)}</Capsule>
              {draft.conditioning.done && <Capsule tone="ok">Logged</Capsule>}
            </div>
            <h2 className="display lg-wod-name">{p.conditioning.name}</h2>
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
            <Button variant={draft.conditioning.done ? 'secondary' : 'sea'} size="lg" block onClick={() => {
              setWodSeq((n) => n + 1);
              setSheet('wod');
            }} style={{ marginTop: 16 }}>
              {draft.conditioning.done ? 'Edit score' : 'Log score'}
            </Button>
          </section>
        )}

        <div className={`lg-finish ${complete ? 'is-ready' : ''}`} ref={finishRef}>
          <Button variant={pct >= 1 ? 'primary' : 'secondary'} size="lg" block onClick={() => (pct >= 1 ? finish() : setSheet('finish'))}>
            {pct >= 1 ? 'Finish session' : 'Finish early'}
          </Button>
        </div>
      </main>

      {draft.rest && (
        <RestBar
          endsAt={draft.rest.endsAt}
          total={draft.rest.durationSec}
          onAdjust={(delta) => commit({ ...draft, rest: { ...draft.rest!, endsAt: draft.rest!.endsAt + delta * 1000, durationSec: Math.max(15, draft.rest!.durationSec + delta) } })}
          onSkip={() => commit({ ...draft, rest: undefined })}
        />
      )}

      {/* ---------------------------------------------------------- sheets */}
      <EditSetSheet
        key={`edit-${editSeq}`}
        target={edit}
        draft={draft}
        settings={data.settings}
        onClose={() => setEdit(null)}
        onSave={(d, logAfter, t) => {
          setEdit(null);
          if (logAfter) logSet(t.exIdx, t.setIdx, d);
          else commit(d);
        }}
      />

      <Sheet open={swapIdx != null} onClose={() => setSwapIdx(null)} title="Swap exercise">
        {swapIdx != null && <SwapBody ex={draft.exercises[swapIdx]} onSwap={(id, scope) => doSwap(swapIdx, id, scope)} />}
      </Sheet>

      <WodSheet
        key={`wod-${wodSeq}`}
        open={sheet === 'wod'}
        draft={draft}
        onClose={() => setSheet(null)}
        onSave={(score, hr) => {
          haptic('success');
          commit({ ...draft, conditioning: { score, hr, done: true } });
          setSheet(null);
        }}
      />

      <Sheet open={sheet === 'notes'} onClose={() => setSheet(null)} title="Session notes" footer={<Button variant="primary" onClick={() => setSheet(null)}>Done</Button>}>
        <textarea rows={5} placeholder="How did it feel? Anything to remember next time?" value={draft.notes} onChange={(e) => commit({ ...draft, notes: e.target.value })} />
      </Sheet>

      <Sheet open={sheet === 'leave'} onClose={() => setSheet(null)} title="Leave this session?">
        <p className="muted" style={{ marginTop: 0, fontSize: 'var(--fs-sm)' }}>
          Everything you’ve logged is saved on this phone. Pick up where you left off from Today.
        </p>
        <div className="stack">
          <Button variant="primary" size="lg" block onClick={onClose}>
            Keep for later
          </Button>
          <Button
            variant="danger"
            block
            onClick={async () => {
              await discardDraft();
              onClose();
            }}
          >
            Discard session
          </Button>
        </div>
      </Sheet>

      <Sheet open={sheet === 'finish'} onClose={() => setSheet(null)} title="Finish early?">
        <p className="muted" style={{ marginTop: 0, fontSize: 'var(--fs-sm)' }}>
          The sets you logged are saved and count toward progression. Unlogged work is simply dropped, and the next session in the queue comes up.
        </p>
        <Button variant="primary" size="lg" block onClick={finish}>
          Save {Math.round(pct * 100)}% and finish
        </Button>
      </Sheet>
    </div>
  );
}

// ==================================================================== exercise card

function ExerciseCard({
  ex,
  exIdx,
  current,
  openRir,
  groupStart,
  groupEnd,
  refCb,
  onLog,
  onUndo,
  onEdit,
  onRir,
  onToggleRir,
  onAddSet,
  onSwap,
}: {
  ex: DraftExercise;
  exIdx: number;
  current?: { exIdx: number; setIdx: number };
  openRir: { exIdx: number; setIdx: number } | null;
  groupStart: boolean;
  groupEnd: boolean;
  refCb: (el: HTMLElement | null) => void;
  onLog: (setIdx: number) => void;
  onUndo: (setIdx: number) => void;
  onEdit: (setIdx: number) => void;
  onRir: (setIdx: number, rir: number) => void;
  onToggleRir: (setIdx: number) => void;
  onAddSet: () => void;
  onSwap: () => void;
}) {
  const e = ex.prescription;
  const m = getMovement(e.movementId);
  const allDone = ex.sets.every((s) => s.done);
  const anyDone = ex.sets.some((s) => s.done);
  const loaded = !['bodyweight', 'none', 'erg'].includes(m.loadType);
  const loadUnit = m.loadType === 'weighted-bodyweight' ? '+kg' : 'kg';

  return (
    <section ref={refCb} className={`lg-card ${allDone ? 'is-done' : ''} ${e.group ? 'in-group' : ''} ${groupStart ? 'group-start' : ''} ${groupEnd ? 'group-end' : ''}`}>
      {groupStart && <div className="lg-group-label eyebrow">Superset {e.group}</div>}
      <div className="lg-card-top">
        <Capsule tone={e.role === 'weak-point' ? 'signal' : 'default'}>{e.label}</Capsule>
        {e.tempo && <span className="lg-chip-meta">Tempo {e.tempo}</span>}
        <span className="lg-chip-meta">
          <IconTimer size={14} /> {mmss(e.restSec)}
        </span>
        <span style={{ flex: 1 }} />
        {!anyDone && e.swapOptions.length > 0 && (
          <IconButton label={`Swap ${e.movementName}`} onClick={onSwap}>
            <IconSwap size={20} />
          </IconButton>
        )}
      </div>
      <h2 className="lg-name">{e.movementName}</h2>
      <p className="lg-why">{e.why}</p>
      {e.technique && <p className="lg-technique">{e.sets[e.sets.length - 1].note}</p>}

      <div className="lg-sets">
        {ex.sets.map((s, setIdx) => {
          const isCurrent = current?.exIdx === exIdx && current.setIdx === setIdx;
          const showRir = s.done && openRir?.exIdx === exIdx && openRir.setIdx === setIdx;
          const rirOff = s.done && s.rir != null && s.rir !== s.prescribed.targetRir;
          return (
            <div key={setIdx} className={`lg-set ${s.done ? 'is-done' : ''} ${isCurrent ? 'is-current' : ''}`}>
              <div className="lg-set-row">
                <span className="lg-set-idx">
                  <span className="num">{setIdx + 1}</span>
                  {SET_KIND_LABEL[s.prescribed.kind] && <small>{SET_KIND_LABEL[s.prescribed.kind]}</small>}
                </span>
                <button className="lg-val" onClick={() => onEdit(setIdx)} aria-label="Edit load">
                  {loaded ? (
                    s.loadKg == null ? (
                      <span className="lg-val-empty">Set load</span>
                    ) : (
                      <>
                        <span className="display">{kg(s.loadKg)}</span>
                        <small>{loadUnit}</small>
                      </>
                    )
                  ) : (
                    <small>BW</small>
                  )}
                </button>
                <button className="lg-val" onClick={() => onEdit(setIdx)} aria-label="Edit reps">
                  <span className="display">{s.reps}</span>
                  <small>{s.prescribed.repRange ? `of ${s.prescribed.repRange[0]}–${s.prescribed.repRange[1]}` : 'reps'}</small>
                </button>
                <button
                  className={`lg-rir ${rirOff ? 'is-off' : ''} rir-c-${s.rir ?? s.prescribed.targetRir}`}
                  onClick={() => (s.done ? onToggleRir(setIdx) : onEdit(setIdx))}
                  aria-label="Reps in reserve"
                >
                  <small>RIR</small>
                  <span className="display">{s.rir === 4 ? '4+' : (s.rir ?? s.prescribed.targetRir)}</span>
                </button>
                <button
                  className={`lg-check ${s.done ? 'is-done' : ''}`}
                  aria-label={s.done ? 'Undo set' : 'Log set'}
                  onClick={() => (s.done ? onUndo(setIdx) : onLog(setIdx))}
                >
                  <IconCheck size={26} />
                </button>
              </div>
              {showRir && (
                <div className="lg-rir-pop">
                  <span className="eyebrow">How many more could you have done?</span>
                  <RirChips compact value={s.rir} target={s.prescribed.targetRir} onChange={(v) => onRir(setIdx, v)} />
                </div>
              )}
              {s.prescribed.note && !s.done && isCurrent && s.prescribed.kind !== 'working' && <div className="lg-set-note">{s.prescribed.note}</div>}
            </div>
          );
        })}
      </div>
      <button className="lg-add" onClick={onAddSet}>
        <IconPlus size={16} /> Add set
      </button>
    </section>
  );
}

// ==================================================================== rest bar

/** Ticks on its own so the rest of the logger doesn't re-render every second. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function Elapsed({ since }: { since: number }) {
  const now = useNow(1000);
  return <>{mmss((now - since) / 1000)}</>;
}

function RestBar({ endsAt, total, onAdjust, onSkip }: { endsAt: number; total: number; onAdjust: (d: number) => void; onSkip: () => void }) {
  const now = useNow(250);
  const left = Math.min(total, Math.max(0, Math.ceil((endsAt - now) / 1000)));
  const done = left <= 0;
  const buzzed = useRef(false);
  useEffect(() => {
    if (done && !buzzed.current) {
      buzzed.current = true;
      haptic('success');
    }
    if (!done) buzzed.current = false;
  }, [done]);
  return (
    <div className={`restbar ${done ? 'is-done' : ''}`} role="timer" aria-live="off">
      <div className="restbar-fill" style={{ transform: `scaleX(${done ? 1 : 1 - left / total})` }} />
      <button className="restbar-btn" onClick={() => onAdjust(-15)} aria-label="15 seconds less">
        −15
      </button>
      <div className="restbar-mid">
        <span className="eyebrow">{done ? 'Rest done' : 'Rest'}</span>
        <span className="display restbar-time">{done ? 'Go' : mmss(left)}</span>
      </div>
      <button className="restbar-btn" onClick={() => onAdjust(15)} aria-label="15 seconds more">
        +15
      </button>
      <button className="restbar-btn restbar-skip" onClick={onSkip}>
        {done ? 'Hide' : 'Skip'}
      </button>
    </div>
  );
}

// ==================================================================== edit set

function EditSetSheet({
  target,
  draft,
  settings,
  onClose,
  onSave,
}: {
  target: EditTarget | null;
  draft: Draft;
  settings: Settings;
  onClose: () => void;
  onSave: (d: Draft, logAfter: boolean, t: EditTarget) => void;
}) {
  const ex = target ? draft.exercises[target.exIdx] : undefined;
  const s = ex && target ? ex.sets[target.setIdx] : undefined;
  const m = ex ? getMovement(ex.prescription.movementId) : undefined;
  // State initialises from the target; the parent remounts this component (key) for each new edit.
  const [load, setLoadV] = useState(() => {
    if (!s || !ex || !target || !m) return 0;
    const bar = m.loadType === 'barbell' ? settings.equipment.barKgByMovement[m.id] ?? m.barKg ?? settings.equipment.defaultBarKg : 0;
    return s.loadKg ?? suggestedLoad(ex, target.setIdx) ?? bar;
  });
  const [reps, setReps] = useState(() => s?.reps ?? 0);
  const [rir, setRir] = useState<number | null>(() => s?.rir ?? null);
  const [poor, setPoor] = useState(() => !!s?.techniquePoor);
  const [carry, setCarry] = useState(true);

  if (!target || !ex || !s || !m) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  const loaded = !['bodyweight', 'none', 'erg'].includes(m.loadType);
  const remaining = ex.sets.filter((x, i) => i > target.setIdx && !x.done).length;

  const save = (log: boolean) => {
    let d = draft;
    if (loaded) d = setLoad(d, target.exIdx, target.setIdx, load, carry, (x) => roundLoad(x, m, settings.equipment, 'nearest') ?? x);
    d = updateSet(d, target.exIdx, target.setIdx, { reps, rir, techniquePoor: poor || undefined });
    onSave(d, log, target);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={
        <span>
          {ex.prescription.movementName} <span className="faint">· set {target.setIdx + 1}</span>
        </span>
      }
      footer={
        <>
          <Button onClick={() => save(false)}>Save</Button>
          {!s.done && (
            <Button variant="primary" onClick={() => save(true)}>
              Save & log
            </Button>
          )}
        </>
      }
    >
      <div className="stack" style={{ gap: 'var(--s5)' }}>
        {loaded && (
          <div>
            <Stepper label={m.loadType === 'weighted-bodyweight' ? 'Added load' : 'Load'} value={load} onChange={setLoadV} step={stepFor(m.loadType, settings)} unit="kg" />
            {remaining > 0 && (
              <label className="lg-carry">
                <input type="checkbox" checked={carry} onChange={(e) => setCarry(e.target.checked)} />
                <span>Use for the remaining {remaining} set{remaining > 1 ? 's' : ''}</span>
              </label>
            )}
          </div>
        )}
        <Stepper label={s.prescribed.repRange ? `Reps (range ${s.prescribed.repRange[0]}–${s.prescribed.repRange[1]})` : `Reps (target ${s.prescribed.reps})`} value={reps} onChange={setReps} step={1} min={0} decimal={false} />
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Reps in reserve · target {s.prescribed.targetRir}
          </div>
          <RirChips value={rir} target={s.prescribed.targetRir} onChange={setRir} />
        </div>
        {ex.prescription.scheme === 'olympic' && (
          <Segmented
            label="Technique"
            value={poor ? 'poor' : 'good'}
            onChange={(v) => setPoor(v === 'poor')}
            options={[
              { value: 'good', label: 'Technique held' },
              { value: 'poor', label: 'Broke down' },
            ]}
          />
        )}
      </div>
    </Sheet>
  );
}

// ==================================================================== swap

function SwapBody({ ex, onSwap }: { ex: DraftExercise; onSwap: (id: string, scope: 'today' | 'block') => void }) {
  const [scope, setScope] = useState<'today' | 'block'>('today');
  const options = useMemo(() => ex.prescription.swapOptions.map((id) => getMovement(id)), [ex]);
  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0, fontSize: 'var(--fs-sm)' }}>
        Same movement pattern, so your history stays linked. Loads are worked out for the new exercise.
      </p>
      <Segmented
        label="Swap scope"
        value={scope}
        onChange={setScope}
        options={[
          { value: 'today', label: 'Today only' },
          { value: 'block', label: 'Rest of block' },
        ]}
      />
      <div className="choice-list">
        {options.map((o) => (
          <button key={o.id} className="choice" onClick={() => onSwap(o.id, scope)}>
            <div>
              <b>{o.name}</b>
              <span>{o.tags.includes('lengthened-bias') ? 'Lengthened bias · ' : ''}{o.tags.includes('unilateral') ? 'Unilateral · ' : ''}{o.loadType.replace('-', ' ')}</span>
            </div>
            <IconSwap size={20} />
          </button>
        ))}
      </div>
    </div>
  );
}

// ==================================================================== WOD score

function WodSheet({ open, draft, onClose, onSave }: { open: boolean; draft: Draft; onClose: () => void; onSave: (score: WodScore, hr?: HeartRateEntry) => void }) {
  const w = draft.prescription.conditioning;
  const prev = draft.conditioning;
  // Initialised from any saved score; the parent remounts this sheet (key) each time it opens.
  const init = prev?.score ?? {};
  const fmtSplit = (x: number) => (w?.scoreType === 'time' ? mmss(x) : String(x));
  const [time, setTime] = useState(init.timeSec != null ? mmss(init.timeSec) : '');
  const [rounds, setRounds] = useState(init.rounds?.toString() ?? '');
  const [reps, setReps] = useState(init.reps?.toString() ?? '');
  const [cals, setCals] = useState(init.calories?.toString() ?? '');
  const [metres, setMetres] = useState(init.metres?.toString() ?? '');
  const [load, setLoadV] = useState(init.loadKg?.toString() ?? '');
  const [rx, setRx] = useState(init.rx ?? true);
  const [splits, setSplits] = useState<string[]>(() => Array.from({ length: w?.intervals?.rounds ?? 0 }, (_, i) => (init.splits?.[i] != null ? fmtSplit(init.splits[i]) : '')));
  const [avg, setAvg] = useState(prev?.hr?.avg?.toString() ?? '');
  const [max, setMax] = useState(prev?.hr?.max?.toString() ?? '');
  const [zones, setZones] = useState<string[]>(prev?.hr?.zonesSec ? prev.hr.zonesSec.map((z) => String(Math.round(z / 60))) : ['', '', '', '', '']);
  const [showZones, setShowZones] = useState(!!prev?.hr?.zonesSec);

  if (!w) return null;
  const isIntervals = w.format === 'intervals' && !!w.intervals;
  const paceSplits = isIntervals && w.scoreType === 'time';
  const num = (t: string) => (t.trim() === '' ? undefined : Number(t));

  const save = () => {
    const score: WodScore = { rx };
    if (isIntervals) {
      const parsed = splits.map((x) => (paceSplits ? parseMmss(x) : num(x))).filter((x): x is number => x != null && Number.isFinite(x));
      if (parsed.length) score.splits = parsed;
      if (!paceSplits && parsed.length) score.calories = parsed.reduce((a, b) => a + b, 0);
    } else {
      if (w.scoreType === 'time') score.timeSec = parseMmss(time);
      if (w.scoreType === 'rounds-reps') {
        score.rounds = num(rounds);
        score.reps = num(reps);
      }
      if (w.scoreType === 'reps') score.reps = num(reps);
      if (w.scoreType === 'calories') score.calories = num(cals);
      if (w.scoreType === 'metres') score.metres = num(metres);
      if (w.scoreType === 'load') score.loadKg = num(load);
    }
    const hr: HeartRateEntry = {};
    if (num(avg)) hr.avg = num(avg);
    if (num(max)) hr.max = num(max);
    const z = zones.map((x) => (num(x) ?? 0) * 60);
    if (z.some((x) => x > 0)) hr.zonesSec = z;
    onSave(score, Object.keys(hr).length ? hr : undefined);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={w.name}
      footer={
        <Button variant="sea" size="lg" onClick={save}>
          Save score
        </Button>
      }
    >
      <div className="stack" style={{ gap: 'var(--s5)' }}>
        {isIntervals ? (
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              {paceSplits ? 'Pace per round (mm:ss /500 m)' : 'Calories per round'}
              {w.intervals?.target ? ` · target ${w.intervals.target}` : ''}
            </div>
            <div className="lg-splits">
              {splits.map((v, i) => (
                <label key={i} className="lg-field">
                  <span>R{i + 1}</span>
                  <input inputMode={paceSplits ? 'text' : 'numeric'} placeholder={paceSplits ? '1:45' : '15'} value={v} onChange={(e) => setSplits(splits.map((x, j) => (j === i ? e.target.value : x)))} />
                </label>
              ))}
            </div>
          </div>
        ) : (
          <div className="lg-score">
            {w.scoreType === 'time' && (
              <label className="lg-field lg-field-big">
                <span>Time (mm:ss)</span>
                <input className="display" inputMode="text" placeholder="7:42" value={time} onChange={(e) => setTime(e.target.value)} />
              </label>
            )}
            {w.scoreType === 'rounds-reps' && (
              <div className="lg-two">
                <label className="lg-field lg-field-big">
                  <span>Rounds</span>
                  <input className="display" inputMode="numeric" value={rounds} onChange={(e) => setRounds(e.target.value)} />
                </label>
                <label className="lg-field lg-field-big">
                  <span>+ reps</span>
                  <input className="display" inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} />
                </label>
              </div>
            )}
            {w.scoreType === 'reps' && (
              <label className="lg-field lg-field-big">
                <span>Total reps</span>
                <input className="display" inputMode="numeric" value={reps} onChange={(e) => setReps(e.target.value)} />
              </label>
            )}
            {w.scoreType === 'calories' && (
              <label className="lg-field lg-field-big">
                <span>Calories</span>
                <input className="display" inputMode="numeric" value={cals} onChange={(e) => setCals(e.target.value)} />
              </label>
            )}
            {w.scoreType === 'metres' && (
              <label className="lg-field lg-field-big">
                <span>Metres</span>
                <input className="display" inputMode="numeric" value={metres} onChange={(e) => setMetres(e.target.value)} />
              </label>
            )}
            {w.scoreType === 'load' && (
              <label className="lg-field lg-field-big">
                <span>Load (kg)</span>
                <input className="display" inputMode="decimal" value={load} onChange={(e) => setLoadV(e.target.value)} />
              </label>
            )}
          </div>
        )}

        {w.format !== 'test' && !isIntervals && (
          <Segmented
            label="Rx or scaled"
            value={rx ? 'rx' : 'scaled'}
            onChange={(v) => setRx(v === 'rx')}
            options={[
              { value: 'rx', label: 'As prescribed' },
              { value: 'scaled', label: 'Scaled' },
            ]}
          />
        )}

        <div>
          <div className="eyebrow lg-hr-label">
            <IconHeart size={16} /> Heart rate (from Polar)
          </div>
          <div className="lg-two">
            <label className="lg-field">
              <span>Avg bpm</span>
              <input inputMode="numeric" value={avg} onChange={(e) => setAvg(e.target.value)} />
            </label>
            <label className="lg-field">
              <span>Max bpm</span>
              <input inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value)} />
            </label>
          </div>
          {showZones ? (
            <div className="lg-zones">
              {zones.map((z, i) => (
                <label key={i} className="lg-field">
                  <span>Z{i + 1} min</span>
                  <input inputMode="numeric" value={z} onChange={(e) => setZones(zones.map((x, j) => (j === i ? e.target.value : x)))} />
                </label>
              ))}
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setShowZones(true)}>
              + Time in zones
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
