import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';
import { extractArxivId } from './merge';
import { sourceText } from '../http/fetcher';
import { arxivIdSchema, type Paper } from '../schemas';
const arr = <T>(x: T | T[] | undefined): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);
const entrySchema = z
  .object({
    id: z.string(),
    title: z.string(),
    summary: z.string(),
    published: z.string(),
    updated: z.string(),
  })
  .passthrough();
export function parseArxiv(xml: string): Paper[] {
  const parsed = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
  }).parse(xml);
  return arr(parsed.feed?.entry).flatMap((raw: unknown) => {
    const p = entrySchema.safeParse(raw);
    if (!p.success) return [];
    const e = p.data as z.infer<typeof entrySchema> & {
      author?: { name: string } | { name: string }[];
      category?: { '@_term': string } | { '@_term': string }[];
      'arxiv:comment'?: string;
      'arxiv:journal_ref'?: string;
      'arxiv:doi'?: string;
    };
    const id = extractArxivId(e.id);
    return id
      ? [
          {
            ...id,
            title: e.title.replace(/\s+/g, ' ').trim(),
            abstract: e.summary.trim(),
            authors: arr(e.author).map((a) => a.name),
            published: e.published,
            updated: e.updated,
            categories: arr(e.category).map((c) => c['@_term']),
            arxiv_comment: e['arxiv:comment'],
            journal_ref: e['arxiv:journal_ref'],
            doi: e['arxiv:doi'],
          },
        ]
      : [];
  });
}
export async function getMetadata(ids: string[], signal?: AbortSignal) {
  ids.forEach((id) => arxivIdSchema.parse(id));
  const results: Paper[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50),
      query = new URLSearchParams({ id_list: batch.join(','), max_results: '50' });
    results.push(
      ...parseArxiv(
        await sourceText(
          `https://export.arxiv.org/api/query?${query}`,
          batch.every((id) => /v\d+$/.test(id)) ? 604800000 : 1800000,
          signal,
        ),
      ),
    );
  }
  return results;
}
