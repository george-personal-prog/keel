import { useEffect, useState } from 'react';
import type { Focus, Frequency, Settings, Track } from '../engine';
import { localToday, saveSettings, setTrack, type AppData } from '../data/store';
import { CloudBackupCard, DataTransfer } from './settings/Backup';
import { Button, Capsule, Card, Row, Segmented, Sheet, Stepper, Toast } from '../ui/components';
import { haptic } from '../ui/haptics';

export function SettingsScreen({ data }: { data: AppData }) {
  const state = data.state!;
  const [focus, setFocus] = useState<Focus>(state.track.focus);
  const [frequency, setFrequency] = useState<Frequency>(state.track.frequency);
  const [date, setDate] = useState(state.track.competitionDate ?? '');
  const [confirm, setConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, []);

  const draftTrack: Track = { focus, frequency, ...(focus === 'competition' && date ? { competitionDate: date } : {}) };
  const t = state.track;
  const changed = draftTrack.focus !== t.focus || draftTrack.frequency !== t.frequency || (draftTrack.competitionDate ?? '') !== (t.competitionDate ?? '');
  const onlyDate = draftTrack.focus === t.focus && draftTrack.frequency === t.frequency;

  const s = data.settings;
  const update = (patch: Partial<Settings>) => saveSettings({ ...s, ...patch });
  const updateEq = (patch: Partial<Settings['equipment']>) => saveSettings({ ...s, equipment: { ...s.equipment, ...patch } });

  const apply = async (timing: 'now' | 'next-block') => {
    haptic('success');
    await setTrack(draftTrack, timing);
    setConfirm(false);
    setToast(timing === 'now' ? 'Track switched' : 'Switches at the next block');
  };


  return (
    <>
      <Toast message={toast} onDone={() => setToast(null)} />
      <header className="screen-head">
        <div>
          <div className="eyebrow">Your setup</div>
          <h1 className="display screen-title">Settings</h1>
        </div>
      </header>

      <div className="section-label">
        <span className="eyebrow">Track</span>
        {state.pendingTrack && <Capsule tone="signal">Change queued</Capsule>}
      </div>
      <Card className="set-group">
        <div className="set-block">
          <Segmented
            label="Focus"
            value={focus}
            onChange={setFocus}
            options={[
              { value: 'off-season', label: 'Off-season' },
              { value: 'competition', label: 'Competition' },
            ]}
          />
          <Segmented label="Sessions per week" value={frequency} onChange={setFrequency} options={([3, 4, 5, 6] as const).map((f) => ({ value: f, label: `${f}×` }))} />
          {focus === 'competition' && (
            <label className="lg-field">
              <span>Competition date (optional)</span>
              <input type="date" value={date} min={localToday()} onChange={(e) => setDate(e.target.value)} style={{ colorScheme: 'dark' }} />
            </label>
          )}
          {changed && (
            <Button variant="primary" block onClick={() => (onlyDate ? apply('now') : setConfirm(true))}>
              {onlyDate ? 'Save date' : 'Apply change…'}
            </Button>
          )}
        </div>
      </Card>

      <div className="section-label">
        <span className="eyebrow">Sessions</span>
      </div>
      <Card className="set-group">
        <div className="set-block">
          <div className="eyebrow">Time budget incl. warm-up</div>
          <Segmented label="Session length" value={s.sessionBudgetMin} onChange={(v) => update({ sessionBudgetMin: v })} options={[45, 50, 60, 75].map((m) => ({ value: m, label: `${m} min` }))} />
        </div>
        <div className="set-block">
          <div className="eyebrow">Warm-up</div>
          <Segmented
            label="Warm-up style"
            value={s.warmupStyle}
            onChange={(v) => update({ warmupStyle: v })}
            options={[
              { value: 'ramp', label: 'Ramp sets' },
              { value: 'general', label: 'General prep' },
            ]}
          />
        </div>
      </Card>

      <div className="section-label">
        <span className="eyebrow">Equipment</span>
      </div>
      <Card className="set-group">
        <div className="set-block">
          <Stepper label="Barbell" value={s.equipment.defaultBarKg} onChange={(v) => updateEq({ defaultBarKg: v })} step={5} min={5} max={25} unit="kg" />
        </div>
        <div className="set-block">
          <Stepper label="Dumbbell jumps" value={s.equipment.dumbbellStepKg} onChange={(v) => updateEq({ dumbbellStepKg: v, dumbbellMinKg: v })} step={0.5} min={0.5} max={5} unit="kg" />
        </div>
        <div className="set-block">
          <Stepper label="Cable stack jumps" value={s.equipment.cableStepKg} onChange={(v) => updateEq({ cableStepKg: v })} step={0.5} min={0.5} max={10} unit="kg" />
        </div>
        <div className="set-block">
          <Stepper label="Machine stack jumps" value={s.equipment.machineStepKg} onChange={(v) => updateEq({ machineStepKg: v })} step={0.5} min={0.5} max={10} unit="kg" />
        </div>
        <div className="set-block">
          <Row label="Plates" detail={s.equipment.platesKg.join(' · ') + ' kg'} />
        </div>
      </Card>

      <div className="section-label">
        <span className="eyebrow">Body</span>
      </div>
      <Card className="set-group">
        <div className="set-block">
          <Stepper label="Bodyweight" value={s.bodyweightKg ?? 85} onChange={(v) => update({ bodyweightKg: v })} step={0.5} min={30} max={200} unit="kg" />
        </div>
      </Card>

      <div className="section-label">
        <span className="eyebrow">Backup & data</span>
      </div>
      <div className="stack">
        <CloudBackupCard />
        <Card className="set-group">
          <Row label="Stored on this phone" detail={persisted ? 'Protected from automatic clean-up.' : 'iOS may clear website data if storage runs low. Keep a backup.'} />
          <DataTransfer onToast={setToast} />
        </Card>
      </div>

      <div className="section-label">
        <span className="eyebrow">About</span>
      </div>
      <Card className="set-group">
        <Row label="Restrictions" detail="No strict or steep (> 60°) overhead pressing, handstands or HSPU. Jerks, thrusters, OHS and lateral raises are in." />
        <Row label="Keel" detail={`Session ${state.completedSessions + 1} next · block ${state.blockNumber}`} />
      </Card>

      <Sheet open={confirm} onClose={() => setConfirm(false)} title="When should it start?">
        <p className="muted" style={{ marginTop: 0, fontSize: 'var(--fs-sm)' }}>
          Your estimated maxes carry over either way, so there’s no recalibration.
        </p>
        <div className="choice-list">
          <button className="choice" onClick={() => apply('now')}>
            <div>
              <b>Now</b>
              <span>The new plan starts at day 1 of a fresh block.</span>
            </div>
          </button>
          <button className="choice" onClick={() => apply('next-block')}>
            <div>
              <b>At the next block</b>
              <span>Finish the current block first, then switch.</span>
            </div>
          </button>
        </div>
      </Sheet>
    </>
  );
}
