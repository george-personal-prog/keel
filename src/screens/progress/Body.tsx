import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useRef, useState } from 'react';
import { bodySeries } from '../../analytics';
import { shortDate } from '../../app/format';
import { db } from '../../data/db';
import { addPhoto, deletePhoto, localToday, saveBodyEntry, saveSettings, type AppData } from '../../data/store';
import { Button, Card, Sheet, Stepper } from '../../ui/components';
import { LineChart, Stat } from '../../ui/charts';
import { haptic } from '../../ui/haptics';
import { IconClose, IconPlus } from '../../ui/icons';

const GIRTHS: { id: string; label: string }[] = [
  { id: 'shoulders', label: 'Shoulders' },
  { id: 'chest', label: 'Chest' },
  { id: 'arm', label: 'Arm (flexed)' },
  { id: 'waist', label: 'Waist (navel)' },
  { id: 'thigh', label: 'Thigh' },
];

export function BodyView({ data }: { data: AppData }) {
  const [sheet, setSheet] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const photos = useLiveQuery(() => db.photos.orderBy('date').reverse().toArray(), []) ?? [];
  const bw = useMemo(() => bodySeries(data.body, 'bodyweight'), [data.body]);
  const viewerPhoto = photos.find((p) => p.id === viewer);
  const viewerUrl = useMemo(() => (viewerPhoto ? URL.createObjectURL(viewerPhoto.blob) : null), [viewerPhoto]);

  const latest = bw.at(-1);
  const first = bw[0];
  const ratio = (() => {
    const g = [...data.body].reverse().find((b) => b.girthsCm?.shoulders && b.girthsCm?.waist);
    return g ? g.girthsCm!.shoulders / g.girthsCm!.waist : undefined;
  })();

  return (
    <div className="stack" style={{ gap: 'var(--s4)' }}>
      <Button variant="primary" size="lg" block icon={<IconPlus size={20} />} onClick={() => setSheet(true)}>
        Log body data
      </Button>

      <Card>
        <div className="pg-stats">
          <Stat value={latest ? latest.value.toFixed(1) : '—'} unit={latest ? 'kg' : undefined} label="bodyweight" />
          <Stat
            value={latest && first && bw.length > 1 ? `${latest.value - first.value >= 0 ? '+' : ''}${(latest.value - first.value).toFixed(1)}` : '—'}
            unit={bw.length > 1 ? 'kg' : undefined}
            label={first ? `since ${shortDate(first.date)}` : 'change'}
          />
          <Stat value={ratio ? ratio.toFixed(2) : '—'} label="shoulder : waist" />
        </div>
        {bw.length > 1 && (
          <div style={{ marginTop: 'var(--s5)' }}>
            <LineChart label="Bodyweight" height={150} format={(v) => v.toFixed(1)} points={bw.map((p) => ({ date: p.date, y: p.value }))} />
          </div>
        )}
      </Card>

      <Card>
        <div className="pg-card-title">
          <span className="eyebrow">Girths · cm</span>
        </div>
        {GIRTHS.map((g) => {
          const s = bodySeries(data.body, g.id);
          const l = s.at(-1);
          const f = s[0];
          return (
            <div key={g.id} className="pg-lift pg-lift-compact">
              <span>{g.label}</span>
              <span className="num">{l ? l.value.toFixed(1) : '—'}</span>
              <span className={`pg-trend ${l && f && l.value > f.value ? (g.id === 'waist' ? 'is-down' : 'is-up') : l && f && l.value < f.value ? (g.id === 'waist' ? 'is-up' : 'is-down') : ''}`}>
                {l && f && s.length > 1 ? `${l.value - f.value >= 0 ? '+' : ''}${(l.value - f.value).toFixed(1)}` : ''}
              </span>
            </div>
          );
        })}
      </Card>

      <Card>
        <div className="pg-card-title">
          <span className="eyebrow">Progress photos · private, on this phone</span>
        </div>
        <div className="pg-photos">
          <button className="pg-photo-add" onClick={() => fileRef.current?.click()} aria-label="Add photo">
            <IconPlus />
          </button>
          {photos.map((p) => (
            <button key={p.id} className="pg-photo" onClick={() => setViewer(p.id)}>
              <img src={p.thumb} alt={`Progress photo ${shortDate(p.date)}`} />
              <span>{shortDate(p.date)}</span>
            </button>
          ))}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) {
              await addPhoto(f);
              haptic('success');
            }
            e.target.value = '';
          }}
        />
      </Card>

      <BodySheet open={sheet} onClose={() => setSheet(false)} data={data} />

      {viewerPhoto && viewerUrl && (
        <div className="pg-viewer" role="dialog" aria-label="Photo">
          <img src={viewerUrl} alt={`Progress photo ${shortDate(viewerPhoto.date)}`} />
          <div className="pg-viewer-bar">
            <span>{shortDate(viewerPhoto.date)}</span>
            <Button
              variant="danger"
              onClick={async () => {
                await deletePhoto(viewerPhoto.id);
                setViewer(null);
              }}
            >
              Delete
            </Button>
            <button className="icon-btn" aria-label="Close" onClick={() => setViewer(null)}>
              <IconClose />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function BodySheet({ open, onClose, data }: { open: boolean; onClose: () => void; data: AppData }) {
  const last = data.body.at(-1);
  const [weight, setWeight] = useState(last?.bodyweightKg ?? data.settings.bodyweightKg ?? 85);
  const [g, setG] = useState<Record<string, string>>({});

  const save = async () => {
    const girthsCm: Record<string, number> = {};
    for (const [k, v] of Object.entries(g)) if (v.trim() && Number.isFinite(Number(v))) girthsCm[k] = Number(v);
    await saveBodyEntry({ date: localToday(), bodyweightKg: weight, girthsCm });
    await saveSettings({ ...data.settings, bodyweightKg: weight });
    haptic('success');
    setG({});
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Body data · today"
      footer={
        <Button variant="primary" size="lg" onClick={save}>
          Save
        </Button>
      }
    >
      <div className="stack" style={{ gap: 'var(--s5)' }}>
        <Stepper label="Bodyweight" value={weight} onChange={setWeight} step={0.1} min={30} max={200} unit="kg" format={(v) => v.toFixed(1)} />
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Girths (optional, cm)
          </div>
          <div className="lg-two">
            {GIRTHS.map((x) => (
              <label key={x.id} className="lg-field">
                <span>{x.label}</span>
                <input inputMode="decimal" placeholder={String(last?.girthsCm?.[x.id] ?? '')} value={g[x.id] ?? ''} onChange={(e) => setG({ ...g, [x.id]: e.target.value.replace(',', '.') })} />
              </label>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
