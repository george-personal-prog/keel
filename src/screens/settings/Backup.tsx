import { useRef, useState } from 'react';
import { downloadBlob, exportAll, exportCsv, localToday, restoreBackup } from '../../data/store';
import { parseBackup, type Backup } from '../../data/transfer';
import { turnOff, turnOn, syncNow, useSyncStatus } from '../../sync/client';
import { Button, Capsule, Card, Row, Sheet } from '../../ui/components';
import { haptic } from '../../ui/haptics';
import { IconDownload } from '../../ui/icons';

function ago(ms?: number): string {
  if (!ms) return 'never';
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function CloudBackupCard() {
  const s = useSyncStatus();
  const [busy, setBusy] = useState(false);

  if (s.phase === 'unconfigured') {
    return (
      <Card className="set-group">
        <Row label="Cloud backup" detail="Not set up yet. Your data lives on this phone only: export a backup now and then." />
      </Card>
    );
  }

  const tone = s.phase === 'ok' ? 'ok' : s.phase === 'error' ? 'danger' : s.phase === 'syncing' ? 'sea' : 'default';
  const label: Record<string, string> = { off: 'Off', 'signed-out': 'Signed out', syncing: 'Syncing…', ok: 'Backed up', error: 'Problem', offline: 'Offline' };

  return (
    <Card className="set-group cloud-card">
      <div className="set-block">
        <div className="cloud-head">
          <b>Cloud backup</b>
          <Capsule tone={tone}>{label[s.phase]}</Capsule>
        </div>
        {s.phase === 'off' || s.phase === 'signed-out' ? (
          <>
            <p className="muted cloud-copy">
              Keeps a copy of your training in your own Google account, and restores it on a new phone. Progress photos stay on this phone.
            </p>
            <Button
              variant="primary"
              block
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                haptic();
                await turnOn();
                setBusy(false);
              }}
            >
              Sign in with Google
            </Button>
          </>
        ) : (
          <>
            <p className="muted cloud-copy">
              {s.email ? <>Signed in as {s.email}. </> : null}
              Last backup {ago(s.lastSyncAt)}.{s.message ? ` ${s.message}` : ''}
            </p>
            <div className="set-inline">
              <Button
                disabled={s.phase === 'syncing'}
                onClick={() => {
                  haptic();
                  void syncNow();
                }}
              >
                Back up now
              </Button>
              <Button variant="ghost" onClick={() => void turnOff()}>
                Turn off
              </Button>
            </div>
          </>
        )}
        {s.phase === 'off' && s.message && <p className="cloud-error">{s.message}</p>}
        {s.phase === 'error' && s.message && <p className="cloud-error">{s.message}</p>}
      </div>
    </Card>
  );
}

export function DataTransfer({ onToast }: { onToast: (m: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ backup: Backup; summary: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <div className="set-block">
        <Button icon={<IconDownload size={20} />} block onClick={async () => downloadBlob(await exportAll(), `keel-backup-${localToday()}.json`)}>
          Export backup (JSON)
        </Button>
        <div className="set-inline">
          <Button onClick={async () => downloadBlob(await exportCsv('sets'), `keel-sets-${localToday()}.csv`)}>Sets CSV</Button>
          <Button onClick={async () => downloadBlob(await exportCsv('conditioning'), `keel-conditioning-${localToday()}.csv`)}>WODs CSV</Button>
        </div>
        <Button variant="ghost" block onClick={() => fileRef.current?.click()}>
          Restore from a backup file…
        </Button>
        {error && <p className="cloud-error">{error}</p>}
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            const r = parseBackup(await f.text());
            if (r.ok) {
              setError(null);
              setPending({ backup: r.backup, summary: r.summary });
            } else setError(r.error);
          }}
        />
      </div>

      <Sheet open={!!pending} onClose={() => setPending(null)} title="Restore this backup?">
        {pending && (
          <div className="stack">
            <p className="muted" style={{ margin: 0, fontSize: 'var(--fs-sm)' }}>
              {pending.summary}
            </p>
            <p style={{ margin: 0, fontSize: 'var(--fs-sm)' }}>
              This <b>replaces everything on this phone</b> (sessions, skipped days, body data, settings and your place in the plan) with the backup. Progress photos are kept. A session in progress is discarded.
            </p>
            <Button
              variant="danger"
              size="lg"
              block
              onClick={async () => {
                await restoreBackup(pending.backup);
                haptic('success');
                setPending(null);
                onToast('Backup restored');
              }}
            >
              Replace with this backup
            </Button>
            <Button variant="ghost" block onClick={() => setPending(null)}>
              Cancel
            </Button>
          </div>
        )}
      </Sheet>
    </>
  );
}
