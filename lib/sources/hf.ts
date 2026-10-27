import { z } from 'zod';
import { extractArxivId } from './merge';
import type { Candidate } from '../schemas';
import { sourceText } from '../http/fetcher';
const itemSchema = z
  .object({
    paper: z
      .object({
        id: z.string(),
        title: z.string(),
        summary: z.string().default(''),
        authors: z.array(z.object({ name: z.string() }).passthrough()).default([]),
        publishedAt: z.string().optional(),
        upvotes: z.number().optional(),
      })
      .passthrough(),
    numComments: z.number().optional(),
  })
  .passthrough();
export function parseHF(data: unknown): Candidate[] {
  return z
    .array(z.unknown())
    .parse(data)
    .flatMap((item) => {
      const parsed = itemSchema.safeParse(item);
      if (!parsed.success) return [];
      const { paper, numComments } = parsed.data,
        id = extractArxivId(paper.id);
      return id
        ? [
            {
              ...id,
              title: paper.title,
              abstract: paper.summary,
              authors: paper.authors.map((a) => a.name),
              published: paper.publishedAt,
              signals: [
                {
                  source: 'hf' as const,
                  score: paper.upvotes || 0,
                  comments: numComments || 0,
                  url: `https://huggingface.co/papers/${id.arxivId}`,
                },
              ],
              buzzScore: 0,
              alreadyCovered: false,
            },
          ]
        : [];
    });
}
export async function getHF(date: string, signal?: AbortSignal) {
  return parseHF(
    JSON.parse(
      await sourceText(`https://huggingface.co/api/daily_papers?date=${date}`, 1800000, signal),
    ),
  );
}
