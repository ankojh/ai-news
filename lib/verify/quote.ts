import { normalize } from './normalize';
import type { Section, Comment } from '../schemas';
export type QuoteInput = {
  quote: string;
  source: 'abstract' | 'full_text' | 'hn_comment';
  sectionId?: string;
  commentId?: string;
};
export type Evidence = { abstract: string; sections: Section[]; comments: Comment[] };
export function verifyQuote(
  input: QuoteInput,
  evidence: Evidence,
): { verified: boolean; location?: string; reason?: string } {
  const reject = (reason: string) => ({ verified: false, reason });
  if (/\.\.\.|…/.test(input.quote)) return reject('contains ellipsis');
  if (/[\[\]]/.test(input.quote)) return reject('contains bracket edits');
  const quote = normalize(input.quote),
    count = quote.split(/\s+/).filter(Boolean).length;
  if (count < 6) return reject('too short');
  if (count > 60) return reject('too long');
  if (input.source === 'abstract')
    return normalize(evidence.abstract).includes(quote)
      ? { verified: true, location: 'Abstract' }
      : reject('not found in abstract');
  if (input.source === 'hn_comment') {
    const comment = evidence.comments.find((c) => c.commentId === input.commentId);
    return comment && normalize(comment.text).includes(quote)
      ? { verified: true, location: `HN comment ${comment.commentId}` }
      : reject('not found in comment');
  }
  const sections = input.sectionId
    ? evidence.sections.filter((s) => s.id === input.sectionId)
    : evidence.sections;
  if (!sections.length) return reject('full text unavailable or section not found');
  const match = sections.find((s) => normalize(s.text).includes(quote));
  if (match) return { verified: true, location: match.id };
  if (!input.sectionId && normalize(sections.map((s) => s.text).join(' ')).includes(quote))
    return { verified: true, location: 'Across sections' };
  return reject('not found in full text');
}
