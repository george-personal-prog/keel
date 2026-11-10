import { useState } from 'react';
import { DEFAULT_SETTINGS, type Focus, type Frequency } from '../engine';
import { localToday, onboard } from '../data/store';
import { Button } from '../ui/components';
import { haptic } from '../ui/haptics';
import { IconChevronLeft, KeelMark } from '../ui/icons';
import './onboarding.css';

type Step = 'welcome' | 'focus' | 'frequency' | 'date' | 'ready';

const FOCI: { id: Focus; title: string; body: string }[] = [
  { id: 'off-season', title: 'Off-season', body: 'Hypertrophy-led. Tempo work, supersets, unilateral work, with a conditioning piece every session.' },
  { id: 'competition', title: 'Competition', body: 'Olympic lifting, strength, gymnastics and targeted conditioning. Periodised back from your comp date.' },
];

export function Onboarding() {
  const [step, setStep] = useState<Step>('welcome');
  const [focus, setFocus] = useState<Focus>('off-season');
  const [frequency, setFrequency] = useState<Frequency>(4);
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);

  const order: Step[] = focus === 'competition' ? ['welcome', 'focus', 'frequency', 'date', 'ready'] : ['welcome', 'focus', 'frequency', 'ready'];
  const idx = order.indexOf(step);
  const next = () => {
    haptic();
    setStep(order[idx + 1]);
  };
  const back = () => setStep(order[Math.max(0, idx - 1)]);

  const start = async () => {
    setBusy(true);
    haptic('success');
    await onboard({ focus, frequency, ...(focus === 'competition' && date ? { competitionDate: date } : {}) }, DEFAULT_SETTINGS);
  };

  return (
    <div className="onb">
      <header className="onb-head">
        {idx > 0 ? (
          <button className="icon-btn" aria-label="Back" onClick={back}>
            <IconChevronLeft />
          </button>
        ) : (
          <span />
        )}
        <div className="onb-dots" aria-hidden="true">
          {order.map((s, i) => (
            <span key={s} className={i <= idx ? 'is-on' : ''} />
          ))}
        </div>
        <span style={{ width: 48 }} />
      </header>

      <div className="onb-body" key={step}>
        {step === 'welcome' && (
          <>
            <div className="onb-mark">
              <KeelMark size={72} />
            </div>
            <h1 className="display onb-title">
              KEEL<span className="dot">.</span>
            </h1>
            <p className="onb-lede">Hybrid training that adapts to what you actually lift. Every number comes with its reason.</p>
            <ul className="onb-points">
              <li>Sessions under an hour, warm-up included</li>
              <li>Extra work for shoulders, upper chest and lats</li>
              <li>No strict or steep overhead pressing, ever</li>
            </ul>
          </>
        )}

        {step === 'focus' && (
          <>
            <p className="eyebrow">Step 1</p>
            <h2 className="display onb-q">What are you training for?</h2>
            <div className="onb-options">
              {FOCI.map((f) => (
                <button
                  key={f.id}
                  className={`onb-option ${focus === f.id ? 'is-on' : ''}`}
                  onClick={() => {
                    haptic();
                    setFocus(f.id);
                  }}
                >
                  <b>{f.title}</b>
                  <span>{f.body}</span>
                </button>
              ))}
            </div>
            <p className="faint onb-note">You can switch at any time. Your numbers carry over.</p>
          </>
        )}

        {step === 'frequency' && (
          <>
            <p className="eyebrow">Step 2</p>
            <h2 className="display onb-q">Sessions per week?</h2>
            <div className="onb-freq">
              {([3, 4, 5, 6] as const).map((f) => (
                <button
                  key={f}
                  className={`onb-freq-btn display ${frequency === f ? 'is-on' : ''}`}
                  onClick={() => {
                    haptic();
                    setFrequency(f);
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
            <p className="faint onb-note">
              Sessions run as a queue, not fixed days. Miss a day and the next session simply waits for you.
            </p>
          </>
        )}

        {step === 'date' && (
          <>
            <p className="eyebrow">Step 3</p>
            <h2 className="display onb-q">When is the competition?</h2>
            <input className="onb-date" type="date" value={date} min={localToday()} onChange={(e) => setDate(e.target.value)} aria-label="Competition date" />
            <p className="faint onb-note">Training is planned back from this date: accumulation, intensification, peak, taper. No date yet? Skip it and you’ll run rolling blocks.</p>
          </>
        )}

        {step === 'ready' && (
          <>
            <p className="eyebrow">First week</p>
            <h2 className="display onb-q">Calibration</h2>
            <p className="onb-lede">
              Your first {frequency} sessions find your working weights and set conditioning baselines. Nothing is a max test.
            </p>
            <ul className="onb-points">
              <li>Main lifts: build up to a set you could do 2 more reps with</li>
              <li>Accessories: find a weight for the rep range shown</li>
              <li>Conditioning: a short test, like a 2 km row</li>
            </ul>
          </>
        )}
      </div>

      <footer className="onb-foot">
        {step === 'ready' ? (
          <Button variant="primary" size="lg" block onClick={start} disabled={busy}>
            Start calibration
          </Button>
        ) : step === 'date' ? (
          <Button variant="primary" size="lg" block onClick={next}>
            {date ? 'Continue' : 'Skip: no date yet'}
          </Button>
        ) : (
          <Button variant="primary" size="lg" block onClick={next}>
            {step === 'welcome' ? 'Get started' : 'Continue'}
          </Button>
        )}
      </footer>
    </div>
  );
}
