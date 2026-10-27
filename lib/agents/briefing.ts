import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { config } from '../config';
import { RunBudget } from '../budget';
import { execute, all, settings, now } from '../db/client';
import { cardView, visible } from '../db/queries';
import { runAgent, trace } from './loop';
import { prompt, assertNoNewNumbers } from './prompt';
import { narrate } from '../audio/elevenlabs';
const schema = z.object({ title: z.string().max(180), script: z.string().min(1).max(6000) });
export async function writeBriefing(
  runId: string,
  date: string,
  budget: RunBudget,
  noAudio: boolean,
) {
  const s = settings();
  const selected = all(
    'SELECT arxiv_id FROM selections WHERE run_id=? AND selected=1 ORDER BY priority',
    runId,
  );
  const cards = selected
    .flatMap((p) => {
      const c = all(
        "SELECT * FROM cards WHERE arxiv_id=? AND status IN ('draft','approved') ORDER BY created_at DESC",
        p.arxiv_id,
      ).find(visible);
      return c ? [cardView(c)] : [];
    })
    .slice(0, config.BRIEFING_SIZE);
  if (!cards.length) return;
  const input = cards.map((c) => ({
    arxivId: c.arxiv_id,
    title: c.paper.title,
    claims: c.claims,
    tldr: c.tldr,
    explanation: c.explanations.find((e) => e.audience === s.briefing_audience),
    could_not_verify: c.could_not_verify,
  }));
  const output = (await runAgent({
    agent: 'briefing',
    fast: true,
    system: prompt('briefing', { date }).replace('{date}', date),
    initialUserMessage: JSON.stringify(input),
    runId,
    budget,
    maxToolCalls: 2,
    maxTokens: 16000,
    timeoutMs: config.RESEARCH_TIMEOUT_MS,
    tools: [
      {
        name: 'submit_briefing',
        description: 'Submit a 250–350 word listening script',
        schema,
        terminal: true,
        handler: (raw) => {
          const b = schema.parse(raw);
          const words = b.script.split(/\s+/).length;
          if (words < 250 || words > 350) throw new Error('Script must contain 250–350 words');
          if (
            !b.script.startsWith(`This is your AI-generated research briefing for ${date}.`) ||
            !b.script.endsWith(
              "Claims are checked against the papers' own text; links are in the app.",
            )
          )
            throw new Error('Use the required opening and closing');
          assertNoNewNumbers(b.script, { input, date });
          return b;
        },
      },
    ],
  })) as z.infer<typeof schema>;
  let audio: string | null = null;
  if (!noAudio)
    try {
      audio = await narrate(output.script, date, budget);
    } catch (e) {
      trace(runId, undefined, 'briefing', 'error', 'tts', {}, String(e), false);
    }
  const markdown =
    output.script +
    '\n\n' +
    cards.map((c) => `- [${c.paper.title}](/paper/${c.arxiv_id})`).join('\n');
  execute(
    'INSERT INTO briefings (id,run_id,date,audience,title,script,markdown,card_ids_json,audio_path,tts_chars,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(date) DO UPDATE SET run_id=excluded.run_id,audience=excluded.audience,title=excluded.title,script=excluded.script,markdown=excluded.markdown,card_ids_json=excluded.card_ids_json,audio_path=excluded.audio_path,tts_chars=excluded.tts_chars,created_at=excluded.created_at',
    randomUUID(),
    runId,
    date,
    s.briefing_audience,
    output.title,
    output.script,
    markdown,
    JSON.stringify(cards.map((c) => c.id)),
    audio,
    audio ? output.script.length : 0,
    now(),
  );
}
