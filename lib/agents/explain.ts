import { config } from '../config';
import { RunBudget } from '../budget';
import { one, all, insert, now } from '../db/client';
import { explanationSchema, type Explanation } from '../schemas';
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
// Reader-facing text only: quiz answer indexes are positions, not facts.
export const explanationText = (e: Explanation) =>
  JSON.stringify({ ...e, quiz: e.quiz.map(({ answer_index: _, ...q }) => q) });
export async function explainCard(cardId: string, runId: string, budget: RunBudget) {
  const input = verifiedInput(cardId);
  if (!input.claims.length) return;
  // The abstract helps the explainer teach the idea; numbers may only come from verified input.
  const paper = one(
    'SELECT p.title,p.abstract FROM papers p JOIN cards c ON c.arxiv_id=p.arxiv_id WHERE c.id=?',
    cardId,
  );
  await runAgent({
    agent: 'explain',
    fast: true,
    system: prompt('explain', { audience: 'student' }),
    initialUserMessage: JSON.stringify({ paper, verified: input }),
    runId,
    cardId,
    budget,
    maxToolCalls: 2,
    maxTokens: config.MAX_TOKENS_PER_PAPER,
    timeoutMs: config.RESEARCH_TIMEOUT_MS,
    tools: [
      {
        name: 'submit_explanation',
        description: 'Return the student explanation grounded only in the provided card',
        schema: explanationSchema,
        terminal: true,
        handler: (raw) => {
          const e = explanationSchema.parse(raw);
          assertNoNewNumbers(explanationText(e), input);
          insert('explanations', {
            card_id: cardId,
            audience: 'student',
            body: [e.problem, e.core_idea, e.results].join('\n\n'),
            glossary_json: JSON.stringify(e.glossary),
            discussion_questions_json: '[]',
            activity: '',
            extras_json: JSON.stringify({
              one_liner: e.one_liner,
              problem: e.problem,
              core_idea: e.core_idea,
              how_it_works: e.how_it_works,
              results: e.results,
              learn_first: e.learn_first,
              analogy: e.analogy,
              why_it_matters: e.why_it_matters,
              key_takeaways: e.key_takeaways,
              quiz: e.quiz,
              difficulty: e.difficulty,
            }),
            model: config.CODEX_MODEL_FAST,
            created_at: now(),
          });
          return { ok: true };
        },
      },
    ],
  });
}
