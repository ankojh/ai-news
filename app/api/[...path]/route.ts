import { NextRequest, NextResponse, after } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { config } from '@/lib/config';
import { codexStatus } from '@/lib/agents/codex';
import { db, all, one, insert, execute, now, settings, setSettings } from '@/lib/db/client';
import {
  feed,
  paperDetail,
  runDetail,
  metrics,
  getBriefing,
  cardView,
  showingPreview,
} from '@/lib/db/queries';
import { createRun, executeRun, RunConflict } from '@/lib/run';
import { arxivIdSchema, audienceSchema } from '@/lib/schemas';
import { getFirstFigure } from '@/lib/sources/arxivHtml';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function admin(request: NextRequest) {
  if (process.env.NODE_ENV === 'development') return;
  const given = request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
  const expected = config.ADMIN_TOKEN;
  if (
    !expected ||
    Buffer.byteLength(given) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(given), Buffer.from(expected))
  )
    throw new HttpError(401, 'An admin token is required. Enter it in Settings.');
}
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function targetExists(type: string, id: string) {
  const table = (
    {
      card: 'cards',
      claim: 'claims',
      briefing: 'briefings',
      explanation: 'explanations',
      answer: 'qa',
    } as Record<string, string>
  )[type];
  return !!(
    table && one(`SELECT 1 FROM ${table} WHERE ${type === 'explanation' ? 'card_id' : 'id'}=?`, id)
  );
}
const sameHost = (origin: string) => {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
};
async function handler(request: NextRequest) {
  try {
    const parts = request.nextUrl.pathname
        .replace(/^\/api\//, '')
        .split('/')
        .map(decodeURIComponent),
      route = parts[0],
      method = request.method;
    if (method !== 'GET') {
      // Compare against the Host header: Next reports localhost even when served on 127.0.0.1.
      const origin = request.headers.get('origin');
      const host = request.headers.get('host') || request.nextUrl.host;
      if (origin && sameHost(origin) !== host)
        throw new HttpError(403, 'Cross-origin writes are not allowed');
      if (Number(request.headers.get('content-length') || 0) > 24000)
        throw new HttpError(413, 'Request too large');
    }
    const body = async () => {
      const text = await request.text();
      if (text.length > 24000) throw new HttpError(413, 'Request too large');
      try {
        return JSON.parse(text || '{}');
      } catch {
        throw new HttpError(400, 'Invalid JSON');
      }
    };
    const send = (value: unknown, status = 200) =>
      NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
    if (method === 'GET') {
      if (route === 'feed') {
        const q = z
          .object({
            category: z.enum(['technology']).default('technology'),
            date: z.iso.date().optional(),
            sort: z.enum(['picks', 'discussed', 'newest']).default('picks'),
            boldOnly: z.enum(['true', 'false']).optional(),
            audience: audienceSchema.optional(),
          })
          .parse(Object.fromEntries(request.nextUrl.searchParams));
        return send(feed({ ...q, boldOnly: q.boldOnly === 'true' }));
      }
      if (route === 'papers' && parts[2] === 'figure') {
        const id = arxivIdSchema.parse(parts[1]);
        if (!paperDetail(id.replace(/v\d+$/, ''))) throw new HttpError(404, 'Paper not found');
        return send(await getFirstFigure(id).catch(() => null));
      }
      if (route === 'papers' && parts[1]) {
        const id = arxivIdSchema.parse(parts[1]).replace(/v\d+$/, '');
        const card = paperDetail(id);
        if (!card) throw new HttpError(404, 'Paper not found or awaiting approval');
        return send(card);
      }
      if (route === 'briefings')
        return send(getBriefing(parts[1] === 'latest' ? 'latest' : z.iso.date().parse(parts[1])));
      if (route === 'runs')
        return send(
          parts[1]
            ? runDetail(parts[1])
            : all('SELECT * FROM runs ORDER BY started_at DESC LIMIT 100'),
        );
      if (route === 'metrics') return send(metrics());
      if (route === 'settings') return send(settings());
      if (route === 'review') {
        admin(request);
        return send(
          all("SELECT * FROM cards WHERE status='draft' ORDER BY created_at DESC").map(cardView),
        );
      }
      if (route === 'status')
        return send({
          provider: 'codex',
          billingMode: 'subscription',
          configured: codexStatus().ready,
          authMessage: codexStatus().message,
          pricesConfigured: true,
          agentModel: config.CODEX_MODEL_AGENT,
          fastModel: config.CODEX_MODEL_FAST,
          demo: showingPreview(),
          dates: all(
            "SELECT DISTINCT coalesce(edition_date,substr(started_at,1,10)) date FROM runs WHERE status IN ('success','partial') ORDER BY date DESC",
          ),
          latestBriefing: getBriefing(),
          reviewMode: settings().review_mode,
        });
      if (route === 'audio' && parts.length === 2) {
        const file = parts[1];
        if (!/^briefing-\d{4}-\d{2}-\d{2}\.mp3$/.test(file))
          throw new HttpError(400, 'Invalid audio filename');
        const briefing = all('SELECT date FROM briefings WHERE audio_path=?', file).some(
          (b) => !!getBriefing(String(b.date)),
        );
        if (!briefing) throw new HttpError(404, 'Audio unavailable');
        let audio: Buffer;
        try {
          audio = await readFile(path.resolve(config.AUDIO_DIR, file));
        } catch {
          throw new HttpError(404, 'Audio file not found');
        }
        const headers = {
          'Content-Type': 'audio/mpeg',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'private, max-age=3600',
          'X-Content-Type-Options': 'nosniff',
        };
        // Browsers (Safari in particular) request byte ranges to play and seek audio.
        const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') || '');
        if (range && (range[1] || range[2])) {
          const size = audio.length;
          const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
          const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
          if (start >= size || start > end)
            return new NextResponse(null, {
              status: 416,
              headers: { 'Content-Range': `bytes */${size}` },
            });
          return new NextResponse(new Uint8Array(audio.subarray(start, end + 1)), {
            status: 206,
            headers: {
              ...headers,
              'Content-Range': `bytes ${start}-${end}/${size}`,
              'Content-Length': String(end - start + 1),
            },
          });
        }
        return new NextResponse(new Uint8Array(audio), {
          headers: { ...headers, 'Content-Length': String(audio.length) },
        });
      }
    }
    if (method === 'POST' && route === 'runs') {
      admin(request);
      const input = z
        .object({
          limit: z.number().int().min(1).max(30).optional(),
          noAudio: z.boolean().optional(),
          dryRun: z.boolean().optional(),
        })
        .strict()
        .parse(await body());
      const id = createRun({ ...input, trigger: 'button' });
      after(() => executeRun(id, input));
      return send({ id }, 202);
    }
    if (method === 'POST' && route === 'feedback') {
      const input = z
        .object({
          targetType: z.enum(['card', 'claim', 'briefing', 'explanation', 'answer']),
          targetId: z.string().min(1).max(100),
          value: z.enum(['up', 'down', 'wrong']),
          note: z.string().max(1000).optional(),
        })
        .strict()
        .parse(await body());
      if (input.value === 'wrong' && input.targetType !== 'claim')
        throw new HttpError(400, 'Only claims can be flagged wrong');
      if (!targetExists(input.targetType, input.targetId))
        throw new HttpError(404, 'Feedback target not found');
      db().transaction(() => {
        insert('feedback', {
          target_type: input.targetType,
          target_id: input.targetId,
          value: input.value,
          note: input.note,
          created_at: now(),
        });
        if (input.value === 'wrong')
          execute(
            'UPDATE claims SET flagged_wrong_count=flagged_wrong_count+1 WHERE id=?',
            input.targetId,
          );
      })();
      return send({ ok: true });
    }
    if (method === 'POST' && route === 'review' && parts[1]) {
      admin(request);
      const input = z
        .object({
          action: z.enum(['approve', 'hide']),
          durationMs: z.number().int().min(0).max(86400000).optional(),
        })
        .strict()
        .parse(await body());
      if (!one('SELECT id FROM cards WHERE id=?', parts[1]))
        throw new HttpError(404, 'Card not found');
      db().transaction(() => {
        execute(
          'UPDATE cards SET status=?,reviewed_at=? WHERE id=?',
          input.action === 'approve' ? 'approved' : 'hidden',
          now(),
          parts[1],
        );
        if (input.durationMs != null)
          insert('review_events', {
            card_id: parts[1],
            duration_ms: input.durationMs,
            created_at: now(),
          });
      })();
      return send({ ok: true });
    }
    if (method === 'PUT' && route === 'settings') {
      admin(request);
      const input = z
        .object({
          topics: z.array(z.string().trim().min(1).max(60)).min(1).max(15),
          review_mode: z.enum(['personal', 'required']),
          max_papers_per_run: z.number().int().min(1).max(config.MAX_PAPERS_PER_RUN),
        })
        .strict()
        .parse(await body());
      return send(setSettings(input));
    }
    if (method === 'POST' && route === 'spot-checks') {
      admin(request);
      const input = z
        .discriminatedUnion('action', [
          z.object({
            action: z.literal('start'),
            size: z.number().int().min(1).max(20).default(20),
          }),
          z.object({
            action: z.literal('decide'),
            id: z.number().int().positive(),
            verdict: z.enum(['supported', 'not_supported', 'unclear']),
            note: z.string().max(1000).optional(),
          }),
        ])
        .parse(await body());
      if (input.action === 'start') {
        const batch = crypto.randomUUID();
        const claims = all(
          'SELECT id FROM claims WHERE verified=1 ORDER BY random() LIMIT ?',
          input.size,
        );
        if (!claims.length) throw new HttpError(400, 'No verified claims are available to sample');
        db().transaction(() => {
          for (const c of claims)
            insert('spot_checks', { batch_id: batch, claim_id: c.id, created_at: now() });
        })();
        return send({ batchId: batch, size: claims.length });
      }
      if (!one('SELECT id FROM spot_checks WHERE id=? AND verdict IS NULL', input.id))
        throw new HttpError(404, 'Pending spot-check not found');
      execute(
        'UPDATE spot_checks SET verdict=?,note=?,decided_at=? WHERE id=?',
        input.verdict,
        input.note || null,
        now(),
        input.id,
      );
      return send({ ok: true });
    }
    if (route === 'ask') throw new HttpError(501, 'Paper Q&A is on the roadmap.');
    throw new HttpError(404, 'Endpoint not found');
  } catch (error) {
    const status =
      error instanceof HttpError
        ? error.status
        : error instanceof z.ZodError
          ? 400
          : error instanceof RunConflict
            ? 409
            : 500;
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
            : error instanceof Error
              ? error.message
              : 'Request failed',
      },
      { status },
    );
  }
}
export { handler as GET, handler as POST, handler as PUT };
