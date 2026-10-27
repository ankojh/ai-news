import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { parseHF } from '../lib/sources/hf';
import { parseArxiv } from '../lib/sources/arxiv';
import { savePaper } from '../lib/run';
import { persistCard } from '../lib/agents/research';
import { db, insert, one, now } from '../lib/db/client';
import { trace } from '../lib/agents/loop';
import type { CardSubmission, Paper } from '../lib/schemas';

function main() {
  if (one("SELECT 1 FROM runs WHERE trigger='fixture-preview'")) {
    console.log('Fixture preview already loaded. No data changed.');
    return;
  }
  const candidates = parseHF(JSON.parse(readFileSync('fixtures/hf_daily.json', 'utf8'))).slice(
    0,
    5,
  );
  const metadata = parseArxiv(readFileSync('fixtures/arxiv_atom.xml', 'utf8'));
  const provenance = JSON.parse(readFileSync('fixtures/provenance.json', 'utf8'));
  const runId = randomUUID(),
    date = now().slice(0, 10),
    cardIds: string[] = [];
  db().transaction(() => {
    insert('runs', {
      id: runId,
      trigger: 'fixture-preview',
      edition_date: date,
      started_at: now(),
      finished_at: now(),
      status: 'success',
      phase_log: JSON.stringify([
        {
          phase: 'Offline fixture preview',
          status: 'done',
          at: now(),
          detail:
            'Deterministic excerpts from real source fixtures. No agent research or generated explanations.',
        },
      ]),
      budget_json: JSON.stringify({ demo: true, sourceCapturedAt: provenance.capturedAt }),
      candidates_count: candidates.length,
      selected_count: candidates.length,
      cards_created: candidates.length,
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: null,
    });
    candidates.forEach((c, index) => {
      const paper: Paper = metadata.find((p) => p.arxivId === c.arxivId) || {
        arxivId: c.arxivId,
        version: c.version,
        title: c.title,
        abstract: c.abstract,
        authors: c.authors,
        published: c.published || '',
        updated: c.published || '',
        categories: [],
      };
      savePaper(paper);
      for (const signal of c.signals)
        insert('signals', {
          arxiv_id: c.arxivId,
          run_id: runId,
          source: signal.source,
          url: signal.url,
          score: signal.score,
          num_comments: signal.comments,
          observed_at: provenance.capturedAt,
        });
      const words = paper.abstract.split(/\s+/);
      let count = Math.min(24, words.length);
      while (words.slice(0, count).join(' ').length > 175 && count > 6) count--;
      const quote = words.slice(0, count).join(' ');
      const selection = {
        arxivId: c.arxivId,
        reason:
          'Fixture preview: a captured Hugging Face paper, displayed in source order. Not an Editor-agent decision.',
        priority: index + 1,
        expectedClaimBoldness: 'low' as const,
      };
      insert('selections', {
        run_id: runId,
        arxiv_id: c.arxivId,
        selected: 1,
        priority: index + 1,
        reason: selection.reason,
        buzz_score: 0,
      });
      const card: CardSubmission = {
        tldr: `The authors write: “${quote}”`,
        hypothesis: 'Not researched in this offline preview.',
        method:
          'Read the linked abstract and source excerpt below. No agent interpretation has been generated.',
        findings: 'Only the exact source excerpt below has been checked by code.',
        limitations: 'This is an offline interface preview, not a completed research card.',
        possible_applications: 'No application claims evaluated in this preview.',
        whats_new: 'Not evaluated in this preview.',
        watch_next: 'A live Research-agent run could inspect methods, results, and limitations.',
        topics: ['AI research'],
        claims: [
          {
            text: `The authors write: “${quote}”`,
            claim_type: 'other',
            quote,
            quote_source: 'abstract',
          },
        ],
        discussion: [],
        could_not_verify: [
          'No live agent research has been performed.',
          'Full text, baselines, and results have not been evaluated.',
          'No independent evaluation has been sought.',
        ],
      };
      const cardId = randomUUID();
      persistCard(
        card,
        paper,
        selection,
        runId,
        cardId,
        { abstract: paper.abstract, sections: [], comments: [] },
        null,
        'fixture-excerpt (no model)',
      );
      cardIds.push(cardId);
      trace(
        runId,
        cardId,
        'system',
        'tool_call',
        'fixture_preview',
        { arxivId: c.arxivId },
        'Loaded an exact abstract excerpt from a real captured fixture. This is not an agent trace.',
      );
      trace(
        runId,
        cardId,
        'system',
        'tool_call',
        'verify_quote',
        { source: 'abstract', quote },
        'Exact source excerpt passed the production quote verifier.',
      );
      for (const audience of ['student', 'educator', 'professional']) {
        const context =
          audience === 'student'
            ? 'Read the authors’ words first. This preview has not yet turned the paper into a student explanation.'
            : audience === 'educator'
              ? 'Use this source excerpt as a reading exercise. This preview is not a generated teaching guide.'
              : 'This is a captured primary-source excerpt. No technical evaluation or practitioner implications have been inferred.';
        insert('explanations', {
          card_id: cardId,
          audience,
          body: `${context}\n\nThe authors write: “${quote}”`,
          glossary_json: '[]',
          discussion_questions_json:
            audience === 'educator'
              ? JSON.stringify([
                  'What does this excerpt establish?',
                  'What evidence would you need to evaluate the complete paper?',
                  'How is a verified quote different from an independently confirmed result?',
                ])
              : '[]',
          activity:
            audience === 'educator'
              ? 'Open the abstract and identify a claim that needs evidence from the results section.'
              : '',
          model: 'fixture-preview (no model)',
          created_at: now(),
        });
      }
    });
    insert('briefings', {
      id: randomUUID(),
      run_id: runId,
      date,
      audience: 'professional',
      title: 'A first look at the reading desk',
      script:
        'This is an offline fixture preview of The Newsren. The papers below come from real captured Hugging Face and arXiv responses. Each sample card contains a short excerpt checked against its stored abstract. No Editor or Research agent has run, and no independent evaluation has been performed. Configure the local environment and start a live run to generate a researched daily briefing. Claims are checked against the papers’ own text; links are in the app.',
      markdown: 'Offline fixture preview. Open the linked cards to inspect source excerpts.',
      card_ids_json: JSON.stringify(cardIds),
      created_at: now(),
    });
  })();
  console.log(
    `Loaded ${cardIds.length} clearly labeled fixture-preview cards. No API calls, no LLM tokens, no invented research findings.`,
  );
}
main();
