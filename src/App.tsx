import { useEffect, useState } from 'react';
import { requestPersistence } from './data/db';
import { useAppData } from './data/store';
import { History } from './screens/History';
import { Logger } from './screens/Logger';
import { Onboarding } from './screens/Onboarding';
import { Progress } from './screens/Progress';
import { SettingsScreen } from './screens/Settings';
import { Summary } from './screens/Summary';
import { Today } from './screens/Today';
import { IconHistory, IconProgress, IconSettings, IconToday, KeelMark } from './ui/icons';
import { haptic } from './ui/haptics';
import './app.css';

export type Tab = 'today' | 'history' | 'progress' | 'settings';

const TABS: { id: Tab; label: string; Icon: typeof IconToday }[] = [
  { id: 'today', label: 'Today', Icon: IconToday },
  { id: 'history', label: 'History', Icon: IconHistory },
  { id: 'progress', label: 'Progress', Icon: IconProgress },
  { id: 'settings', label: 'Settings', Icon: IconSettings },
];

export default function App() {
  const data = useAppData();
  const [tab, setTab] = useState<Tab>('today');
  const [loggerOpen, setLoggerOpen] = useState(false);
  const [summaryId, setSummaryId] = useState<string | null>(null);

  useEffect(() => {
    void requestPersistence();
  }, []);

  if (!data) {
    return (
      <div className="splash">
        <KeelMark size={44} />
      </div>
    );
  }

  if (!data.profile || !data.state) return <Onboarding />;

  if (summaryId) {
    const session = data.history.sessions.find((s) => s.id === summaryId);
    if (session) return <Summary session={session} history={data.history} onDone={() => setSummaryId(null)} />;
  }

  if (loggerOpen && data.draft) {
    return (
      <Logger
        data={data}
        draft={data.draft}
        onClose={() => setLoggerOpen(false)}
        onFinished={(id) => {
          setLoggerOpen(false);
          setSummaryId(id);
          setTab('today');
        }}
      />
    );
  }

  return (
    <div className="shell">
      <main className="shell-main" key={tab}>
        {tab === 'today' && <Today data={data} onOpenLogger={() => setLoggerOpen(true)} />}
        {tab === 'history' && <History data={data} />}
        {tab === 'progress' && <Progress data={data} />}
        {tab === 'settings' && <SettingsScreen data={data} />}
      </main>
      <nav className="tabbar" aria-label="Main">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`tab ${tab === id ? 'is-on' : ''}`}
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => {
              if (tab !== id) haptic();
              setTab(id);
              window.scrollTo({ top: 0 });
            }}
          >
            <Icon size={24} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
