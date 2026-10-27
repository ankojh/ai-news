import { z } from 'zod';
import { load } from 'cheerio';
import { extractArxivId } from './merge';
import type { Candidate, Comment } from '../schemas';
import { sourceText } from '../http/fetcher';
const hit = z
  .object({
    objectID: z.string(),
    title: z.string().nullable().default(''),
    url: z.string().nullable(),
    points: z.number().nullable().default(0),
    num_comments: z.number().nullable().default(0),
    created_at: z.string().optional(),
  })
  .passthrough();
export function parseHN(data: unknown): Candidate[] {
  const { hits } = z.object({ hits: z.array(z.unknown()) }).parse(data);
  return hits.flatMap((h) => {
    const p = hit.safeParse(h);
    if (!p.success) return [];
    const s = p.data,
      id = s.url && extractArxivId(s.url);
    return id
      ? [
          {
            ...id,
            title: s.title || id.arxivId,
            abstract: '',
            authors: [],
            published: s.created_at,
            signals: [
              {
                source: 'hn' as const,
                score: s.points || 0,
                comments: s.num_comments || 0,
                url: `https://news.ycombinator.com/item?id=${s.objectID}`,
                objectID: s.objectID,
              },
            ],
            buzzScore: 0,
            alreadyCovered: false,
          },
        ]
      : [];
  });
}
export function parseHNComments(data: unknown): Comment[] {
  const p = z
    .object({
      children: z
        .array(
          z
            .object({
              id: z.number(),
              author: z.string().nullable().optional(),
              text: z.string().nullable().optional(),
            })
            .passthrough(),
        )
        .default([]),
    })
    .parse(data);
  return p.children
    .slice(0, 10)
    .filter((c) => c.text)
    .map((c) => ({
      commentId: String(c.id),
      author: c.author || 'anonymous',
      text: load(c.text || '')
        .text()
        .slice(0, 1000),
    }));
}
export async function getHN(date: string, hours: number, signal?: AbortSignal) {
  const end = Math.floor(new Date(`${date}T23:59:59Z`).getTime() / 1000);
  const q = new URLSearchParams({
    query: 'arxiv.org',
    restrictSearchableAttributes: 'url',
    tags: 'story',
    numericFilters: `created_at_i>${end - hours * 3600},created_at_i<${end}`,
    hitsPerPage: '100',
  });
  return parseHN(
    JSON.parse(await sourceText(`https://hn.algolia.com/api/v1/search?${q}`, 1800000, signal)),
  );
}
export async function getComments(id: string, signal?: AbortSignal) {
  if (!/^\d+$/.test(id)) throw new Error('Invalid HN story ID');
  return parseHNComments(
    JSON.parse(await sourceText(`https://hn.algolia.com/api/v1/items/${id}`, 1800000, signal)),
  );
}
