// Top bar mirrored from capconvert-pm's WorkspaceTopBar so AI Jacque feels
// like part of the same ops surface. Each tab links absolutely to
// https://www.capconvert.com/ops/<path>. The current app (AI Jacque) is
// rendered as the active wordmark on the left.

const OPS_BASE = 'https://www.capconvert.com/ops';

interface TopBarTab {
  href: string;
  label: string;
  icon: React.ReactNode;
}

// Small inline SVGs matching the lucide-react glyphs used in the PM top bar
// (MessageSquare, KanbanSquare, DollarSign, Radio, LayoutDashboard, Shield,
// Sparkles, Target, Bot, Code2). Kept minimal so no extra dep is needed.
function Icon({ d, viewBox = '0 0 24 24' }: { d: string; viewBox?: string }) {
  return (
    <svg
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5 flex-shrink-0"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  comms: (
    <Icon d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  ),
  kanban: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M8 7v10M16 7v6" />
    </svg>
  ),
  mrr: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true">
      <line x1="12" y1="2" x2="12" y2="22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  bdt: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="2" />
      <path d="M4.93 19.07a10 10 0 0 1 0-14.14M19.07 4.93a10 10 0 0 1 0 14.14M7.76 16.24a6 6 0 0 1 0-8.49M16.24 7.76a6 6 0 0 1 0 8.49" />
    </svg>
  ),
  command: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true">
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  ),
  sentry: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  optimizers: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true">
      <path d="M12 3l1.9 5.6L20 10l-5.5 4 1.7 6L12 17l-4.2 3 1.7-6L4 10l6.1-1.4z" />
    </svg>
  ),
  googleAds: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  ),
  bots: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true">
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M12 4v4M8 14h.01M16 14h.01" />
    </svg>
  ),
  studio: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  ),
};

const TABS: TopBarTab[] = [
  { href: `${OPS_BASE}/comms`, label: 'Comms', icon: ICONS.comms },
  { href: `${OPS_BASE}/kanban`, label: 'Tasks', icon: ICONS.kanban },
  { href: `${OPS_BASE}/mrr`, label: 'MRR', icon: ICONS.mrr },
  { href: `${OPS_BASE}/bdt`, label: 'BDT', icon: ICONS.bdt },
  { href: `${OPS_BASE}/command-center`, label: 'Command', icon: ICONS.command },
  { href: `${OPS_BASE}/sentry`, label: 'Sentry', icon: ICONS.sentry },
  { href: `${OPS_BASE}/optimizers`, label: 'Optimizers', icon: ICONS.optimizers },
  { href: `${OPS_BASE}/google-ads`, label: 'Google Ads', icon: ICONS.googleAds },
  { href: `${OPS_BASE}/bots`, label: 'Bots', icon: ICONS.bots },
  { href: `${OPS_BASE}/structured-data`, label: 'Studio', icon: ICONS.studio },
];

export default function TopBar() {
  return (
    <div className="flex h-11 flex-shrink-0 items-stretch border-b border-custom-darkGrey bg-custom-black">
      {/* Wordmark linking back to the ops home. AI Jacque is the active app. */}
      <a
        href={`${OPS_BASE}/`}
        className="flex items-center gap-2 border-r border-custom-darkGrey px-3 transition-colors hover:bg-custom-card"
        title="Back to Capconvert ops"
      >
        <span className="inline-flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-md bg-custom-cyan text-[13px] font-bold text-custom-black">
          C
        </span>
        <span className="text-[13px] font-semibold text-custom-white">
          Capconvert
        </span>
      </a>

      {/* AI Jacque "active app" indicator + tabs */}
      <div className="flex flex-1 items-stretch overflow-x-auto pl-1">
        <span
          className="flex items-center gap-2 whitespace-nowrap px-3 text-[12px] font-semibold text-custom-cyan"
          style={{ backgroundColor: 'rgba(0,206,255,0.08)' }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5 flex-shrink-0"
            aria-hidden="true"
          >
            <path d="M12 8V4H8M4 4h4v4M4 8v8M4 16h4v4M8 20h8M16 20h4v-4M20 16V8M20 8h-4V4M16 4H8" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          AI Jacque
        </span>

        {TABS.map((tab) => (
          <a
            key={tab.href}
            href={tab.href}
            className="group relative flex items-center gap-2 whitespace-nowrap px-3 text-[12px] text-custom-muted transition-colors hover:bg-custom-card hover:text-custom-white"
          >
            {tab.icon}
            <span className="overflow-hidden">{tab.label}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
