import { randomUUID } from 'node:crypto';
import { beforeAll, describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, PUT } from '../app/api/[...path]/route';
import { insert, now, one } from '../lib/db/client';
import { savePaper } from '../lib/run';
const cardId = randomUUID(),
  claimId = randomUUID();
beforeAll(() => {
  const runId = randomUUID();
  insert('runs', {
    id: runId,
    trigger: 'test',
    started_at: now(),
    status: 'success',
    budget_json: '{}',
  });
  savePaper({
    arxivId: '2610.98765',
    version: 'v1',
    title: 'Test paper',
    authors: ['Author'],
    abstract: 'This is a controlled test of a source-grounded application.',
    published: now(),
    updated: now(),
    categories: [],
  });
  insert('cards', {
    id: cardId,
    arxiv_id: '2610.98765',
    paper_version: 'v1',
    run_id: runId,
    status: 'draft',
    created_at: now(),
  });
  insert('claims', {
    id: claimId,
    card_id: cardId,
    text: 'A test claim',
    claim_type: 'other',
    is_bold: 0,
    quote: 'This is a controlled test of a source-grounded application.',
    quote_source: 'abstract',
    verified: 1,
  });
});
function req(url: string, body?: unknown, admin = false, method = 'POST') {
  return new NextRequest(`http://localhost:3107/api/${url}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(admin ? { Authorization: 'Bearer test-only-admin' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
describe('API validation, access, and editorial actions', () => {
  it('returns a consistent error for invalid feed query values', async () => {
    const r = await GET(req('feed?sort=malicious', undefined, false, 'GET'));
    expect(r.status).toBe(400);
    expect(await r.json()).toHaveProperty('error');
  });
  it('requires admin access for settings writes', async () => {
    const r = await PUT(
      req(
        'settings',
        {
          topics: ['Agents'],
          review_mode: 'personal',
          briefing_audience: 'professional',
          max_papers_per_run: 3,
        },
        false,
        'PUT',
      ),
    );
    expect(r.status).toBe(401);
  });
  it('validates settings before saving', async () => {
    const r = await PUT(req('settings', { topics: [], review_mode: 'unknown' }, true, 'PUT'));
    expect(r.status).toBe(400);
  });
  it('rejects cross-origin writes even with admin authorization', async () => {
    const r = req('settings', { topics: ['Agents'] }, true, 'PUT');
    r.headers.set('Origin', 'https://evil.example');
    expect((await PUT(r)).status).toBe(403);
  });
  it('rejects feedback for a missing target', async () =>
    expect(
      (await POST(req('feedback', { targetType: 'claim', targetId: 'missing', value: 'wrong' })))
        .status,
    ).toBe(404));
  it('increments the correction counter for a real claim', async () => {
    expect(
      (await POST(req('feedback', { targetType: 'claim', targetId: claimId, value: 'wrong' })))
        .status,
    ).toBe(200);
    expect(
      one('SELECT flagged_wrong_count FROM claims WHERE id=?', claimId)?.flagged_wrong_count,
    ).toBe(1);
  });
  it('does not treat card dislike as a claim correction', async () =>
    expect(
      (await POST(req('feedback', { targetType: 'card', targetId: cardId, value: 'wrong' })))
        .status,
    ).toBe(400));
  it('approves a card and records measured review time', async () => {
    expect(
      (await POST(req(`review/${cardId}`, { action: 'approve', durationMs: 12000 }, true))).status,
    ).toBe(200);
    expect(one('SELECT status FROM cards WHERE id=?', cardId)?.status).toBe('approved');
    expect(one('SELECT duration_ms FROM review_events WHERE card_id=?', cardId)?.duration_ms).toBe(
      12000,
    );
  });
  it('creates a random spot-check batch and accepts a human verdict', async () => {
    const start = await POST(req('spot-checks', { action: 'start', size: 20 }, true));
    expect(start.status).toBe(200);
    const body = await start.json();
    expect(body.size).toBe(1);
    const check = one('SELECT id FROM spot_checks WHERE batch_id=?', body.batchId)!;
    expect(
      (
        await POST(
          req('spot-checks', { action: 'decide', id: check.id, verdict: 'supported' }, true),
        )
      ).status,
    ).toBe(200);
    expect(
      (await POST(req('spot-checks', { action: 'decide', id: check.id, verdict: 'unclear' }, true)))
        .status,
    ).toBe(404);
  });
  it('rejects audio path traversal', async () =>
    expect((await GET(req('audio/..%2Fsecret.mp3', undefined, false, 'GET'))).status).toBe(400));
  it('never exposes the admin token or provider credentials in settings', async () => {
    const r = await GET(req('settings', undefined, false, 'GET'));
    const text = await r.text();
    expect(text).not.toContain('test-only-admin');
    expect(text).not.toContain('ELEVENLABS_API_KEY');
  });
});
