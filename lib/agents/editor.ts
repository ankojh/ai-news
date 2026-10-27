import { z } from 'zod';
import type { Candidate, Selection } from '../schemas';
import { selectionSchema } from '../schemas';
import { RunBudget } from '../budget';
import { config } from '../config';
import { runAgent } from './loop';
import { prompt } from './prompt';
export function validateSelection(input: unknown, candidates: Candidate[], limit: number) {
  const parsed = selectionSchema.parse(input);
  const ids = new Set<string>(),
    priorities = new Set<number>();
  if (parsed.selections.length > limit) throw new Error('Too many selections');
  for (const s of parsed.selections) {
    if (
      !candidates.some((c) => c.arxivId === s.arxivId) ||
      ids.has(s.arxivId) ||
      priorities.has(s.priority) ||
      s.priority > limit
    )
      throw new Error('Unknown, duplicate, or invalid-priority selection');
    ids.add(s.arxivId);
    priorities.add(s.priority);
  }
  return parsed.selections;
}
export async function selectPapers(
  candidates: Candidate[],
  limit: number,
  topics: string[],
  runId: string,
  budget: RunBudget,
): Promise<Selection[]> {
  const result = await runAgent({
    agent: 'editor',
    system: prompt('editor', { topics, limit }),
    initialUserMessage: 'Inspect today’s candidates and submit your editorial selection.',
    runId,
    budget,
    maxToolCalls: config.MAX_TOOL_CALLS_EDITOR,
    maxTokens: config.MAX_TOKENS_PER_PAPER,
    timeoutMs: config.RESEARCH_TIMEOUT_MS,
    tools: [
      {
        name: 'list_candidates',
        description: 'List candidates by buzz score',
        schema: z.object({
          offset: z.number().int().nonnegative().default(0),
          limit: z.number().int().min(1).max(30).default(30),
        }),
        handler: (raw) => {
          const input = raw as { offset: number; limit: number };
          return candidates
            .slice(input.offset, input.offset + input.limit)
            .map(({ arxivId, title, buzzScore, signals, alreadyCovered }) => ({
              arxivId,
              title,
              buzzScore,
              signals,
              alreadyCovered,
            }));
        },
      },
      {
        name: 'get_candidate',
        description: 'Inspect abstract, authors and signals',
        schema: z.object({ arxivId: z.string() }),
        handler: (raw) => {
          const candidate = candidates.find(
            (c) => c.arxivId === (raw as { arxivId: string }).arxivId,
          );
          if (!candidate) throw new Error('Unknown candidate');
          return candidate;
        },
      },
      {
        name: 'submit_selection',
        description: 'Submit final selections and reasons',
        schema: selectionSchema,
        terminal: true,
        handler: (raw) => validateSelection(raw, candidates, limit),
      },
    ],
  });
  return result as Selection[];
}
