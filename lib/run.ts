import { randomUUID } from 'node:crypto';
import { config } from './config';
import { codexStatus } from './agents/codex';
import { RunBudget } from './budget';
import { db, one, execute, insert, now, settings } from './db/client';
import { getHF } from './sources/hf';
import { getHN } from './sources/hn';
import { getMetadata } from './sources/arxiv';
import { mergeCandidates } from './sources/merge';
import { publicationStatus } from './labels';
import { selectPapers } from './agents/editor';
import { researchPaper } from './agents/research';
import { explainCard } from './agents/explain';
import { writeBriefing } from './agents/briefing';
import { trace } from './agents/loop';
import type { Candidate, Paper } from './schemas';
export class RunConflict extends Error {}
export type RunOptions = {
  limit?: number;
  date?: string;
  noAudio?: boolean;
  dryRun?: boolean;
  trigger?: string;
};
export function covered(id: string, version: string) {
  return !!one(
    "SELECT id FROM cards WHERE arxiv_id=? AND paper_version=? AND status IN ('draft','approved','hidden') LIMIT 1",
    id,
    version,
  );
}
export function savePaper(p: Paper, html: number | null = null) {
  const current = one(
    'SELECT first_seen_at,version,html_available FROM papers WHERE arxiv_id=?',
    p.arxivId,
  );
  execute(
    `INSERT INTO papers (arxiv_id,version,title,authors_json,abstract,published_at,updated_at,categories_json,arxiv_comment,journal_ref,doi,pub_status,html_available,first_seen_at,last_fetched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(arxiv_id) DO UPDATE SET version=excluded.version,title=excluded.title,authors_json=excluded.authors_json,abstract=excluded.abstract,published_at=excluded.published_at,updated_at=excluded.updated_at,categories_json=excluded.categories_json,arxiv_comment=excluded.arxiv_comment,journal_ref=excluded.journal_ref,doi=excluded.doi,pub_status=excluded.pub_status,html_available=excluded.html_available,last_fetched_at=excluded.last_fetched_at`,
    p.arxivId,
    p.version,
    p.title,
    JSON.stringify(p.authors),
    p.abstract,
    p.published,
    p.updated,
    JSON.stringify(p.categories),
    p.arxiv_comment || null,
    p.journal_ref || null,
    p.doi || null,
    publicationStatus(p.journal_ref, p.arxiv_comment),
    html ?? (current?.version === p.version ? current.html_available : null) ?? null,
    current?.first_seen_at || now(),
    now(),
  );
}
export function createRun(options: RunOptions) {
  const auth = codexStatus();
  if (!auth.ready) throw new Error(auth.message);
  const id = randomUUID();
  db()
    .transaction(() => {
      const lock = one(
        'SELECT l.run_id,r.started_at FROM run_lock l JOIN runs r ON r.id=l.run_id WHERE l.id=1',
      );
      if (lock && Date.now() - Date.parse(String(lock.started_at)) < config.RUN_TIMEOUT_MS + 60000)
        throw new RunConflict('A run is already in progress');
      if (lock) {
        execute(
          "UPDATE runs SET status='failed',finished_at=?,error='Previous process stopped or exceeded its timeout' WHERE id=?",
          now(),
          lock.run_id,
        );
        execute('DELETE FROM run_lock WHERE id=1');
      }
      insert('runs', {
        id,
        trigger: options.trigger || 'cli',
        started_at: now(),
        edition_date:
          options.date ||
          new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }),
        status: 'running',
        budget_json: JSON.stringify({
          ...options,
          capUsd: config.MAX_COST_USD_PER_RUN,
          provider: 'codex',
          billing: 'subscription',
          maxTokens: config.MAX_TOKENS_PER_RUN,
          models: { agent: config.CODEX_MODEL_AGENT, fast: config.CODEX_MODEL_FAST },
          ttsPricePer1kChars: config.PRICE_TTS_PER_1K_CHARS,
        }),
        cost_usd: 0,
      });
      insert('run_lock', { id: 1, run_id: id });
    })
    .immediate();
  return id;
}
export async function executeRun(runId: string, options: RunOptions) {
  const budget = new RunBudget(),
    signal = AbortSignal.timeout(budget.remainingMs()),
    s = settings(),
    date =
      options.date || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }),
    limit = Math.min(options.limit || s.max_papers_per_run, config.MAX_PAPERS_PER_RUN);
  const phases: { phase: string; status: string; at: string; detail?: string }[] = [];
  let partial = false,
    created = 0;
  const phase = (name: string, status: string, detail?: string) => {
    phases.push({ phase: name, status, at: now(), detail });
    execute(
      'UPDATE runs SET phase_log=?,tokens_in=?,tokens_out=?,cost_usd=?,tts_chars=? WHERE id=?',
      JSON.stringify(phases),
      budget.tokensIn,
      budget.tokensOut,
      budget.cost,
      budget.ttsChars,
      runId,
    );
  };
  try {
    phase('A · Collect', 'running');
    const sources = await Promise.allSettled([
      getHF(date, signal),
      getHN(date, config.HN_LOOKBACK_HOURS, signal),
    ]);
    const raw: Candidate[] = [];
    for (let i = 0; i < sources.length; i++) {
      const result = sources[i];
      if (result.status === 'fulfilled') raw.push(...result.value);
      else {
        partial = true;
        trace(
          runId,
          undefined,
          'system',
          'error',
          i ? 'hn' : 'hf',
          {},
          String(result.reason),
          false,
        );
      }
    }
    if (
      raw.filter((c) => c.signals.some((s) => s.source === 'hf')).length < config.HF_MIN_CANDIDATES
    ) {
      const previous = new Date(`${date}T12:00:00Z`);
      previous.setUTCDate(previous.getUTCDate() - 1);
      try {
        raw.push(...(await getHF(previous.toISOString().slice(0, 10), signal)));
      } catch (error) {
        trace(runId, undefined, 'system', 'error', 'hf_previous', {}, String(error), false);
      }
    }
    const candidates = mergeCandidates(raw).slice(0, config.MAX_CANDIDATES);
    if (!candidates.length) throw new Error('No candidates returned by the approved sources');
    let metadata: Paper[] = [];
    try {
      metadata = await getMetadata(
        candidates.map((c) => c.arxivId),
        signal,
      );
    } catch (error) {
      partial = true;
      trace(runId, undefined, 'system', 'error', 'arxiv_metadata', {}, String(error), false);
    }
    const papers = new Map<string, Paper>();
    for (const c of candidates) {
      budget.check();
      const p = metadata.find((p) => p.arxivId === c.arxivId) || {
        arxivId: c.arxivId,
        version: c.version,
        title: c.title,
        abstract: c.abstract,
        authors: c.authors,
        published: c.published || '',
        updated: c.published || '',
        categories: [],
      };
      if (!p.abstract) continue;
      Object.assign(c, {
        version: p.version,
        title: p.title,
        abstract: p.abstract,
        authors: p.authors,
        alreadyCovered: covered(p.arxivId, p.version),
      });
      papers.set(c.arxivId, p);
      savePaper(p);
      for (const signal of c.signals)
        insert('signals', {
          arxiv_id: c.arxivId,
          run_id: runId,
          source: signal.source,
          external_id: signal.objectID,
          url: signal.url,
          score: signal.score,
          num_comments: signal.comments,
          observed_at: now(),
        });
    }
    const eligible = candidates.filter((c) => papers.has(c.arxivId));
    execute('UPDATE runs SET candidates_count=? WHERE id=?', eligible.length, runId);
    phase('A · Collect', 'done', `${eligible.length} candidates`);
    phase('B · Select', 'running');
    const picks = await selectPapers(eligible, limit, s.topics, runId, budget);
    for (const candidate of eligible) {
      const pick = picks.find((p) => p.arxivId === candidate.arxivId);
      insert('selections', {
        run_id: runId,
        arxiv_id: candidate.arxivId,
        selected: pick ? 1 : 0,
        priority: pick?.priority,
        reason: pick?.reason,
        expected_boldness: pick?.expectedClaimBoldness,
        buzz_score: candidate.buzzScore,
      });
    }
    execute('UPDATE runs SET selected_count=? WHERE id=?', picks.length, runId);
    phase('B · Select', 'done', `${picks.length} editorial picks`);
    if (!options.dryRun) {
      phase('C · Research', 'running');
      const fresh: string[] = [];
      let cursor = 0;
      const worker = async () => {
        while (cursor < picks.length) {
          const pick = picks[cursor++],
            candidate = eligible.find((c) => c.arxivId === pick.arxivId)!;
          if (candidate.alreadyCovered) {
            trace(
              runId,
              undefined,
              'system',
              'tool_call',
              'reuse_card',
              { arxivId: pick.arxivId },
              'Reused existing card for the same version',
            );
            continue;
          }
          try {
            budget.check();
            const card = await researchPaper(
              candidate,
              papers.get(pick.arxivId)!,
              pick,
              runId,
              budget,
            );
            if (card) {
              created++;
              fresh.push(card);
            } else partial = true;
          } catch (error) {
            partial = true;
            trace(runId, undefined, 'system', 'error', 'research', {}, String(error), false);
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(config.RESEARCH_CONCURRENCY, picks.length) }, worker),
      );
      execute('UPDATE runs SET cards_created=? WHERE id=?', created, runId);
      phase('C · Research', 'done', `${created} new cards`);
      phase('D · Explain', 'running');
      for (const card of fresh)
        try {
          budget.check();
          await explainCard(card, runId, budget);
        } catch (error) {
          partial = true;
          trace(runId, card, 'explain', 'error', undefined, {}, String(error), false);
        }
      phase('D · Explain', 'done');
      phase('E · Brief', 'running');
      try {
        await writeBriefing(runId, date, budget, !!options.noAudio);
      } catch (error) {
        partial = true;
        trace(runId, undefined, 'briefing', 'error', undefined, {}, String(error), false);
      }
      phase('E · Brief', 'done');
    }
    phase('F · Finalize', 'done');
    execute(
      'UPDATE runs SET status=?,finished_at=?,cards_created=? WHERE id=?',
      partial ? 'partial' : 'success',
      now(),
      created,
      runId,
    );
  } catch (error) {
    phase('F · Finalize', 'error', String(error));
    execute(
      'UPDATE runs SET status=?,finished_at=?,error=? WHERE id=?',
      created ? 'partial' : 'failed',
      now(),
      error instanceof Error ? error.message : String(error),
      runId,
    );
  } finally {
    execute(
      'UPDATE runs SET tokens_in=?,tokens_out=?,cost_usd=?,tts_chars=? WHERE id=?',
      budget.tokensIn,
      budget.tokensOut,
      budget.cost,
      budget.ttsChars,
      runId,
    );
    execute('DELETE FROM run_lock WHERE run_id=?', runId);
  }
}
