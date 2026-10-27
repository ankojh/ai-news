'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Compass,
  ExternalLink,
  Flag,
  Headphones,
  Layers,
  LoaderCircle,
  Menu,
  Moon,
  Play,
  Plus,
  Radio,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  ThumbsDown,
  ThumbsUp,
  X,
  Zap,
} from 'lucide-react';
// JSON response fields vary across feed, run, and evaluation views.
type Row = Record<string, any>;
type Feedback = (type: string, id: string, value: string) => Promise<boolean>;
type Audience = 'student' | 'educator' | 'professional';
const audiences: Audience[] = ['student', 'educator', 'professional'];
const dateLabel = (date: string, short = false) =>
  date
    ? new Date(date).toLocaleDateString('en-US', {
        month: short ? 'short' : 'long',
        day: 'numeric',
        year: short ? undefined : 'numeric',
        timeZone: 'UTC',
      })
    : 'Date unavailable';
const money = (value: unknown) =>
  value == null ? 'Subscription usage / not priced' : `$${Number(value).toFixed(4)}`;
const percent = (value: unknown) =>
  value == null ? 'Not measured' : `${Math.round(Number(value) * 100)}%`;
const friendly: Record<string, string> = {
  get_paper_metadata: 'Read primary-source metadata',
  get_full_text: 'Inspected paper sections',
  get_hn_discussion: 'Read community discussion',
  verify_quote: 'Checked a quote against its source',
  submit_card: 'Submitted the evidence card',
  post_verify_drop: 'Dropped unsupported material',
  submit_explanation: 'Prepared an audience explanation',
  model_call: 'Planned the next research step',
  budget_warning: 'Budget nearly exhausted',
  reuse_card: 'Reused an existing card',
};

async function request(path: string, options: RequestInit = {}, token = '') {
  const headers = new Headers(options.headers);
  if (options.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const result = await fetch(path, { ...options, headers });
  const data = await result.json();
  if (!result.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export default function Newsren() {
  const pathname = usePathname(),
    [section, id] = pathname.split('/').filter(Boolean);
  const [audience, setAudience] = useState<Audience>('professional');
  const [dark, setDark] = useState(false),
    [mobile, setMobile] = useState(false);
  const [data, setData] = useState<Row>({}),
    [status, setStatus] = useState<Row>({}),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [sort, setSort] = useState('picks'),
    [date, setDate] = useState(''),
    [boldOnly, setBoldOnly] = useState(false),
    [token, setToken] = useState('');
  const loadVersion = useRef(0);
  useEffect(() => {
    const saved = localStorage.getItem('newsren-audience');
    if (audiences.includes(saved as Audience)) setAudience(saved as Audience);
    const theme = localStorage.getItem('newsren-theme') === 'dark';
    setDark(theme);
    document.documentElement.classList.toggle('dark', theme);
  }, []);
  const chooseAudience = (next: Audience) => {
    setAudience(next);
    localStorage.setItem('newsren-audience', next);
  };
  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('newsren-theme', next ? 'dark' : 'light');
  };
  const load = useCallback(
    async (quiet = false) => {
      const version = ++loadVersion.current;
      if (!quiet) setLoading(true);
      setError('');
      try {
        const statusPromise = request('/api/status');
        const query = new URLSearchParams({
          sort,
          boldOnly: String(boldOnly),
          ...(date ? { date } : {}),
        });
        const url =
          section === 'technology'
            ? `/api/feed?${query}`
            : section === 'paper'
              ? `/api/papers/${id}`
              : section === 'runs'
                ? `/api/runs${id ? `/${id}` : ''}`
                : section === 'briefing'
                  ? `/api/briefings/${id || 'latest'}`
                  : ['review', 'settings', 'metrics'].includes(section)
                    ? `/api/${section}`
                    : null;
        const [nextStatus, result] = await Promise.all([
          statusPromise,
          url ? request(url, {}, token) : Promise.resolve(null),
        ]);
        if (version !== loadVersion.current) return;
        setStatus(nextStatus);
        setData({ value: result, path: pathname });
      } catch (e) {
        if (version !== loadVersion.current) return;
        setData({ value: null, path: pathname });
        setError(e instanceof Error ? e.message : 'Unable to load');
      } finally {
        if (version === loadVersion.current) setLoading(false);
      }
    },
    [pathname, section, id, sort, date, boldOnly, token],
  );
  useEffect(() => {
    load();
    setMobile(false);
  }, [load]);
  useEffect(() => {
    if (section !== 'runs') return;
    const timer = setInterval(() => load(true), 3000);
    return () => clearInterval(timer);
  }, [section, load]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(t);
  }, [notice]);
  const action = async (path: string, body: unknown, method = 'POST') => {
    try {
      const result = await request(path, { method, body: JSON.stringify(body) }, token);
      setNotice('Saved. Thank you.');
      await load(true);
      return result;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Action failed');
      throw e;
    }
  };
  const feedback = (type: string, targetId: string, value: string) =>
    action('/api/feedback', { targetType: type, targetId, value })
      .then(() => true)
      .catch(() => false);
  const cards = section === 'technology' && Array.isArray(data.value) ? data.value : [];
  const pageTitles: Record<string, string> = {
    review: 'The editor’s desk',
    runs: 'Inside the newsroom',
    metrics: 'Trust, measured.',
    settings: 'Make it your briefing.',
    about: 'A little less noise. A lot more evidence.',
  };
  const latest = status.latestBriefing;
  const pending = loading || data.path !== pathname;
  return (
    <>
      <div className="topline">
        <span>INDEPENDENT THINKING. PRIMARY SOURCES.</span>
        <span>
          <i className="live-dot" /> YOUR AI RESEARCH READING DESK
        </span>
      </div>
      <header className="masthead">
        <Link href="/technology" className="wordmark">
          <span className="brand-icon">
            <Compass size={26} strokeWidth={1.4} />
          </span>
          The Newsren<span className="wordmark-dot">.</span>
        </Link>
        <div className="edition">
          <span>THE RESEARCH EDITION</span>
          <span>Attention is a signal. Evidence is the story.</span>
        </div>
        <div className="header-actions">
          <button
            className="icon-button"
            aria-label={dark ? 'Use light theme' : 'Use dark theme'}
            onClick={toggleTheme}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <Link href="/runs" className="button small">
            <Radio size={15} /> Newsroom
          </Link>
          <button
            className="icon-button mobile-menu"
            aria-label="Toggle navigation"
            onClick={() => setMobile(!mobile)}
          >
            <Menu size={20} />
          </button>
        </div>
      </header>
      <nav className="category-nav" aria-label="News categories">
        <div>
          {['technology', 'education', 'industry', 'finance'].map((name) => (
            <Link
              key={name}
              href={`/${name}`}
              className={
                section === name || (section === 'paper' && name === 'technology') ? 'active' : ''
              }
            >
              {name}
              {name === 'technology' && <span className="nav-dot" />}
            </Link>
          ))}
        </div>
        <span className="nav-note">
          <ShieldCheck size={14} /> Built around the evidence
        </span>
      </nav>
      <div className="workspace">
        <aside className={`sidebar ${mobile ? 'mobile-open' : ''}`}>
          <p className="eyebrow">YOUR READING DESK</p>
          <Link
            className={section === 'technology' ? 'side-link selected' : 'side-link'}
            href="/technology"
          >
            <BookOpen size={17} /> The daily read <ArrowRight size={14} />
          </Link>
          <Link
            className={section === 'briefing' ? 'side-link selected' : 'side-link'}
            href="/briefing/latest"
          >
            <Headphones size={17} /> Today’s briefing
          </Link>
          <p className="eyebrow sidebar-heading">IN THE NEWSROOM</p>
          {[
            ['review', 'Review queue', ShieldCheck],
            ['runs', 'Agent runs', Radio],
            ['metrics', 'Trust & metrics', Layers],
            ['settings', 'Preferences', Settings2],
          ].map(([route, label, Icon]) => {
            const I = Icon as typeof Radio;
            return (
              <Link
                key={String(route)}
                className={section === route ? 'side-link selected' : 'side-link'}
                href={`/${route}`}
              >
                <I size={17} />
                {String(label)}
              </Link>
            );
          })}
          <div className="sidebar-note">
            <span className="tiny-star">✳</span>
            <p>
              A trending paper isn’t
              <br />
              the same as a proven idea.
            </p>
            <Link href="/about">
              How we check the story <ArrowUpRight size={13} />
            </Link>
          </div>
          <div className="sidebar-bottom">
            <span className="live-dot" />
            {status.configured ? 'Agents configured' : 'Local reading desk'}
            <Link href="/about">
              About The Newsren <ArrowUpRight size={12} />
            </Link>
          </div>
        </aside>
        <main id="main-content" className="main-content">
          {section === 'finance' && (
            <div className="notice finance-notice">
              Informational and educational content only. Not investment advice. The Newsren does
              not provide buy/sell/hold recommendations, price targets, or trade execution.
            </div>
          )}
          {status.demo && (
            <div className="demo-banner">
              <span>FIXTURE PREVIEW</span> Real source excerpts, sample cards. No live agent
              research or independent evaluation has been performed.
            </div>
          )}
          {section === 'technology' ? (
            <>
              <div className="page-kicker">
                <span className="eyebrow">THE DAILY READ</span>
                <span className="muted">AI RESEARCH / TECHNOLOGY</span>
              </div>
              <div className="hero">
                <h1>
                  Beyond the buzz.
                  <br />
                  <em>Into the evidence.</em>
                </h1>
                <p>
                  Understand the next AI breakthrough: compare what’s trending
                  <br className="desktop-break" /> with what the paper actually shows.
                </p>
                <span className="hero-mark" aria-hidden="true">
                  ✳
                </span>
              </div>
              <div className="reading-controls">
                <div className="audience-label">
                  <SlidersHorizontal size={16} />
                  <span>Explain for</span>
                </div>
                <AudienceToggle audience={audience} onChange={chooseAudience} />
                <span className="instant-note">Same evidence. Your perspective.</span>
              </div>
              <div className="feed-grid">
                <div className="feed-column">
                  <div className="feed-toolbar">
                    <h2>
                      On our radar <span>{cards.length.toString().padStart(2, '0')}</span>
                    </h2>
                    <div className="filters">
                      <select
                        aria-label="Run date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                      >
                        <option value="">Latest edition</option>
                        {status.dates?.map((d: Row) => (
                          <option key={d.date} value={d.date}>
                            {dateLabel(d.date, true)}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="Sort papers"
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        <option value="picks">Editor’s picks</option>
                        <option value="discussed">Most discussed</option>
                        <option value="newest">Newest</option>
                      </select>
                    </div>
                  </div>
                  <label className="bold-filter">
                    <input
                      type="checkbox"
                      checked={boldOnly}
                      onChange={(e) => setBoldOnly(e.target.checked)}
                    />{' '}
                    Bold claims only <Zap size={12} />
                  </label>
                  {pending ? (
                    <Loading />
                  ) : error ? (
                    <ErrorPanel error={error} />
                  ) : cards.length ? (
                    cards.map((card: Row, index: number) => (
                      <PaperCard
                        key={card.id}
                        card={card}
                        index={index}
                        audience={audience}
                        feedback={feedback}
                      />
                    ))
                  ) : (
                    <Empty
                      title={
                        boldOnly
                          ? 'No bold claims in this edition.'
                          : 'Your next deep dive starts here.'
                      }
                      text={
                        status.reviewMode === 'required'
                          ? 'New cards appear here after approval in the review queue.'
                          : 'Run the research agents to turn today’s attention signals into evidence cards. Sign in with codex login first, or load the offline preview with npm run demo.'
                      }
                    >
                      <Link className="button primary" href="/runs">
                        Open the newsroom <ArrowRight size={15} />
                      </Link>
                    </Empty>
                  )}
                </div>
                <aside className="reading-aside">
                  <BriefingTeaser briefing={latest} />
                  <div className="evidence-note">
                    <ShieldCheck size={25} />
                    <h3>“Verified” has a meaning.</h3>
                    <p>
                      We check that every claim’s quote appears in the paper. That’s
                      faithfulness—not independent confirmation.
                    </p>
                    <Link href="/about">
                      See how it works <ArrowUpRight size={14} />
                    </Link>
                    <div className="note-rule" />
                    <span>
                      THE AUTHORS REPORT.
                      <br />
                      YOU STAY CURIOUS.
                    </span>
                  </div>
                  <div className="roadmap-teaser">
                    <span className="eyebrow">COMING INTO FOCUS</span>
                    <h3>
                      Follow an idea,
                      <br />
                      not just a headline.
                    </h3>
                    <p>Connected stories and topic monitoring are on our roadmap.</p>
                    <span className="pill">On the horizon</span>
                  </div>
                </aside>
              </div>
            </>
          ) : ['education', 'industry', 'finance'].includes(section) ? (
            <>
              <div className="page-kicker">
                <span className="eyebrow">THE NEXT CHAPTER</span>
                <span className="pill">Roadmap</span>
              </div>
              <h1 className="page-title capitalize">
                {section},<br />
                <em>with a closer look.</em>
              </h1>
              <Empty
                title="Good research takes focus."
                text="This vertical is part of The Newsren plan but outside this MVP’s scope. The same pipeline—approved sources, research, verified cards, and explanations—applies."
              >
                <div className="planned-features">
                  {(section === 'education'
                    ? ['Education Evidence Checker', 'Policy Impact Explorer']
                    : section === 'industry'
                      ? ['Company and Competitor Watch', 'Supply-Chain Ripple Map']
                      : ['Financial Literacy Explainers', 'Evidence & Risk Context']
                  ).map((x) => (
                    <span className="pill" key={x}>
                      {x}
                    </span>
                  ))}
                </div>
                <Link href="/technology" className="text-link">
                  Read the Technology edition <ArrowRight size={16} />
                </Link>
              </Empty>
            </>
          ) : (
            <>
              <div className="page-kicker">
                <span className="eyebrow">
                  THE NEWSREN / {section === 'paper' ? 'PAPER DECODER' : section?.toUpperCase()}
                </span>
                <Link className="text-link" href="/technology">
                  Back to the daily read <ArrowUpRight size={14} />
                </Link>
              </div>
              {pageTitles[section] && <h1 className="page-title">{pageTitles[section]}</h1>}
              {section === 'about' ? (
                <About />
              ) : pending ? (
                <Loading />
              ) : error ? (
                <ErrorPanel error={error} />
              ) : section === 'paper' && data.value ? (
                <>
                  <div className="reading-controls">
                    <span>Explain for</span>
                    <AudienceToggle audience={audience} onChange={chooseAudience} />
                  </div>
                  <PaperCard
                    card={data.value}
                    index={0}
                    audience={audience}
                    feedback={feedback}
                    full
                  />
                </>
              ) : section === 'briefing' ? (
                <Briefing briefing={data.value} feedback={feedback} />
              ) : section === 'runs' ? (
                id ? (
                  <RunDetail run={data.value} />
                ) : (
                  <Runs runs={data.value || []} status={status} action={action} />
                )
              ) : section === 'review' ? (
                <Review
                  cards={data.value || []}
                  audience={audience}
                  feedback={feedback}
                  action={action}
                />
              ) : section === 'metrics' ? (
                <Metrics data={data.value} action={action} />
              ) : section === 'settings' ? (
                <Preferences data={data.value} token={token} setToken={setToken} action={action} />
              ) : (
                <Empty
                  title="This page isn’t on the reading desk."
                  text="Return to Technology for today’s edition."
                />
              )}
            </>
          )}
          <footer>
            <span className="footer-wordmark">The Newsren.</span>
            <p>
              Summaries are AI-generated. Claims are checked word for word against each paper’s own
              text; they are not independently confirmed. Always read the source.
            </p>
            <div>
              <Link href="/about">About</Link>
              <Link href="/runs">Runs</Link>
              <Link href="/metrics">Metrics</Link>
              <Link href="/settings">Settings</Link>
            </div>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button className="icon-button" onClick={() => setNotice('')} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}

function AudienceToggle({
  audience,
  onChange,
}: {
  audience: Audience;
  onChange: (a: Audience) => void;
}) {
  return (
    <div className="segmented" aria-label="Explanation audience">
      {audiences.map((a) => (
        <button
          key={a}
          aria-pressed={audience === a}
          className={a === audience ? 'active' : ''}
          onClick={() => onChange(a)}
        >
          {a}
        </button>
      ))}
    </div>
  );
}
function Loading() {
  return (
    <div className="loading">
      <LoaderCircle size={20} className="spin" /> Opening the reading desk…
    </div>
  );
}
function ErrorPanel({ error }: { error: string }) {
  return (
    <div className="notice" role="alert">
      <strong>We couldn’t complete that.</strong>
      <p>{error}</p>
      <Link href="/settings">
        Open preferences <ArrowUpRight size={14} />
      </Link>
    </div>
  );
}
function Empty({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Compass size={35} strokeWidth={1} />
      <h2>{title}</h2>
      <p>{text}</p>
      {children}
    </div>
  );
}
function Labels({ card }: { card: Row }) {
  return (
    <div className="labels">
      <span className="pill">
        {card.paper.pub_status === 'published'
          ? `Published: ${card.paper.journal_ref}`
          : card.paper.pub_status === 'accepted_author_stated'
            ? 'Accepted (per authors)'
            : 'Preprint · not peer-reviewed'}
      </span>
      {card.claims.some((c: Row) => c.is_bold === 1) && (
        <span className="pill amber">
          <Zap size={11} /> Bold claim
        </span>
      )}
      {card.paper.html_available === 0 && <span className="pill">Abstract only</span>}
      {card.low_evidence === 1 && <span className="pill amber">No verified claims</span>}
      {card.status === 'draft' && (
        <span className="pill subtle">AI-generated, not editor-reviewed</span>
      )}
    </div>
  );
}
function PaperCard({
  card,
  index,
  audience,
  feedback,
  full = false,
  onOpen,
}: {
  card: Row;
  index: number;
  audience: Audience;
  feedback: Feedback;
  full?: boolean;
  onOpen?: () => void;
}) {
  const [expanded, setExpanded] = useState(full),
    [voted, setVoted] = useState('');
  const p = card.paper,
    e = card.explanations.find((e: Row) => e.audience === audience),
    claim = card.claims[0];
  const PaperHeading = full ? 'h1' : 'h2';
  const signals: Row[] = card.signals.filter(
    (s: Row, i: number, a: Row[]) => a.findIndex((x) => x.source === s.source) === i,
  );
  return (
    <article className={`paper-card ${full ? 'full-card' : ''}`}>
      <div className="card-top">
        <span className="paper-number">
          {String(index + 1).padStart(2, '0')} <span>/ RESEARCH NOTE</span>
        </span>
        <span>{dateLabel(p.published_at, true)}</span>
      </div>
      <Labels card={card} />
      <PaperHeading className="paper-title">
        <Link href={`/paper/${card.arxiv_id}`}>
          {p.title}
          <ArrowUpRight size={20} />
        </Link>
      </PaperHeading>
      <div className="authors">
        {p.authors.slice(0, 3).join(', ')}
        {p.authors.length > 3 ? ' et al.' : ''}
        <span>
          {' '}
          · arXiv {card.arxiv_id}
          {card.paper_version}
        </span>
      </div>
      <div className="signals">
        {signals.map((s: Row) => (
          <a key={s.source} href={s.url} target="_blank" rel="noreferrer">
            {s.source === 'hf' ? (
              <>
                <span>▲</span> {s.score} on Hugging Face
              </>
            ) : (
              <>
                <span className="hn-mark">Y</span> {s.score} points / {s.num_comments} comments
              </>
            )}
            <ArrowUpRight size={11} />
          </a>
        ))}
      </div>
      <div className="why-picked">
        <span>WHY THIS PAPER</span>
        <p>{card.selection_reason}</p>
      </div>
      <p className="card-tldr">
        {e?.body
          ? e.body
              .split(/(?<=[.!?])\s+/)
              .slice(0, 2)
              .join(' ')
          : card.tldr}
      </p>
      {claim && (
        <div className="top-claim">
          <span className="checkmark">
            <Check size={14} />
          </span>
          <div>
            <span className="eyebrow">QUOTE VERIFIED</span>
            <p>{claim.text}</p>
            <small>Author-reported · Not yet independently confirmed</small>
          </div>
        </div>
      )}
      <div className="card-bottom">
        <button
          className="expand-button"
          aria-expanded={expanded}
          onClick={() => {
            if (!expanded) onOpen?.();
            setExpanded(!expanded);
          }}
        >
          {expanded ? 'Close the research note' : 'Read the evidence'}
          <ChevronDown className={expanded ? 'rotated' : ''} size={16} />
        </button>
        <div className="feedback">
          <span>Useful?</span>
          {['up', 'down'].map((v) => (
            <button
              key={v}
              className={voted === v ? 'selected' : ''}
              disabled={!!voted}
              aria-label={`Vote ${v}`}
              onClick={async () => {
                if (await feedback('card', card.id, v)) setVoted(v);
              }}
            >
              {v === 'up' ? <ThumbsUp size={14} /> : <ThumbsDown size={14} />}
            </button>
          ))}
        </div>
      </div>
      {expanded && (
        <div className="expanded-card">
          <section>
            <div className="section-label">
              <BookOpen size={16} />
              <h3>Learn this topic</h3>
              <span className="pill capitalize">For {audience}</span>
            </div>
            {e ? (
              <>
                <p>{e.body}</p>
                {e.glossary?.length > 0 && (
                  <dl className="glossary">
                    {e.glossary.map((g: Row) => (
                      <div key={g.term}>
                        <dt>{g.term}</dt>
                        <dd>{g.definition}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {e.discussion_questions?.length > 0 && (
                  <>
                    <h4>Questions for discussion</h4>
                    <ol>
                      {e.discussion_questions.map((q: string) => (
                        <li key={q}>{q}</li>
                      ))}
                    </ol>
                  </>
                )}
                {e.activity && (
                  <div className="activity">
                    <strong>Try this in class</strong>
                    <p>{e.activity}</p>
                  </div>
                )}
              </>
            ) : (
              <p className="muted">
                This audience explanation is not available yet. The verified evidence below is
                available to all readers.
              </p>
            )}
          </section>
          <section>
            <div className="section-label">
              <ShieldCheck size={16} />
              <h3>Inspect evidence</h3>
            </div>
            <p className="small muted">
              Decoder text is an AI interpretation. Quotes are matched to source text; their truth
              and the interpretation’s accuracy are not independently confirmed.
            </p>
            <div className="decoder-grid">
              {[
                ['whats_new', 'What’s technically new'],
                ['hypothesis', 'Hypothesis'],
                ['method', 'Method'],
                ['findings', 'Findings'],
                ['limitations', 'Limitations'],
                ['possible_applications', 'Possible applications'],
                ['watch_next', 'What to watch next'],
              ].map(
                ([key, label]) =>
                  card[key] && (
                    <div key={key}>
                      <h4>
                        {label}
                        {['possible_applications', 'watch_next'].includes(key) && (
                          <span className="speculation">Possibility, not a finding</span>
                        )}
                      </h4>
                      <p>{card[key]}</p>
                    </div>
                  ),
              )}
            </div>
            <h4 className="spaced-title">The claims, with receipts</h4>
            {!card.claims.length && <p>No proposed claims passed quote verification.</p>}
            {card.claims.map((c: Row) => (
              <Claim
                key={c.id}
                claim={c}
                arxivId={card.arxiv_id}
                version={card.paper_version}
                feedback={feedback}
              />
            ))}
            {card.discussion.length > 0 && (
              <>
                <h4 className="spaced-title">
                  Community discussion <span className="pill">Not verified fact</span>
                </h4>
                {card.discussion.map((d: Row, i: number) => (
                  <div key={i} className="discussion">
                    <span className="pill capitalize">{d.stance}</span>
                    <p>{d.summary}</p>
                    <blockquote>{d.quote}</blockquote>
                    <a
                      href={`https://news.ycombinator.com/item?id=${d.comment_id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Read comment <ExternalLink size={12} />
                    </a>
                  </div>
                ))}
              </>
            )}
            <div className="unverified">
              <h4>What we couldn’t verify</h4>
              <ul>
                {card.could_not_verify.map((s: string, i: number) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          </section>
          <Trace steps={card.trace} reason={card.selection_reason} />
          <section>
            <h3>Sources & timestamps</h3>
            <div className="source-links">
              <a
                href={`https://arxiv.org/abs/${card.arxiv_id}${card.paper_version}`}
                target="_blank"
                rel="noreferrer"
              >
                arXiv paper <ArrowUpRight size={13} />
              </a>
              {p.html_available === 1 && (
                <a
                  href={`https://arxiv.org/html/${card.arxiv_id}${card.paper_version}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Full-text source <ArrowUpRight size={13} />
                </a>
              )}
              {signals.map((s: Row) => (
                <a key={s.source} href={s.url} target="_blank" rel="noreferrer">
                  {s.source === 'hf' ? 'Hugging Face' : 'Hacker News'}
                  <ArrowUpRight size={13} />
                </a>
              ))}
            </div>
            <dl className="timestamps">
              {[
                ['Published', p.published_at],
                ['Updated', p.updated_at],
                ['First seen', p.first_seen_at],
                ['Fetched', p.last_fetched_at],
                ['Card created', card.created_at],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value ? new Date(value).toLocaleString() : 'Unavailable'}</dd>
                </div>
              ))}
            </dl>
            {full && (
              <details>
                <summary>Signal history</summary>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Source</th>
                        <th>Score</th>
                        <th>Comments</th>
                        <th>Observed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {card.signals.map((s: Row) => (
                        <tr key={s.id}>
                          <td>{s.source}</td>
                          <td>{s.score}</td>
                          <td>{s.num_comments}</td>
                          <td>{dateLabel(s.observed_at, true)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </section>
          <div className="roadmap-row">
            {['Connected stories', 'Follow developments'].map((x) => (
              <div key={x}>
                <Layers size={16} />
                <strong>{x}</strong>
                <span className="pill">Roadmap</span>
                <p>
                  {x === 'Connected stories'
                    ? 'See how this research connects to earlier work.'
                    : 'Follow an idea as new evidence arrives.'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
function Claim({
  claim: c,
  arxivId,
  version,
  feedback,
}: {
  claim: Row;
  arxivId: string;
  version: string;
  feedback: Feedback;
}) {
  const [flagged, setFlagged] = useState(false);
  return (
    <div className="claim">
      <div className="claim-heading">
        <span className="verified-icon">
          <ShieldCheck size={16} /> Quote verified
        </span>
        <span className="pill">{c.claim_type.replaceAll('_', ' ')}</span>
      </div>
      <p className="claim-text">{c.text}</p>
      {c.metric && (
        <p className="small">
          {c.metric}: {c.value} {c.benchmark && `· ${c.benchmark}`}{' '}
          {c.baseline && `· baseline: ${c.baseline}`}
        </p>
      )}
      <blockquote>“{c.quote}”</blockquote>
      <div className="claim-source">
        <a
          href={`https://arxiv.org/${c.quote_source === 'abstract' ? 'abs' : 'html'}/${arxivId}${version}${c.quote_source === 'full_text' && c.quote_location !== 'Across sections' ? `#${encodeURIComponent(c.quote_location)}` : ''}`}
          target="_blank"
          rel="noreferrer"
        >
          {c.quote_location} <ArrowUpRight size={12} />
        </a>
        <button
          disabled={flagged}
          onClick={async () => {
            if (await feedback('claim', c.id, 'wrong')) setFlagged(true);
          }}
        >
          <Flag size={12} />
          {flagged ? 'Flag received' : 'Flag as wrong'}
        </button>
      </div>
      <small>Author-reported · Not yet independently confirmed</small>
    </div>
  );
}
function Trace({ steps, reason }: { steps: Row[]; reason?: string }) {
  return (
    <section className="trace">
      <details>
        <summary>
          <span>
            <Radio size={16} /> How this card was made
          </span>
          <ChevronDown size={16} />
        </summary>
        {reason && <p className="trace-reason">Editor’s reason: {reason}</p>}
        <ol>
          {steps.map((s: Row) => (
            <li key={s.id}>
              <span className={`trace-dot ${s.ok ? '' : 'error'}`} />
              <div>
                <strong>
                  {friendly[s.tool_name] || friendly[s.kind] || s.tool_name || s.kind}
                </strong>
                <p>{s.output_summary}</p>
                <small>
                  {s.agent} · {s.duration_ms || 0} ms
                  {s.tokens_in ? ` · ${Number(s.tokens_in) + Number(s.tokens_out)} tokens` : ''}
                </small>
                <details className="raw">
                  <summary>Show raw</summary>
                  <pre>{JSON.stringify(s, null, 2)}</pre>
                </details>
              </div>
            </li>
          ))}
        </ol>
        {!steps.length && <p>No agent steps were recorded.</p>}
      </details>
    </section>
  );
}
function BriefingTeaser({ briefing }: { briefing: Row | null }) {
  return (
    <div className="briefing-teaser">
      <div className="eyebrow">
        <Headphones size={15} /> THE BIG PICTURE
      </div>
      <div className="waveform" aria-hidden="true">
        {[8, 18, 26, 14, 34, 46, 28, 18, 38, 54, 32, 20, 42, 24, 14, 30, 42, 22, 12, 26, 16, 8].map(
          (h, i) => (
            <i key={i} style={{ height: h }} />
          ),
        )}
      </div>
      <h3>
        Your research.
        <br />
        In a shorter read.
      </h3>
      <p>
        {briefing
          ? 'The key findings, the caveats, and what’s worth your attention.'
          : 'The next edition will bring together the day’s key findings and caveats.'}
      </p>
      <Link className="button" href="/briefing/latest">
        {briefing?.audio_url ? <Play size={13} /> : <BookOpen size={14} />}{' '}
        {briefing ? 'Open the briefing' : 'About your briefing'}
        <ArrowRight size={13} />
      </Link>
      <small>
        {briefing?.audio_url
          ? 'Voice generated with ElevenLabs'
          : 'Text first. Audio, when configured.'}
      </small>
    </div>
  );
}
function Briefing({ briefing, feedback }: { briefing: Row | null; feedback: Feedback }) {
  const [voted, setVoted] = useState(false);
  if (!briefing)
    return (
      <Empty
        title="The briefing is still taking shape."
        text="A daily run creates a briefing from visible, verified cards. In required review mode, approve cards first and run again to generate their briefing."
      >
        <Link className="button primary" href="/runs">
          Go to agent runs <ArrowRight size={15} />
        </Link>
      </Empty>
    );
  return (
    <div className="briefing-page">
      <span className="eyebrow">{dateLabel(briefing.date)} · AI-GENERATED BRIEFING</span>
      <h1>{briefing.title}</h1>
      {briefing.audio_url && (
        <div className="audio-panel">
          <audio controls src={briefing.audio_url} />
          <p>Voice generated with ElevenLabs</p>
        </div>
      )}
      <div className="transcript">
        {briefing.script.split(/\n+/).map((p: string, i: number) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <h3>Go to the evidence</h3>
      <div className="briefing-links">
        {briefing.cards?.map((c: Row) => (
          <Link key={c.id} href={`/paper/${c.arxivId}`}>
            <ShieldCheck size={16} />
            <span>
              {c.title}
              <small>
                Author-reported · Not yet independently confirmed
                {c.status === 'draft' ? ' · AI-generated, not editor-reviewed' : ''}
              </small>
            </span>
            <ArrowUpRight size={16} />
          </Link>
        ))}
      </div>
      <div className="feedback">
        <span>Was this useful?</span>
        {['up', 'down'].map((v) => (
          <button
            disabled={voted}
            key={v}
            aria-label={`Vote ${v}`}
            onClick={async () => {
              if (await feedback('briefing', briefing.id, v)) setVoted(true);
            }}
          >
            {v === 'up' ? <ThumbsUp size={16} /> : <ThumbsDown size={16} />}
          </button>
        ))}
      </div>
    </div>
  );
}

type Action = (path: string, body: unknown, method?: string) => Promise<any>;
function Runs({ runs, status, action }: { runs: Row[]; status: Row; action: Action }) {
  const [limit, setLimit] = useState(3),
    [noAudio, setNoAudio] = useState(true),
    [dryRun, setDryRun] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <>
      <p className="page-description">
        See what the agents chose, what they checked, and where they stopped.
      </p>
      <div className="run-form panel">
        <div>
          <span className="eyebrow">START A DAILY EDITION</span>
          <h3>Turn attention into understanding.</h3>
          <p>Approved sources. Recorded decisions. A hard budget.</p>
        </div>
        <div className="run-options">
          <label>
            Papers{' '}
            <input
              type="number"
              min="1"
              max="10"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={noAudio}
              onChange={(e) => setNoAudio(e.target.checked)}
            />{' '}
            Skip audio
          </label>
          <label>
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />{' '}
            Collect & select only
          </label>
          <button
            className="button primary"
            disabled={busy || runs.some((r) => r.status === 'running')}
            onClick={async () => {
              setBusy(true);
              try {
                await action('/api/runs', { limit, noAudio, dryRun });
              } catch {
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <LoaderCircle className="spin" size={15} /> : <Play size={14} />} Run now
          </button>
        </div>
        {(!status.configured || !status.pricesConfigured) && (
          <div className="notice compact">
            {status.authMessage || 'Run codex login and sign in with ChatGPT.'} Your Codex
            subscription runs the local agents; no OpenAI API key is needed.
          </div>
        )}
      </div>
      {runs.length ? (
        <div className="table-wrap panel">
          <table>
            <thead>
              <tr>
                <th>Edition / run</th>
                <th>Status</th>
                <th>Selected / cards</th>
                <th>Tokens</th>
                <th>External spend</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/runs/${r.id}`}>
                      {dateLabel(r.started_at)} <ArrowUpRight size={12} />
                    </Link>
                    <small>
                      {r.trigger === 'fixture-preview'
                        ? 'Fixture preview · no agent calls'
                        : r.id.slice(0, 8)}
                    </small>
                  </td>
                  <td>
                    <span className={`pill ${r.status === 'success' ? 'green' : 'amber'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td>
                    {r.selected_count || 0} / {r.cards_created || 0}
                  </td>
                  <td>{(r.tokens_in || 0) + (r.tokens_out || 0)}</td>
                  <td>{r.trigger === 'fixture-preview' ? 'No API spend' : money(r.cost_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="A quiet newsroom, for now."
          text="Your first run and its complete decision trail will appear here."
        />
      )}
      <div className="cli-note">
        <span className="eyebrow">PREFER THE TERMINAL?</span>
        <code>npm run daily -- --limit 3 --no-audio</code>
        <p>
          Use <code>--dry-run</code> for collection and Editor selection only. It still uses the
          Editor model.
        </p>
      </div>
    </>
  );
}
function RunDetail({ run }: { run: Row | null }) {
  if (!run)
    return <Empty title="Run not found" text="This run may belong to a different database." />;
  return (
    <>
      <div className="run-summary">
        <span className="pill">{run.status}</span>
        <h2>{dateLabel(run.started_at)}</h2>
        <p>{run.id}</p>
        <div className="metric-grid">
          <Metric label="Candidates" value={run.candidates_count || 0} />
          <Metric label="Cards created" value={run.cards_created || 0} />
          <Metric label="Tokens" value={(run.tokens_in || 0) + (run.tokens_out || 0)} />
          <Metric
            label="External spend"
            value={run.trigger === 'fixture-preview' ? 'No API spend' : money(run.cost_usd)}
          />
        </div>
      </div>
      {run.error && <ErrorPanel error={run.error} />}
      <div className="phase-list">
        {run.phases.map((p: Row, i: number) => (
          <div key={i}>
            <span className="pill">{p.status}</span>
            <strong>{p.phase}</strong>
            <span>{p.detail}</span>
          </div>
        ))}
      </div>
      <h3>Editorial decisions</h3>
      <div className="table-wrap panel">
        <table>
          <thead>
            <tr>
              <th>Paper</th>
              <th>Buzz</th>
              <th>Decision</th>
            </tr>
          </thead>
          <tbody>
            {run.selections.map((s: Row) => (
              <tr key={s.arxiv_id}>
                <td>
                  {s.title || s.arxiv_id}
                  <small>{s.arxiv_id}</small>
                </td>
                <td>{Number(s.buzz_score || 0).toFixed(2)}</td>
                <td>
                  {s.selected ? (
                    <>
                      <span className="pill green">Pick {s.priority}</span>
                      <p>{s.reason}</p>
                    </>
                  ) : (
                    'Not selected'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {run.cards.some((c: Row) => c.status === 'failed') && (
        <div className="notice">
          <h3>Research failures</h3>
          {run.cards
            .filter((c: Row) => c.status === 'failed')
            .map((c: Row) => (
              <p key={c.id}>
                {c.arxiv_id}: {c.failure_reason}
              </p>
            ))}
        </div>
      )}
      <Trace steps={run.trace} />
    </>
  );
}
function Review({
  cards,
  audience,
  feedback,
  action,
}: {
  cards: Row[];
  audience: Audience;
  feedback: Feedback;
  action: Action;
}) {
  return (
    <>
      <p className="page-description">
        A human judgment, after the automated checks. Open each note to inspect its evidence before
        approving it.
      </p>
      {cards.length ? (
        cards.map((c: Row) => (
          <ReviewItem key={c.id} card={c} audience={audience} feedback={feedback} action={action} />
        ))
      ) : (
        <Empty
          title="The desk is clear."
          text="New draft cards will appear here for your editorial review."
        />
      )}
    </>
  );
}
function ReviewItem({
  card,
  audience,
  feedback,
  action,
}: {
  card: Row;
  audience: Audience;
  feedback: Feedback;
  action: Action;
}) {
  const [opened, setOpened] = useState<number | null>(null);
  return (
    <div className="review-item">
      <PaperCard
        card={card}
        index={0}
        audience={audience}
        feedback={feedback}
        onOpen={() => setOpened((previous) => previous ?? Date.now())}
      />
      <div className="review-actions">
        <button
          className="button"
          onClick={() =>
            action(`/api/review/${card.id}`, {
              action: 'hide',
              ...(opened ? { durationMs: Date.now() - opened } : {}),
            }).catch(() => {})
          }
        >
          <X size={14} /> Hide
        </button>
        <button
          className="button primary"
          disabled={!opened}
          onClick={() =>
            action(`/api/review/${card.id}`, {
              action: 'approve',
              durationMs: opened ? Date.now() - opened : 0,
            }).catch(() => {})
          }
        >
          <Check size={15} /> Approve
        </button>
      </div>
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}
function Metrics({ data: m, action }: { data: Row; action: Action }) {
  if (!m) return null;
  return (
    <>
      <p className="page-description">
        Publishing more isn’t the goal. Helping you judge the evidence is.
      </p>
      <div className="metric-grid">
        <Metric
          label="Human support rate"
          value={percent(m.spotCheckSupportedRate)}
          note={`${m.spotChecksJudged} human judgments`}
        />
        <Metric
          label="Quote pass rate"
          value={percent(m.quotePassRate)}
          note={`${m.verifiedClaims} verified / ${m.proposedClaims} proposed`}
        />
        <Metric label="Claims flagged wrong" value={m.flaggedWrong} />
        <Metric
          label="Reader usefulness"
          value={percent(m.approvalRate)}
          note="Positive card & briefing votes"
        />
      </div>
      <div className="metrics-detail panel">
        <h3>Time, resources, and perspective</h3>
        <dl className="timestamps">
          <div>
            <dt>Median editorial review</dt>
            <dd>
              {m.medianReviewMs == null
                ? 'Not measured'
                : `${Math.round(m.medianReviewMs / 1000)} seconds`}
            </dd>
          </div>
          <div>
            <dt>Median research time</dt>
            <dd>
              {m.medianResearchMs == null
                ? 'Not measured'
                : `${Math.round(m.medianResearchMs / 1000)} seconds`}
            </dd>
          </div>
          <div>
            <dt>Cards with bold claims</dt>
            <dd>{m.cards ? `${m.boldCards} / ${m.cards}` : 'No cards yet'}</dd>
          </div>
          <div>
            <dt>Bold cards with full text</dt>
            <dd>{m.boldCards ? `${m.boldWithHtml} / ${m.boldCards}` : 'Not measured'}</dd>
          </div>
          <div>
            <dt>Cards with community concerns</dt>
            <dd>{m.communityConcerns}</dd>
          </div>
          <div>
            <dt>Education & return engagement</dt>
            <dd>Not measured in MVP</dd>
          </div>
        </dl>
        <h4>Claim types</h4>
        <div className="labels">
          {m.claimTypes.map((c: Row) => (
            <span key={c.claim_type} className="pill">
              {c.claim_type.replaceAll('_', ' ')} · {c.value}
            </span>
          ))}
        </div>
        <h4 className="spaced-title">Subscription tokens per card</h4>
        {m.perCard?.length ? (
          m.perCard.map((c: Row) => (
            <div className="ledger-row" key={c.card_id}>
              <span>Card {c.card_id.slice(0, 8)}</span>
              <span>
                {c.tokens_in + c.tokens_out} tokens · {money(c.cost_usd)}
              </span>
            </div>
          ))
        ) : (
          <p>No model calls recorded. Fixture previews use no LLM tokens.</p>
        )}
        <h4 className="spaced-title">Briefing model usage</h4>
        {m.briefingCosts?.length ? (
          m.briefingCosts.map((b: Row) => (
            <div className="ledger-row" key={b.run_id}>
              <Link href={`/runs/${b.run_id}`}>Run {b.run_id.slice(0, 8)}</Link>
              <span>{money(b.llm_cost)} · Audio usage is included in the run ledger below.</span>
            </div>
          ))
        ) : (
          <p>No briefing model calls recorded.</p>
        )}
        <h4 className="spaced-title">External API spend · optional TTS</h4>
        {m.runs.map((r: Row) => (
          <div className="ledger-row" key={r.id}>
            <Link href={`/runs/${r.id}`}>
              {dateLabel(r.started_at, true)} · {r.trigger || r.id.slice(0, 8)}
            </Link>
            <span>
              {r.tokens_in + r.tokens_out} tokens · {money(r.cost_usd)}
            </span>
          </div>
        ))}
      </div>
      <div className="spotcheck-header">
        <div>
          <span className="eyebrow">TRUST IS A PRACTICE</span>
          <h2>Check our work.</h2>
          <p>
            Does the source quote actually support the claim? Human spot-checks measure what text
            matching cannot.
          </p>
        </div>
        <button
          className="button primary"
          onClick={() => action('/api/spot-checks', { action: 'start', size: 20 }).catch(() => {})}
        >
          <Plus size={15} /> Sample 20 claims
        </button>
      </div>
      {m.spotChecks.map((s: Row) => (
        <div className="spotcheck panel" key={s.id}>
          <h3>{s.text}</h3>
          <blockquote>“{s.quote}”</blockquote>
          <a
            href={`https://arxiv.org/${s.quote_source === 'full_text' ? 'html' : 'abs'}/${s.arxiv_id}${s.paper_version || ''}${s.quote_source === 'full_text' && s.quote_location ? `#${encodeURIComponent(s.quote_location)}` : ''}`}
            target="_blank"
            rel="noreferrer"
          >
            Read source <ArrowUpRight size={14} />
          </a>
          <div className="review-actions">
            {[
              ['supported', 'Supported'],
              ['not_supported', 'Not supported'],
              ['unclear', 'Unclear'],
            ].map(([verdict, label]) => (
              <button
                className="button"
                key={verdict}
                onClick={() =>
                  action('/api/spot-checks', { action: 'decide', id: s.id, verdict }).catch(
                    () => {},
                  )
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
function Preferences({
  data,
  token,
  setToken,
  action,
}: {
  data: Row;
  token: string;
  setToken: (v: string) => void;
  action: Action;
}) {
  const [topics, setTopics] = useState(data?.topics?.join(', ') || ''),
    [mode, setMode] = useState(data?.review_mode || 'personal'),
    [audience, setAudience] = useState(data?.briefing_audience || 'professional'),
    [limit, setLimit] = useState(data?.max_papers_per_run || 10),
    [busy, setBusy] = useState(false);
  return (
    <>
      <p className="page-description">
        Choose what deserves your attention, and how it reaches your desk.
      </p>
      <form
        className="preferences panel"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await action(
              '/api/settings',
              {
                topics: topics
                  .split(',')
                  .map((t: string) => t.trim())
                  .filter(Boolean),
                review_mode: mode,
                briefing_audience: audience,
                max_papers_per_run: Number(limit),
              },
              'PUT',
            );
          } catch {
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Your topics
          <span>Separate topics with commas. The Editor uses these to choose papers.</span>
          <input value={topics} onChange={(e) => setTopics(e.target.value)} required />
        </label>
        <label>
          Maximum papers per run
          <input
            type="number"
            min="1"
            max="10"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
          />
        </label>
        <label>
          Editorial review
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="personal">Personal — show drafts with a disclosure</option>
            <option value="required">Required — approve before display</option>
          </select>
        </label>
        <label>
          Briefing audience
          <select value={audience} onChange={(e) => setAudience(e.target.value)}>
            {audiences.map((a) => (
              <option value={a} key={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <button className="button primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save preferences'}
          <Check size={15} />
        </button>
      </form>
      <div className="panel admin-panel">
        <h3>Newsroom access</h3>
        <p>
          Production admin actions require the token from your environment. It stays in this page’s
          memory.
        </p>
        <label>
          Admin token
          <input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Only needed outside development"
          />
        </label>
        <p className="small muted">
          API keys and prices belong in the local .env file, never in the browser.
        </p>
      </div>
    </>
  );
}
function About() {
  return (
    <div className="about-page">
      <p className="about-lead">
        What everyone’s talking about vs.
        <br />
        <em>what the paper actually shows.</em>
      </p>
      <p>
        The Newsren is an agentic AI research briefing for curious engineers, students, and
        educators. Hugging Face and Hacker News tell us what’s drawing attention. The research goes
        back to the paper.
      </p>
      <div className="architecture">
        {[
          ['01', 'Collect', 'Approved attention signals'],
          ['02', 'Choose', 'An Editor with a hard budget'],
          ['03', 'Research', 'Primary sources and tools'],
          ['04', 'Verify', 'Code checks every quote'],
          ['05', 'Explain', 'One source, three perspectives'],
        ].map(([n, title, detail]) => (
          <div key={n}>
            <span>{n}</span>
            <strong>{title}</strong>
            <small>{detail}</small>
          </div>
        ))}
      </div>
      <h2>What “verified” means here.</h2>
      <div className="verification-levels">
        {[
          [
            'Faithfulness',
            'Does the paper actually say it?',
            'Checked: every claim’s quote is matched word for word against the paper.',
          ],
          [
            'Provenance',
            'Who says it, where, and when?',
            'Shown: author-reported, preprint vs. published, dates.',
          ],
          [
            'Corroboration',
            'Has anyone independent confirmed it?',
            'Not yet: shown as “Not yet independently confirmed”. On the roadmap.',
          ],
        ].map(([title, q, text], i) => (
          <div key={title}>
            <span className="eyebrow">
              0{i + 1} / {title.toUpperCase()}
            </span>
            <h3>{q}</h3>
            <p>{text}</p>
          </div>
        ))}
      </div>
      <h2>Judgment, with a record.</h2>
      <p>
        A fixed pipeline handles collection and storage. An Editor agent decides what deserves
        research within a hard budget, and a Research agent with tools decides what evidence to
        gather for each paper, checks every claim against the source, and reports what it couldn’t
        verify. Every step is recorded and shown as “How this card was made”.
      </p>
      <h2>Keep these caveats close.</h2>
      <ul>
        <li>
          Matching a quote does not prove that a claim follows from it. Human review and spot-checks
          still matter.
        </li>
        <li>Trending is attention, not importance. Quiet but important work may be missed.</li>
        <li>
          When HTML is unavailable, research is limited to the abstract. Full paper text is never
          served here.
        </li>
        <li>
          Community comments are opinions. Author-reported findings are not independent
          confirmation.
        </li>
        <li>
          This MVP is a single-user local app. Other verticals and paper Q&A are on the roadmap.
        </li>
      </ul>
      <h2>Sources & credits.</h2>
      <p>
        arXiv metadata (CC0), papers under their own licenses; Hugging Face Daily Papers; Hacker
        News via Algolia; OpenAI Codex with ChatGPT sign-in; optional ElevenLabs narration. We link
        to papers and display short source excerpts rather than re-hosting full texts.
      </p>
      <div className="about-closing">
        <Compass size={25} />
        <p>
          Stay curious.
          <br />
          <em>Keep the receipts.</em>
        </p>
      </div>
    </div>
  );
}
