import { config } from '../config';
import { RunBudget } from '../budget';
import { one, all, insert, now } from '../db/client';
import { explanationSchema, type Audience } from '../schemas';
import { runAgent } from './loop';
import { prompt, assertNoNewNumbers } from './prompt';
export function verifiedInput(cardId: string) {
  const card = one(
    'SELECT tldr,hypothesis,method,findings,limitations,possible_applications,whats_new,watch_next,could_not_verify_json FROM cards WHERE id=?',
    cardId,
  );
  return {
    card,
    claims: all(
      'SELECT text,quote,claim_type,provenance,confirmation FROM claims WHERE card_id=? AND verified=1',
      cardId,
    ),
  };
}
export async function explainCard(
  cardId: string,
  audience: Audience,
  runId: string,
  budget: RunBudget,
) {
  const input = verifiedInput(cardId);
  if (!input.claims.length) return;
  await runAgent({
    agent: 'explain',
    fast: true,
    system: prompt('explain', { audience }),
    initialUserMessage: JSON.stringify(input),
    runId,
    cardId,
    budget,
    maxToolCalls: 2,
    maxTokens: 12000,
    timeoutMs: config.RESEARCH_TIMEOUT_MS,
    tools: [
      {
        name: 'submit_explanation',
        description: 'Return audience explanation grounded only in the provided card',
        schema: explanationSchema,
        terminal: true,
        handler: (raw) => {
          const e = explanationSchema.parse(raw);
          assertNoNewNumbers(JSON.stringify(e), input);
          insert('explanations', {
            card_id: cardId,
            audience,
            body: e.body,
            glossary_json: JSON.stringify(e.glossary),
            discussion_questions_json: JSON.stringify(e.discussion_questions),
            activity: e.activity,
            model: config.CODEX_MODEL_FAST,
            created_at: now(),
          });
          return { ok: true };
        },
      },
    ],
  });
}
