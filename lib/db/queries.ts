import { all, one, settings, type Row } from './client';
export function json<T>(value: unknown, fallback: T): T {
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}
export type CardView = Row & {
  paper: Row & { authors: string[]; categories: string[] };
  topics: string[];
  discussion: Row[];
  could_not_verify: string[];
  claims: Row[];
  explanations: (Row & { glossary: Row[]; discussion_questions: string[] })[];
  signals: Row[];
  trace: Row[];
};
export function cardView(card: Row): CardView {
  const paper = one('SELECT * FROM papers WHERE arxiv_id=?', card.arxiv_id)!;
  return {
    ...card,
    paper: {
      ...paper,
      authors: json<string[]>(paper.authors_json, []),
      categories: json<string[]>(paper.categories_json, []),
    },
    topics: json<string[]>(card.topics_json, []),
    discussion: json<Row[]>(card.discussion_json, []),
    could_not_verify: json<string[]>(card.could_not_verify_json, []),
    claims: all('SELECT * FROM claims WHERE card_id=? AND verified=1', card.id),
    explanations: all('SELECT * FROM explanations WHERE card_id=?', card.id).map((e) => ({
      ...e,
      glossary: json<Row[]>(e.glossary_json, []),
      discussion_questions: json<string[]>(e.discussion_questions_json, []),
    })),
    signals: all(
      'SELECT * FROM signals WHERE arxiv_id=? ORDER BY observed_at DESC LIMIT 40',
      card.arxiv_id,
    ),
    trace: all('SELECT * FROM agent_steps WHERE card_id=? ORDER BY id', card.id),
  };
}
export function visible(card: Row) {
  return (
    card.status === 'approved' || (card.status === 'draft' && settings().review_mode === 'personal')
  );
}
export function feed(
  options: { date?: string; sort?: string; boldOnly?: boolean; category?: string } = {},
) {
  if (options.category && options.category !== 'technology') return [];
  const date =
    options.date ||
    String(
      one(
        "SELECT coalesce(edition_date,substr(started_at,1,10)) date FROM runs WHERE status IN ('success','partial') ORDER BY started_at DESC LIMIT 1",
      )?.date || '',
    );
  let cards = all(
    `SELECT c.* FROM cards c WHERE c.status IN ('draft','approved') AND EXISTS (SELECT 1 FROM selections s JOIN runs r ON r.id=s.run_id WHERE s.arxiv_id=c.arxiv_id AND s.selected=1 AND coalesce(r.edition_date,substr(r.started_at,1,10))=?) ORDER BY c.created_at DESC`,
    date,
  ).filter(visible);
  const seen = new Set<string>();
  cards = cards.filter((c) => {
    const id = String(c.arxiv_id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const views = cards
    .map(cardView)
    .filter((c) => !options.boldOnly || c.claims.some((x) => x.is_bold === 1));
  const priority = (id: unknown) =>
    Number(
      one(
        'SELECT priority FROM selections WHERE arxiv_id=? AND selected=1 ORDER BY rowid DESC LIMIT 1',
        id,
      )?.priority || 999,
    );
  return views.sort((a, b) =>
    options.sort === 'newest'
      ? String(b.paper.published_at).localeCompare(String(a.paper.published_at))
      : options.sort === 'discussed'
        ? Math.max(0, ...b.signals.map((s) => Number(s.num_comments))) -
          Math.max(0, ...a.signals.map((s) => Number(s.num_comments)))
        : priority(a.arxiv_id) - priority(b.arxiv_id),
  );
}
export function paperDetail(id: string, includeDraft = false) {
  const rows = all(
    "SELECT * FROM cards WHERE arxiv_id=? AND status NOT IN ('hidden','failed') ORDER BY created_at DESC",
    id,
  );
  const card = rows.find((c) => includeDraft || visible(c));
  return card ? cardView(card) : null;
}
export function runDetail(
  id: string,
): (Row & { phases: Row[]; selections: Row[]; trace: Row[]; cards: Row[] }) | null {
  const run = one('SELECT * FROM runs WHERE id=?', id);
  return run
    ? {
        ...run,
        phases: json<Row[]>(run.phase_log, []),
        selections: all(
          'SELECT s.*,p.title FROM selections s LEFT JOIN papers p ON p.arxiv_id=s.arxiv_id WHERE s.run_id=? ORDER BY selected DESC,priority,buzz_score DESC',
          id,
        ),
        trace: all('SELECT * FROM agent_steps WHERE run_id=? ORDER BY id', id),
        cards: all('SELECT id,arxiv_id,status,failure_reason FROM cards WHERE run_id=?', id),
      }
    : null;
}
export function getBriefing(date = 'latest') {
  const b =
    date === 'latest'
      ? one('SELECT * FROM briefings ORDER BY date DESC LIMIT 1')
      : one('SELECT * FROM briefings WHERE date=?', date);
  if (!b) return null;
  const ids = json<string[]>(b.card_ids_json, []);
  const cards = ids.map((id) => one('SELECT * FROM cards WHERE id=?', id));
  // A previously generated briefing must disappear if its cards are later hidden or require review.
  if (cards.some((c) => !c || !visible(c))) return null;
  return {
    ...b,
    cardIds: ids,
    cards: cards
      .filter((c): c is Row => !!c)
      .map((c) => ({
        id: c.id,
        arxivId: c.arxiv_id,
        title: one('SELECT title FROM papers WHERE arxiv_id=?', c.arxiv_id)?.title,
        status: c.status,
      })),
    audio_url: b.audio_path ? `/api/audio/${encodeURIComponent(String(b.audio_path))}` : null,
  };
}
const scalar = (sql: string) => Number(one(sql)?.value || 0);
export function metrics() {
  const verified = scalar('SELECT count(*) value FROM claims WHERE verified=1');
  const dropped = scalar(
    "SELECT count(*) value FROM agent_steps WHERE kind='post_verify_drop' AND tool_name='claim'",
  );
  const supported = scalar("SELECT count(*) value FROM spot_checks WHERE verdict='supported'");
  const judged = scalar('SELECT count(*) value FROM spot_checks WHERE verdict IS NOT NULL');
  const up = scalar(
    "SELECT count(*) value FROM feedback WHERE value='up' AND target_type IN ('card','briefing')",
  );
  const votes = scalar(
    "SELECT count(*) value FROM feedback WHERE value IN ('up','down') AND target_type IN ('card','briefing')",
  );
  const median = (rows: Row[]) => {
    const a = rows.map((r) => Number(r.value)).sort((a, b) => a - b);
    return a.length ? (a[Math.floor((a.length - 1) / 2)] + a[Math.floor(a.length / 2)]) / 2 : null;
  };
  return {
    verifiedClaims: verified,
    proposedClaims: verified + dropped,
    quotePassRate: verified + dropped ? verified / (verified + dropped) : null,
    spotCheckSupportedRate: judged ? supported / judged : null,
    spotChecksJudged: judged,
    flaggedWrong: scalar('SELECT coalesce(sum(flagged_wrong_count),0) value FROM claims'),
    approvalRate: votes ? up / votes : null,
    medianReviewMs: median(all('SELECT duration_ms value FROM review_events')),
    medianResearchMs: median(
      all("SELECT sum(duration_ms) value FROM agent_steps WHERE agent='research' GROUP BY card_id"),
    ),
    toolCallsPerCard: all(
      "SELECT card_id,count(*) value FROM agent_steps WHERE kind='tool_call' AND card_id IS NOT NULL GROUP BY card_id",
    ),
    perCard: all(
      "SELECT card_id,sum(tokens_in) tokens_in,sum(tokens_out) tokens_out,sum(cost_usd) cost_usd FROM agent_steps WHERE card_id IS NOT NULL AND kind='model_call' GROUP BY card_id",
    ),
    briefingCosts: all(
      "SELECT run_id,sum(cost_usd) llm_cost FROM agent_steps WHERE agent='briefing' AND kind='model_call' GROUP BY run_id",
    ),
    claimTypes: all(
      'SELECT claim_type,count(*) value FROM claims WHERE verified=1 GROUP BY claim_type',
    ),
    cards: scalar("SELECT count(*) value FROM cards WHERE status NOT IN ('failed','hidden')"),
    boldCards: scalar(
      'SELECT count(DISTINCT card_id) value FROM claims WHERE verified=1 AND is_bold=1',
    ),
    boldWithHtml: scalar(
      'SELECT count(DISTINCT c.id) value FROM cards c JOIN papers p ON p.arxiv_id=c.arxiv_id JOIN claims cl ON cl.card_id=c.id WHERE cl.is_bold=1 AND cl.verified=1 AND p.html_available=1',
    ),
    communityConcerns: scalar(
      "SELECT count(*) value FROM cards WHERE discussion_json LIKE '%concern%'",
    ),
    runs: all(
      'SELECT id,trigger,started_at,status,tokens_in,tokens_out,cost_usd,cards_created,tts_chars,budget_json FROM runs ORDER BY started_at DESC',
    ),
    spotChecks: all(
      'SELECT s.*,c.text,c.quote,c.quote_source,c.quote_location,ca.arxiv_id,ca.paper_version FROM spot_checks s JOIN claims c ON c.id=s.claim_id JOIN cards ca ON ca.id=c.card_id WHERE s.verdict IS NULL ORDER BY s.id DESC LIMIT 20',
    ),
  };
}
