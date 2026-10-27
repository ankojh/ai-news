'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  GraduationCap,
  KeyRound,
  Target,
  Check,
  ChevronDown,
  Lightbulb,
  ScanSearch,
  ShieldCheck,
  TrendingUp,
  Compass,
  LoaderCircle,
  Menu,
  Moon,
  Play,
  Plus,
  Sun,
  X,
} from 'lucide-react';
// JSON response fields vary across feed, run, and evaluation views.
type Row = Record<string, any>;
type Feedback = (type: string, id: string, value: string) => Promise<boolean>;
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
  get_paper_metadata: 'Read the paper’s details on arXiv',
  get_full_text: 'Read sections of the paper',
  get_hn_discussion: 'Read the Hacker News discussion',
  verify_quote: 'Checked a quote against the paper',
  submit_card: 'Wrote the evidence card',
  post_verify_drop: 'Removed a claim it couldn’t back up',
  submit_explanation: 'Wrote the student explanation',
  model_call: 'Planned the next step',
  budget_warning: 'Budget nearly used up',
  reuse_card: 'Reused an existing card',
};
const difficulty: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};
const studentView = (card: Row) => {
  const e: Row | undefined = card.explanations?.find((x: Row) => x.audience === 'student');
  return { e, x: (e?.extras || {}) as Row };
};
const readMinutes = (card: Row) => {
  const { e, x } = studentView(card);
  const words = [
    x.one_liner,
    e?.body,
    x.analogy,
    x.why_it_matters,
    ...(x.key_takeaways || []),
    ...(x.how_it_works || []).map((step: Row) => step.detail),
    ...(x.learn_first || []).map((item: Row) => item.why),
  ]
    .join(' ')
    .split(/\s+/).length;
  return Math.max(2, Math.round(words / 150) + 1);
};
// Readable quote location: "S4" → "section 4".
const where = (location = '') =>
  /^S\d+$/.test(location)
    ? `section ${location.slice(1)}`
    : /^abstract$/i.test(location)
      ? 'the abstract'
      : location.toLowerCase();
const paragraphs = (text = '') => text.split(/\n+/).filter(Boolean);
const publication = (paper: Row) =>
  paper.pub_status === 'published'
    ? `Published in ${paper.journal_ref}`
    : paper.pub_status === 'accepted_author_stated'
      ? 'Accepted (per the authors)'
      : 'Preprint';
// Short, quiet context line shared by the list and the paper page.
const metaLine = (card: Row, topics = 1) => {
  const { x } = studentView(card);
  return [
    ...(card.topics || []).slice(0, topics),
    x.difficulty && difficulty[x.difficulty],
    `${readMinutes(card)} min read`,
  ]
    .filter(Boolean)
    .join(' · ');
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
  const [dark, setDark] = useState(false),
    [menu, setMenu] = useState(false);
  const [data, setData] = useState<Row>({}),
    [status, setStatus] = useState<Row>({}),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [sort, setSort] = useState('picks'),
    [date, setDate] = useState(''),
    [token, setToken] = useState('');
  const loadVersion = useRef(0);
  useEffect(() => {
    const theme = localStorage.getItem('newsren-theme') === 'dark';
    setDark(theme);
    document.documentElement.classList.toggle('dark', theme);
  }, []);
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
        const query = new URLSearchParams({ sort, ...(date ? { date } : {}) });
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
    [pathname, section, id, sort, date, token],
  );
  useEffect(() => {
    load();
    setMenu(false);
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
      setNotice('Saved.');
      await load(true);
      return result;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Action failed');
      throw e;
    }
  };
  const refresh = useCallback(() => load(true), [load]);
  const feedback = (type: string, targetId: string, value: string) =>
    action('/api/feedback', { targetType: type, targetId, value })
      .then(() => true)
      .catch(() => false);
  const cards = section === 'technology' && Array.isArray(data.value) ? data.value : [];
  const pageTitles: Record<string, string> = {
    review: 'Review queue',
    runs: 'Agent runs',
    metrics: 'Trust & metrics',
    settings: 'Settings',
  };
  const edition = date || status.dates?.[0]?.date;
  const pending = loading || data.path !== pathname;
  const nav = [
    ['/technology', 'AI & Technology', section === 'technology' || section === 'paper'],
    ['/briefing/latest', 'Listen', section === 'briefing'],
    ['/about', 'About', section === 'about'],
  ] as const;
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className={`paper-head ${section === 'technology' ? '' : 'compact'}`}>
        <div className="paper-top">
          <span className="paper-date">{longDate(edition)}</span>
          <Link className="paper-top-link" href="/briefing/latest">
            Listen to today’s briefing
          </Link>
          <div className="header-tools">
            <button
              className="icon-button"
              aria-label={dark ? 'Use light theme' : 'Use dark theme'}
              onClick={toggleTheme}
            >
              {dark ? <Sun size={17} strokeWidth={1.5} /> : <Moon size={17} strokeWidth={1.5} />}
            </button>
            <button
              className="icon-button"
              aria-label="More"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X size={18} strokeWidth={1.5} /> : <Menu size={18} strokeWidth={1.5} />}
            </button>
          </div>
        </div>
        <Link href="/technology" className="nameplate">
          The Newsren
        </Link>
        <p className="motto">AI research news, explained for students</p>
        <nav className="section-nav" aria-label="Main">
          {nav.map(([href, label, active]) => (
            <Link key={href} href={href} aria-current={active ? 'page' : undefined}>
              {label}
            </Link>
          ))}
        </nav>
        {menu && (
          <nav className="more-menu" aria-label="More">
            <Link href="/runs">Agent runs</Link>
            <Link href="/review">Review queue</Link>
            <Link href="/metrics">Trust & metrics</Link>
            <Link href="/settings">Settings</Link>
          </nav>
        )}
      </header>
      <main id="main-content" className="shell">
        {status.demo && (
          <p className="preview-note">
            Preview data: sample cards from real abstracts, not yet explained by the AI.
          </p>
        )}
        {section === 'technology' ? (
          <section className="front" aria-labelledby="front-heading">
            <div className="front-bar">
              <h1 id="front-heading">
                Today’s AI research news, explained.{' '}
                <span>
                  Picked from what researchers are upvoting and debating; every claim checked
                  against the paper itself.
                </span>
              </h1>
              <div className="list-controls">
                <select aria-label="Edition" value={date} onChange={(e) => setDate(e.target.value)}>
                  <option value="">Latest edition</option>
                  {status.dates?.map((d: Row) => (
                    <option key={d.date} value={d.date}>
                      {dateLabel(d.date, true)}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Sort stories"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="picks">Editor’s picks</option>
                  <option value="discussed">Most discussed</option>
                  <option value="newest">Newest</option>
                </select>
              </div>
            </div>
            <div className="front-grid">
              <div className="front-lead">
                {pending ? (
                  <Loading />
                ) : error ? (
                  <ErrorPanel error={error} />
                ) : cards.length ? (
                  <Story card={cards[0]} variant="lead" />
                ) : (
                  <Empty
                    title="No stories yet."
                    text={
                      status.reviewMode === 'required'
                        ? 'New stories appear here after approval in the review queue.'
                        : 'Run the AI agents to report on today’s trending papers.'
                    }
                  />
                )}
              </div>
              <aside className="front-rail">
                <RunPanel status={status} token={token} onFinished={refresh} />
                {!pending &&
                  cards
                    .slice(1, 3)
                    .map((card: Row) => <Story key={card.id} card={card} variant="rail" />)}
              </aside>
            </div>
            {!pending && cards.length > 3 && (
              <>
                <h2 className="section-rule">
                  <span>More top stories</span>
                </h2>
                <div className="story-grid">
                  {cards.slice(3).map((card: Row) => (
                    <Story key={card.id} card={card} variant="standard" />
                  ))}
                </div>
              </>
            )}
            <h2 className="section-rule">
              <span>How we report</span>
            </h2>
            <HowItWorks />
          </section>
        ) : (
          <>
            {pageTitles[section] && (
              <div className="page-head">
                <h1>{pageTitles[section]}</h1>
              </div>
            )}
            {section === 'about' ? (
              <About />
            ) : pending ? (
              <Loading />
            ) : error ? (
              <ErrorPanel error={error} />
            ) : section === 'paper' && data.value ? (
              <PaperLesson card={data.value} feedback={feedback} />
            ) : section === 'briefing' ? (
              <Briefing briefing={data.value} feedback={feedback} />
            ) : section === 'runs' ? (
              id ? (
                <RunDetail run={data.value} />
              ) : (
                <Runs runs={data.value || []} status={status} action={action} />
              )
            ) : section === 'review' ? (
              <Review cards={data.value || []} feedback={feedback} action={action} />
            ) : section === 'metrics' ? (
              <Metrics data={data.value} action={action} />
            ) : section === 'settings' ? (
              <Preferences data={data.value} token={token} setToken={setToken} action={action} />
            ) : (
              <Empty title="Page not found." text="Go back to today’s papers." />
            )}
          </>
        )}
        <footer className="site-footer">
          <p>
            Summaries are AI-generated. Claims are matched word for word to each paper; they are not
            independently confirmed. Always read the source.
          </p>
          <nav aria-label="Footer">
            <Link href="/about">About</Link>
            <Link href="/metrics">Metrics</Link>
            <Link href="/settings">Settings</Link>
          </nav>
        </footer>
      </main>
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

function Loading() {
  return (
    <div className="loading">
      <LoaderCircle size={18} className="spin" /> Loading…
    </div>
  );
}
function ErrorPanel({ error }: { error: string }) {
  return (
    <div className="notice" role="alert">
      <strong>We couldn’t complete that.</strong>
      <p>{error}</p>
      <Link href="/settings">
        Open settings <ArrowUpRight size={14} />
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
      <Compass size={28} strokeWidth={1} />
      <h2>{title}</h2>
      <p>{text}</p>
      {children}
    </div>
  );
}
const thumbnail = (id: string) =>
  `https://cdn-thumbnails.huggingface.co/social-thumbnails/papers/${id}.png`;
// Remote images from Hugging Face and arXiv; hidden when a paper has none.
function Picture({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}
function SourceMark({ source }: { source: string }) {
  if (source === 'hf')
    return (
      <span className="source-mark hf" aria-hidden="true">
        🤗
      </span>
    );
  if (source === 'hn')
    return (
      <span className="source-mark hn" aria-hidden="true">
        Y
      </span>
    );
  return (
    <span className="source-mark arxiv" aria-hidden="true">
      arXiv
    </span>
  );
}
function Signals({ card }: { card: Row }) {
  const signals: Row[] = card.signals.filter(
    (s: Row, i: number, a: Row[]) => a.findIndex((y) => y.source === s.source) === i,
  );
  return (
    <p className="signals">
      {signals.map((s: Row) => (
        <a key={s.source} href={s.url} target="_blank" rel="noreferrer">
          <SourceMark source={s.source} />
          {s.source === 'hf'
            ? `${s.score} upvotes on Hugging Face`
            : `${s.score} points on Hacker News`}
        </a>
      ))}
      <a
        href={`https://arxiv.org/abs/${card.arxiv_id}${card.paper_version || ''}`}
        target="_blank"
        rel="noreferrer"
      >
        <SourceMark source="arxiv" />
        Paper
      </a>
    </p>
  );
}
function Difficulty({ level }: { level?: string }) {
  const n = ['beginner', 'intermediate', 'advanced'].indexOf(level || '') + 1;
  if (!n) return null;
  return (
    <span className="difficulty" title={`${difficulty[level!]} level`} aria-hidden="true">
      {[1, 2, 3].map((i) => (
        <i key={i} className={i <= n ? 'on' : ''} />
      ))}
    </span>
  );
}
const stages = [
  ['A', 'Find trending papers'],
  ['B', 'Pick the most useful'],
  ['C', 'Read and check claims'],
  ['D', 'Write explanations'],
  ['E', 'Write the briefing'],
] as const;
// Starts a daily run and follows its phases until it finishes.
function RunPanel({
  status,
  token,
  onFinished,
}: {
  status: Row;
  token: string;
  onFinished: () => void;
}) {
  const [run, setRun] = useState<Row | null>(null),
    [limit, setLimit] = useState(3),
    [audio, setAudio] = useState(true),
    [starting, setStarting] = useState(false),
    [error, setError] = useState('');
  const running = run?.status === 'running';
  useEffect(() => {
    request('/api/runs')
      .then((runs: Row[]) => {
        const latest = runs.find((r) => r.trigger !== 'fixture-preview');
        if (latest) return request(`/api/runs/${latest.id}`).then(setRun);
      })
      .catch(() => {});
  }, []);
  const runId = run?.id;
  useEffect(() => {
    if (!running || !runId) return;
    const timer = setInterval(async () => {
      try {
        const next = await request(`/api/runs/${runId}`);
        setRun(next);
        if (next.status !== 'running') onFinished();
      } catch {}
    }, 2500);
    return () => clearInterval(timer);
  }, [running, runId, onFinished]);
  const start = async () => {
    setStarting(true);
    setError('');
    try {
      const { id } = await request(
        '/api/runs',
        { method: 'POST', body: JSON.stringify({ limit, noAudio: !audio }) },
        token,
      );
      setRun(await request(`/api/runs/${id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the run');
    } finally {
      setStarting(false);
    }
  };
  const phases: Row[] = run?.phases || [];
  const stateOf = (letter: string) => {
    const mine = phases.filter((p) => String(p.phase).startsWith(letter));
    if (mine.some((p) => p.status === 'done')) return 'done';
    if (mine.length) return 'active';
    return run && run.status !== 'running' ? 'skipped' : 'waiting';
  };
  const detailOf = (letter: string) =>
    phases.find((p) => String(p.phase).startsWith(letter) && p.detail)?.detail;
  return (
    <aside className="run-panel" aria-live="polite">
      <p className="label">Today’s research</p>
      <h2>Run the AI agents</h2>
      <p className="run-panel-text">
        The agents find trending papers, read them, check every claim against the paper and write a
        student explanation. About a minute per paper.
      </p>
      <div className="run-controls">
        <label>
          Papers
          <select
            value={limit}
            disabled={running}
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            {[1, 3, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={audio}
            disabled={running}
            onChange={(e) => setAudio(e.target.checked)}
          />
          Audio briefing
        </label>
      </div>
      <button
        className="run-button"
        onClick={start}
        disabled={running || starting || status.configured === false}
      >
        {running || starting ? (
          <LoaderCircle size={17} className="spin" />
        ) : (
          <Play size={16} fill="currentColor" />
        )}
        {running ? 'Agents are working…' : starting ? 'Starting…' : 'Run the agents'}
      </button>
      {status.configured === false && (
        <p className="run-warning">
          {status.authMessage || 'Codex is not signed in.'} Run <code>codex login</code> in a
          terminal first.
        </p>
      )}
      {error && <p className="run-warning">{error}</p>}
      {run && (
        <div className="run-progress">
          <ol>
            {stages.map(([letter, label]) => {
              const state = stateOf(letter);
              return (
                <li key={letter} className={state}>
                  <span className="run-dot">
                    {state === 'done' ? (
                      <Check size={11} strokeWidth={3} />
                    ) : state === 'active' && running ? (
                      <LoaderCircle size={11} className="spin" />
                    ) : null}
                  </span>
                  <span>
                    {label}
                    {detailOf(letter) && <small> · {detailOf(letter)}</small>}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="meta">
            {running
              ? `Started ${new Date(run.started_at).toLocaleTimeString()}`
              : `Last run ${dateLabel(run.started_at, true)}, ${new Date(run.started_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · ${run.status} · ${run.cards_created || 0} new paper${run.cards_created === 1 ? '' : 's'}`}{' '}
            · <Link href={`/runs/${run.id}`}>Details</Link>
          </p>
          {run.error && <p className="run-warning">{run.error}</p>}
        </div>
      )}
    </aside>
  );
}
function HowItWorks() {
  const steps = [
    [TrendingUp, 'Spot', 'Papers researchers are upvoting on Hugging Face and Hacker News.'],
    [ScanSearch, 'Read', 'An agent goes back to the paper itself on arXiv.'],
    [ShieldCheck, 'Check', 'Every claim is matched to a sentence in the paper.'],
    [BookOpen, 'Explain', 'A plain-English summary, key words, and a quick quiz.'],
  ] as const;
  return (
    <ol className="how" aria-label="How it works">
      {steps.map(([Icon, title, text], i) => (
        <li key={title}>
          <span className="how-icon">
            <Icon size={20} strokeWidth={1.6} />
          </span>
          <strong>
            <span className="how-n">{i + 1}</span> {title}
          </strong>
          <p>{text}</p>
        </li>
      ))}
    </ol>
  );
}
// How far the evidence goes: claimed → matched in the paper → independently confirmed.
function EvidenceLadder({ matched }: { matched: number }) {
  const steps = [
    ['done', 'The authors claim it', 'Reported in their paper'],
    [
      matched ? 'done' : 'open',
      'We found it in the paper',
      matched ? `${matched} claim${matched === 1 ? '' : 's'} matched word for word` : 'No match',
    ],
    ['open', 'Others confirmed it', 'Not yet tested by an outside team'],
  ];
  return (
    <ol className="ladder" aria-label="How far the evidence goes">
      {steps.map(([state, title, text]) => (
        <li key={title} className={state}>
          <span className="ladder-dot">
            {state === 'done' && <Check size={13} strokeWidth={3} />}
          </span>
          <strong>{title}</strong>
          <span>{text}</span>
        </li>
      ))}
    </ol>
  );
}
// One request per paper, shared by the list thumbnail and the paper page.
const figures = new Map<string, Promise<Row | null>>();
function useFigure(id: string) {
  const [figure, setFigure] = useState<Row | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    if (!figures.has(id))
      figures.set(
        id,
        request(`/api/papers/${id}/figure`).catch(() => null),
      );
    figures.get(id)!.then((f) => live && setFigure(f));
    return () => {
      live = false;
    };
  }, [id]);
  return figure;
}
function Thumb({ card }: { card: Row }) {
  const figure = useFigure(`${card.arxiv_id}${card.paper_version || ''}`);
  const hf = card.signals.some((s: Row) => s.source === 'hf');
  if (figure === undefined) return <span className="paper-thumb loading-figure" />;
  const src = figure?.src || (hf ? thumbnail(card.arxiv_id) : '');
  if (!src) return null;
  return (
    <Link
      href={`/paper/${card.arxiv_id}`}
      className={`paper-thumb ${figure ? 'figure' : ''}`}
      tabIndex={-1}
      aria-hidden="true"
    >
      <Picture src={src} alt="" />
    </Link>
  );
}
function PaperFigure({ id, fallback }: { id: string; fallback: string }) {
  const figure = useFigure(id);
  if (figure === undefined) return <div className="paper-figure loading-figure" />;
  if (!figure && !fallback) return null;
  return (
    <figure className="paper-figure">
      <div className="paper-figure-frame">
        <Picture
          src={figure?.src || fallback}
          alt={figure ? `${figure.label} from the paper` : 'Paper preview'}
        />
      </div>
      <figcaption>
        {figure ? (
          <>
            <strong>{figure.label}.</strong> {figure.caption}{' '}
            <a href={`https://arxiv.org/html/${id}`} target="_blank" rel="noreferrer">
              From the paper ↗
            </a>
          </>
        ) : (
          'Preview image from Hugging Face.'
        )}
      </figcaption>
    </figure>
  );
}
const longDate = (date?: string) =>
  (date ? new Date(date) : new Date()).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: date ? 'UTC' : undefined,
  });
const byline = (authors: string[]) =>
  authors.length > 2 ? `${authors[0]} and colleagues` : authors.join(' and ');
// A front-page story: lead (big, with figure and core idea), rail (text only) or standard.
function Story({ card, variant }: { card: Row; variant: 'lead' | 'rail' | 'standard' }) {
  const { x } = studentView(card);
  const href = `/paper/${card.arxiv_id}`;
  const Headline = variant === 'lead' ? 'h2' : 'h3';
  const bold = card.claims.some((c: Row) => c.is_bold === 1);
  return (
    <article className={`story ${variant}`}>
      {variant !== 'rail' && <Thumb card={card} />}
      <p className="kicker">{card.topics?.[0] || 'AI research'}</p>
      <Headline className="headline">
        <Link href={href}>{card.paper.title}</Link>
      </Headline>
      <p className="deck">{x.one_liner || card.tldr}</p>
      {variant === 'lead' && x.core_idea && (
        <p className="story-excerpt">
          <strong>The core idea.</strong> {x.core_idea}
        </p>
      )}
      <p className="story-byline">
        By {byline(card.paper.authors)} · {readMinutes(card)} min read
      </p>
      <p className="story-status">
        {publication(card.paper)} · not yet independently confirmed
        {bold && ' · strong claim'}
      </p>
      <Link className="story-more" href={href}>
        Read the story <ArrowRight size={15} />
      </Link>
    </article>
  );
}
function StudentCard({ card, index }: { card: Row; index: number }) {
  const { x } = studentView(card);
  const bold = card.claims.some((c: Row) => c.is_bold === 1);
  return (
    <article className="paper-row">
      <span className="paper-row-number" aria-hidden="true">
        {index + 1}
      </span>
      <div>
        <p className="meta">
          <Difficulty level={x.difficulty} /> {metaLine(card)}
        </p>
        <h3>
          <Link href={`/paper/${card.arxiv_id}`}>{card.paper.title}</Link>
        </h3>
        <p className="paper-row-summary">{x.one_liner || card.tldr}</p>
        <p className="meta">
          {publication(card.paper)} · not yet independently confirmed
          {bold && ' · strong claim'}
        </p>
        <Signals card={card} />
      </div>
      <Thumb card={card} />
    </article>
  );
}
function PaperLesson({
  card,
  feedback,
  embedded = false,
}: {
  card: Row;
  feedback: Feedback;
  embedded?: boolean;
}) {
  const [voted, setVoted] = useState('');
  const p = card.paper;
  const { e, x } = studentView(card);
  const takeaways: string[] = x.key_takeaways || [];
  const glossary: Row[] = e?.glossary || [];
  const quiz: Row[] = x.quiz || [];
  const steps: Row[] = x.how_it_works || [];
  const learn: Row[] = x.learn_first || [];
  const careful = card.limitations || card.could_not_verify.length || card.discussion.length;
  const signals: Row[] = card.signals.filter(
    (s: Row, i: number, a: Row[]) => a.findIndex((y) => y.source === s.source) === i,
  );
  const toc = [
    ['big-idea', 'The big idea'],
    ...(steps.length ? [['how', 'How it works']] : []),
    ['found', 'What they found'],
    ...(careful ? [['careful', 'Read with care']] : []),
    ...(learn.length || glossary.length ? [['learn', 'Learn the basics']] : []),
    ...(quiz.length || takeaways.length ? [['quiz', 'Remember & check']] : []),
    ['deeper', 'Go deeper'],
  ];
  const Title = embedded ? 'h2' : 'h1';
  return (
    <article className={`lesson ${embedded ? 'embedded' : ''}`}>
      {!embedded && (
        <Link href="/technology" className="back-link">
          ← All papers
        </Link>
      )}
      <header className="lesson-head">
        <p className="kicker lesson-kicker">{card.topics?.[0] || 'AI research'}</p>
        <Title>{p.title}</Title>
        <p className="lesson-standfirst">{x.one_liner || card.tldr}</p>
        <p className="byline">
          By {byline(p.authors)} · Published {dateLabel(p.published_at)} · Explained by The Newsren
          ·{' '}
          <a
            href={`https://arxiv.org/abs/${card.arxiv_id}${card.paper_version || ''}`}
            target="_blank"
            rel="noreferrer"
          >
            Read on arXiv ↗
          </a>
        </p>
        <p className="lesson-status">
          <Difficulty level={x.difficulty} /> {metaLine(card, 3)} · {publication(p)} · not yet
          independently confirmed
          {card.status === 'draft' && ' · not editor-reviewed'}
        </p>
        <Signals card={card} />
      </header>
      {!embedded && (
        <PaperFigure
          id={`${card.arxiv_id}${card.paper_version || ''}`}
          fallback={
            card.signals.some((s: Row) => s.source === 'hf') ? thumbnail(card.arxiv_id) : ''
          }
        />
      )}
      <div className="lesson-layout">
        {!embedded && (
          <nav className="lesson-toc" aria-label="On this page">
            {toc.map(([anchor, label]) => (
              <a key={anchor} href={`#${anchor}`}>
                {label}
              </a>
            ))}
          </nav>
        )}
        <div className="lesson-body">
          <section id="big-idea">
            <h2>The big idea</h2>
            {embedded && <p className="standfirst">{x.one_liner || card.tldr}</p>}
            {x.problem ? (
              <>
                <div className="idea-block">
                  <span className="idea-icon">
                    <Target size={18} strokeWidth={1.7} />
                  </span>
                  <div>
                    <h3>The problem</h3>
                    <p>{x.problem}</p>
                  </div>
                </div>
                <div className="idea-block core">
                  <span className="idea-icon">
                    <KeyRound size={18} strokeWidth={1.7} />
                  </span>
                  <div>
                    <h3>The core idea</h3>
                    <p>{x.core_idea}</p>
                  </div>
                </div>
              </>
            ) : e?.body ? (
              paragraphs(e.body).map((t, i) => <p key={i}>{t}</p>)
            ) : (
              <p className="muted">
                The student explanation isn’t ready yet. The claims below come straight from the
                paper.
              </p>
            )}
            {x.why_it_matters && (
              <p>
                <span className="label inline">Why it might matter.</span> {x.why_it_matters}
              </p>
            )}
          </section>
          {steps.length > 0 && (
            <section id="how">
              <h2>How it works</h2>
              <ol className="steps">
                {steps.map((step, i) => (
                  <li key={i}>
                    <span className="step-n">{i + 1}</span>
                    <div>
                      <strong>{step.title}</strong>
                      <p>{step.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
              {x.analogy && (
                <aside className="callout">
                  <Lightbulb size={20} strokeWidth={1.6} />
                  <div>
                    <span className="label">Think of it like this</span>
                    <p>{x.analogy}</p>
                    <p className="meta">An analogy is a simplification, not the full picture.</p>
                  </div>
                </aside>
              )}
            </section>
          )}
          {!steps.length && x.analogy && (
            <aside className="callout">
              <Lightbulb size={20} strokeWidth={1.6} />
              <div>
                <span className="label">Think of it like this</span>
                <p>{x.analogy}</p>
                <p className="meta">An analogy is a simplification, not the full picture.</p>
              </div>
            </aside>
          )}
          <section id="found">
            <h2>What the authors report</h2>
            {x.results && <p className="results">{x.results}</p>}
            <EvidenceLadder matched={card.claims.length} />
            <p className="muted">
              Each claim is shown with the sentence it comes from. We check that the sentence is in
              the paper; nobody outside the team has tested the results yet.
            </p>
            {!card.claims.length && (
              <p className="muted">No claim could be matched to the paper’s own words.</p>
            )}
            {card.claims.map((c: Row) => (
              <StudentClaim
                key={c.id}
                claim={c}
                arxivId={card.arxiv_id}
                version={card.paper_version}
                feedback={feedback}
              />
            ))}
            {(card.whats_new || card.method || card.findings) && (
              <details className="fold">
                <summary>
                  Technical notes <ChevronDown size={15} />
                </summary>
                {[
                  ['whats_new', 'What’s new'],
                  ['method', 'How they did it'],
                  ['findings', 'What they found'],
                ].map(
                  ([key, label]) =>
                    card[key] && (
                      <div key={key}>
                        <h4>{label}</h4>
                        <p>{card[key]}</p>
                      </div>
                    ),
                )}
              </details>
            )}
          </section>
          {careful ? (
            <section id="careful">
              <h2>Read with care</h2>
              {card.limitations && <p>{card.limitations}</p>}
              {card.could_not_verify.length > 0 && (
                <>
                  <h3>What we couldn’t check</h3>
                  <ul className="plain-list">
                    {card.could_not_verify.map((s: string, i: number) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </>
              )}
              {card.discussion.length > 0 && (
                <>
                  <h3>From the online discussion</h3>
                  <p className="muted">Opinions, not facts.</p>
                  {card.discussion.map((d: Row, i: number) => (
                    <div key={i} className="comment">
                      <p>{d.summary}</p>
                      <blockquote>{d.quote}</blockquote>
                      <a
                        className="meta"
                        href={`https://news.ycombinator.com/item?id=${d.comment_id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {d.stance} · read the comment ↗
                      </a>
                    </div>
                  ))}
                </>
              )}
            </section>
          ) : null}
          {(learn.length > 0 || glossary.length > 0) && (
            <section id="learn">
              <h2>Learn the basics</h2>
              {learn.length > 0 && (
                <>
                  <p className="muted">
                    New to this area? These ideas make the paper much easier to follow.
                  </p>
                  <ol className="learn-path">
                    {learn.map((item) => (
                      <li key={item.concept}>
                        <GraduationCap size={18} strokeWidth={1.6} />
                        <div>
                          <strong>{item.concept}</strong>
                          <p>{item.why}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </>
              )}
              {glossary.length > 0 && (
                <>
                  <h3>Words to know</h3>
                  <dl className="terms">
                    {glossary.map((g) => (
                      <div key={g.term}>
                        <dt>{g.term}</dt>
                        <dd>{g.definition}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
            </section>
          )}
          {(takeaways.length > 0 || quiz.length > 0) && (
            <section id="quiz">
              <h2>Remember & check yourself</h2>
              {takeaways.length > 0 && (
                <div className="takeaways">
                  <h3>Remember</h3>
                  <ol>
                    {takeaways.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ol>
                </div>
              )}
              {quiz.map((q, i) => (
                <QuizQuestion key={i} q={q} />
              ))}
            </section>
          )}
          <section id="deeper">
            <h2>Go deeper</h2>
            {[
              ['hypothesis', 'The question they asked'],
              ['possible_applications', 'Where it could be used (speculative)'],
              ['watch_next', 'What to watch next (speculative)'],
            ].map(
              ([key, label]) =>
                card[key] && (
                  <div key={key}>
                    <h3>{label}</h3>
                    <p>{card[key]}</p>
                  </div>
                ),
            )}
            <Trace steps={card.trace} reason={card.selection_reason} />
            <details className="fold">
              <summary>
                Sources and dates <ChevronDown size={15} />
              </summary>
              <p className="source-list">
                <a
                  href={`https://arxiv.org/abs/${card.arxiv_id}${card.paper_version}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  arXiv ↗
                </a>
                {p.html_available === 1 && (
                  <a
                    href={`https://arxiv.org/html/${card.arxiv_id}${card.paper_version}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Full text ↗
                  </a>
                )}
                {signals.map((s: Row) => (
                  <a key={s.source} href={s.url} target="_blank" rel="noreferrer">
                    {s.source === 'hf'
                      ? `Hugging Face (${s.score} upvotes) ↗`
                      : `Hacker News (${s.score} points) ↗`}
                  </a>
                ))}
              </p>
              <dl className="dates">
                {[
                  ['Published', p.published_at],
                  ['Updated', p.updated_at],
                  ['First seen', p.first_seen_at],
                  ['Fetched', p.last_fetched_at],
                  ['Explained', card.created_at],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value ? new Date(value).toLocaleString() : 'Unavailable'}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </section>
          <p className="helpful">
            Was this helpful?
            {[
              ['up', 'Yes'],
              ['down', 'No'],
            ].map(([v, label]) => (
              <button
                key={v}
                className={voted === v ? 'selected' : ''}
                disabled={!!voted}
                onClick={async () => {
                  if (await feedback('card', card.id, v)) setVoted(v);
                }}
              >
                {label}
              </button>
            ))}
            {voted && <span className="muted">Thanks.</span>}
          </p>
        </div>
      </div>
    </article>
  );
}
function QuizQuestion({ q }: { q: Row }) {
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked !== null;
  return (
    <fieldset className="quiz">
      <legend>{q.question}</legend>
      {q.options.map((option: string, i: number) => (
        <button
          key={i}
          type="button"
          disabled={answered}
          aria-pressed={picked === i}
          className={answered && i === q.answer_index ? 'right' : picked === i ? 'wrong' : ''}
          onClick={() => setPicked(i)}
        >
          {option}
        </button>
      ))}
      {answered && (
        <p className="quiz-result" role="status">
          <strong>{picked === q.answer_index ? 'Right.' : 'Not quite.'}</strong> {q.explanation}{' '}
          <button type="button" className="text-button" onClick={() => setPicked(null)}>
            Try again
          </button>
        </p>
      )}
    </fieldset>
  );
}
function StudentClaim({
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
    <div className="claim-block">
      <p className="claim-text">{c.text}</p>
      {c.metric && (
        <p className="meta">
          {c.metric}: {c.value}
          {c.benchmark && ` on ${c.benchmark}`}
          {c.baseline && ` (vs. ${c.baseline})`}
        </p>
      )}
      <blockquote>“{c.quote}”</blockquote>
      <p className="meta">
        <a
          href={`https://arxiv.org/${c.quote_source === 'abstract' ? 'abs' : 'html'}/${arxivId}${version}${c.quote_source === 'full_text' && c.quote_location !== 'Across sections' ? `#${encodeURIComponent(c.quote_location)}` : ''}`}
          target="_blank"
          rel="noreferrer"
        >
          Matched in {where(c.quote_location)} ↗
        </a>
        {' · '}
        <button
          className="text-button"
          disabled={flagged}
          onClick={async () => {
            if (await feedback('claim', c.id, 'wrong')) setFlagged(true);
          }}
        >
          {flagged ? 'Thanks for flagging' : 'Report an error'}
        </button>
      </p>
    </div>
  );
}
function Trace({ steps, reason }: { steps: Row[]; reason?: string }) {
  return (
    <section className="trace">
      <details className="fold">
        <summary>
          How this page was made <ChevronDown size={15} />
        </summary>
        {reason && <p className="trace-reason">Why this paper was picked: {reason}</p>}
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
function Briefing({ briefing, feedback }: { briefing: Row | null; feedback: Feedback }) {
  const [voted, setVoted] = useState(false);
  if (!briefing)
    return (
      <Empty
        title="No briefing yet."
        text="A daily run writes a short spoken briefing from the checked papers. In required review mode, approve papers first and run again."
      >
        <Link className="quiet-link" href="/runs">
          Go to agent runs →
        </Link>
      </Empty>
    );
  return (
    <article className="briefing">
      <p className="dateline">{dateLabel(briefing.date)}</p>
      <h1>{briefing.title}</h1>
      {briefing.audio_url ? (
        <div className="audio">
          <audio controls src={briefing.audio_url} />
          <p className="meta">Voice generated with ElevenLabs</p>
        </div>
      ) : (
        <p className="meta">No audio for this edition.</p>
      )}
      <div className="transcript">
        {briefing.script.split(/\n+/).map((t: string, i: number) => (
          <p key={i}>{t}</p>
        ))}
      </div>
      <h2>In this briefing</h2>
      <ul className="link-list">
        {briefing.cards?.map((c: Row) => (
          <li key={c.id}>
            <Link href={`/paper/${c.arxivId}`}>{c.title}</Link>
          </li>
        ))}
      </ul>
      <p className="helpful">
        Was this helpful?
        {[
          ['up', 'Yes'],
          ['down', 'No'],
        ].map(([v, label]) => (
          <button
            key={v}
            disabled={voted}
            onClick={async () => {
              if (await feedback('briefing', briefing.id, v)) setVoted(true);
            }}
          >
            {label}
          </button>
        ))}
        {voted && <span className="muted">Thanks.</span>}
      </p>
    </article>
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
function Review({ cards, feedback, action }: { cards: Row[]; feedback: Feedback; action: Action }) {
  return (
    <>
      <p className="page-description">
        A human judgment, after the automated checks. Open each note to inspect its evidence before
        approving it.
      </p>
      {cards.length ? (
        cards.map((c: Row) => (
          <ReviewItem key={c.id} card={c} feedback={feedback} action={action} />
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
function ReviewItem({ card, feedback, action }: { card: Row; feedback: Feedback; action: Action }) {
  const [opened, setOpened] = useState<number | null>(null);
  return (
    <div className="review-item">
      <StudentCard card={card} index={0} />
      <details
        className="review-evidence"
        onToggle={(e) => {
          if (e.currentTarget.open) setOpened((previous) => previous ?? Date.now());
        }}
      >
        <summary>
          Inspect the explanation and evidence <ChevronDown size={16} />
        </summary>
        <PaperLesson card={card} feedback={feedback} embedded />
      </details>
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
        The Newsren is an agentic AI research briefing for students. Hugging Face and Hacker News
        tell us which papers are drawing attention. The research goes back to the paper, and the
        explanation is written for someone who hasn’t read it.
      </p>
      <div className="architecture">
        {[
          ['01', 'Collect', 'Approved attention signals'],
          ['02', 'Choose', 'An Editor with a hard budget'],
          ['03', 'Research', 'Primary sources and tools'],
          ['04', 'Verify', 'Code checks every quote'],
          ['05', 'Explain', 'Plain English, with a quick check'],
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
