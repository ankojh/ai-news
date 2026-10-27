import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll } from 'vitest';
import { all, db, execute, insert, now, setSettings, one } from '../lib/db/client';
import { feed, paperDetail, getBriefing, metrics } from '../lib/db/queries';
import { persistCard } from '../lib/agents/research';
import { savePaper, covered } from '../lib/run';
import type { Paper, CardSubmission } from '../lib/schemas';
const runId = randomUUID(),
  paper: Paper = {
    arxivId: '2610.12345',
    version: 'v2',
    title: 'An evidence-checking experiment',
    abstract: 'Our method reduces memory use by twenty percent on the example benchmark.',
    authors: ['A. Researcher'],
    published: '2026-10-25T00:00:00Z',
    updated: '2026-10-26T00:00:00Z',
    categories: ['cs.AI'],
  };
const submission: CardSubmission = {
  tldr: 'The authors report lower memory usage.',
  hypothesis: 'Lower memory usage is possible.',
  method: 'A benchmark.',
  findings: 'The authors report lower memory usage.',
  limitations: 'Not independently confirmed.',
  possible_applications: 'Not evaluated.',
  whats_new: 'A reported memory reduction.',
  watch_next: 'Independent replication.',
  topics: ['AI'],
  claims: [
    {
      text: 'The authors report a memory reduction.',
      claim_type: 'efficiency',
      quote: paper.abstract,
      quote_source: 'abstract',
    },
    {
      text: 'Unsupported result.',
      claim_type: 'beats_sota',
      quote: 'This entirely fabricated claim cannot be found anywhere in the source.',
      quote_source: 'abstract',
    },
  ],
  discussion: [
    {
      stance: 'concern',
      summary: 'Unverified comment',
      quote: 'This comment cannot be located in the stored source material.',
      comment_id: 'x',
    },
  ],
  could_not_verify: ['Independent replication has not been checked.'],
};
let cardId: string;
beforeAll(() => {
  db();
  insert('runs', {
    id: runId,
    trigger: 'test',
    started_at: now(),
    status: 'success',
    budget_json: '{}',
  });
  savePaper(paper);
  insert('selections', {
    run_id: runId,
    arxiv_id: paper.arxivId,
    selected: 1,
    priority: 1,
    reason: 'Test',
    buzz_score: 1,
  });
  cardId = persistCard(
    submission,
    paper,
    { arxivId: paper.arxivId, reason: 'Test', priority: 1, expectedClaimBoldness: 'low' },
    runId,
    randomUUID(),
    { abstract: paper.abstract, sections: [], comments: [] },
    false,
  );
});
describe('defense in depth and reader visibility', () => {
  it('re-verifies and drops unsupported claims and discussion', () => {
    expect(all('SELECT * FROM claims WHERE card_id=?', cardId)).toHaveLength(1);
    expect(
      JSON.parse(
        String(one('SELECT discussion_json FROM cards WHERE id=?', cardId)?.discussion_json),
      ),
    ).toEqual([]);
    expect(
      all("SELECT * FROM agent_steps WHERE card_id=? AND kind='post_verify_drop'", cardId),
    ).toHaveLength(2);
  });
  it('adds missing HTML disclosure', () =>
    expect(
      String(
        one('SELECT could_not_verify_json FROM cards WHERE id=?', cardId)?.could_not_verify_json,
      ),
    ).toMatch(/Full text not available/));
  it('never returns a claim with verified=0', () => {
    insert('claims', {
      id: randomUUID(),
      card_id: cardId,
      text: 'Malicious unverified DB row',
      claim_type: 'other',
      is_bold: 0,
      quote: 'Invalid',
      quote_source: 'abstract',
      verified: 0,
    });
    expect(paperDetail(paper.arxivId)?.claims.every((c) => c.verified === 1)).toBe(true);
  });
  it('personal mode shows labeled drafts', () => {
    setSettings({ review_mode: 'personal' });
    expect(feed()).toHaveLength(1);
    expect(feed()[0].status).toBe('draft');
  });
  it('required mode hides drafts from both feed and detail', () => {
    setSettings({ review_mode: 'required' });
    expect(feed()).toHaveLength(0);
    expect(paperDetail(paper.arxivId)).toBeNull();
  });
  it('approval makes the card visible in required mode', () => {
    execute("UPDATE cards SET status='approved' WHERE id=?", cardId);
    expect(feed()).toHaveLength(1);
  });
  it('hidden cards never appear, even in personal mode', () => {
    execute("UPDATE cards SET status='hidden' WHERE id=?", cardId);
    setSettings({ review_mode: 'personal' });
    expect(feed()).toHaveLength(0);
    expect(paperDetail(paper.arxivId)).toBeNull();
    execute("UPDATE cards SET status='approved' WHERE id=?", cardId);
  });
  it('does not return a briefing after a linked card is hidden', () => {
    const briefingId = randomUUID();
    insert('briefings', {
      id: briefingId,
      run_id: runId,
      date: '2026-10-27',
      audience: 'professional',
      script: 'Test',
      markdown: 'Test',
      card_ids_json: JSON.stringify([cardId]),
      created_at: now(),
    });
    expect(getBriefing()).not.toBeNull();
    execute("UPDATE cards SET status='hidden' WHERE id=?", cardId);
    expect(getBriefing()).toBeNull();
    execute("UPDATE cards SET status='approved' WHERE id=?", cardId);
  });
  it('only reuses cards for the same version', () => {
    expect(covered(paper.arxivId, 'v2')).toBe(true);
    expect(covered(paper.arxivId, 'v3')).toBe(false);
  });
  it('keeps zero-claim cards with the low evidence flag', () => {
    const id = persistCard(
      { ...submission, claims: [submission.claims[1]], discussion: [] },
      paper,
      { arxivId: paper.arxivId, reason: 'Test', priority: 1, expectedClaimBoldness: 'low' },
      runId,
      randomUUID(),
      { abstract: paper.abstract, sections: [], comments: [] },
      null,
    );
    expect(one('SELECT low_evidence FROM cards WHERE id=?', id)?.low_evidence).toBe(1);
    expect(all('SELECT * FROM claims WHERE card_id=?', id)).toHaveLength(0);
  });
  it('reports actual verification counters and no invented human judgments', () => {
    const m = metrics();
    expect(m.verifiedClaims).toBe(1);
    expect(m.proposedClaims).toBe(3);
    expect(m.spotCheckSupportedRate).toBeNull();
  });
});
