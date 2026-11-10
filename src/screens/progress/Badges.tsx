import { useMemo, useState } from 'react';
import { badgeCatalog, type Achievement, type BadgeCategory } from '../../analytics/badges';
import { shortDate } from '../../app/format';
import { Card, Segmented } from '../../ui/components';
import { IconTrophy } from '../../ui/icons';

const CATEGORY_LABEL: Record<BadgeCategory, string> = {
  milestone: 'Milestones',
  consistency: 'Consistency',
  block: 'Blocks',
  'weak-point': 'Weak points',
  engine: 'Engine',
};

export function BadgeMedal({ tier, earned, size = 56 }: { tier: 1 | 2 | 3; earned: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" aria-hidden="true" className={`medal medal-t${tier} ${earned ? 'is-earned' : ''}`}>
      <path d="M28 3l21 12v26L28 53 7 41V15z" className="medal-hex" />
      <path d="M28 10l15 8.5v19L28 46l-15-8.5v-19z" className="medal-inner" />
      <path d="M17 26h22c-1.2 4.6-5 7-11 7s-9.8-2.4-11-7z" className="medal-hull" />
      <path d="M26 33h4.4l-1.1 7.4c-.1.5-.4.6-.8.6h-.6c-.4 0-.7-.1-.8-.6z" className="medal-fin" />
      {tier >= 2 && <circle cx="22" cy="18" r="1.6" className="medal-pip" />}
      {tier >= 3 && <circle cx="34" cy="18" r="1.6" className="medal-pip" />}
      <circle cx="28" cy="16.5" r="1.6" className="medal-pip" />
    </svg>
  );
}

export function BadgesView({ achievements }: { achievements: Achievement[] }) {
  const [view, setView] = useState<'badges' | 'records'>('badges');
  const earned = useMemo(() => new Map(achievements.filter((a) => a.kind === 'badge').map((a) => [a.id, a])), [achievements]);
  const catalog = badgeCatalog();
  const records = achievements.filter((a) => a.kind !== 'badge').reverse();
  const cats = [...new Set(catalog.map((b) => b.category))];

  return (
    <div className="stack" style={{ gap: 'var(--s4)' }}>
      <Card>
        <div className="pg-stats">
          <div className="stat">
            <div className="stat-value">
              <span className="display" style={{ color: 'var(--brass)' }}>
                {earned.size}
              </span>
              <small>/ {catalog.length}</small>
            </div>
            <div className="stat-label">badges earned</div>
          </div>
          <div className="stat">
            <div className="stat-value">
              <span className="display">{records.length}</span>
            </div>
            <div className="stat-label">records set</div>
          </div>
        </div>
      </Card>

      <Segmented
        label="Achievements view"
        value={view}
        onChange={setView}
        options={[
          { value: 'badges', label: 'Badges' },
          { value: 'records', label: 'Records' },
        ]}
      />

      {view === 'badges' &&
        cats.map((c) => (
          <section key={c}>
            <div className="section-label" style={{ margin: 'var(--s2) 0 var(--s3)' }}>
              <span className="eyebrow">{CATEGORY_LABEL[c]}</span>
            </div>
            <div className="pg-badges">
              {catalog
                .filter((b) => b.category === c)
                .map((b) => {
                  const e = earned.get(b.id);
                  return (
                    <div key={b.id} className={`pg-badge ${e ? 'is-earned' : ''}`}>
                      <BadgeMedal tier={b.tier} earned={!!e} />
                      <b>{b.title}</b>
                      <span>{e ? shortDate(e.date) : b.hint}</span>
                    </div>
                  );
                })}
            </div>
          </section>
        ))}

      {view === 'records' && (
        <Card>
          {records.length === 0 && <div className="chart-empty">e1RM, rep and benchmark records appear here as you set them.</div>}
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
    </div>
  );
}
