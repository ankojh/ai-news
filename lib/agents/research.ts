import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { config } from '../config';
import { RunBudget } from '../budget';
import { db, insert, execute, one, now } from '../db/client';
import { isBold } from '../labels';
import {
  cardSchema,
  type CardSubmission,
  type Candidate,
  type Selection,
  type Paper,
} from '../schemas';
import { getFullText } from '../sources/arxivHtml';
import { getComments } from '../sources/hn';
import { verifyQuote, type Evidence, type QuoteInput } from '../verify/quote';
import { runAgent, trace } from './loop';
import { prompt } from './prompt';
const quoteSchema = z.object({
  quote: z.string(),
  source: z.enum(['abstract', 'full_text', 'hn_comment']),
  sectionId: z.string().optional(),
  commentId: z.string().optional(),
});
export async function researchPaper(
  candidate: Candidate,
  paper: Paper,
  selection: Selection,
  runId: string,
  budget: RunBudget,
) {
  const cardId = randomUUID(),
    evidence: Evidence = {
      abstract: paper.abstract || candidate.abstract,
      sections: [],
      comments: [],
    };
  let htmlLoaded = false,
    commentsLoaded = false;
  const receipts = new Set<string>();
  const key = (q: QuoteInput) => JSON.stringify(q);
  const enforceId = (raw: unknown) => {
    if ((raw as { arxivId: string }).arxivId.replace(/v\d+$/, '') !== paper.arxivId)
      throw new Error('Only the assigned paper may be researched');
  };
  try {
    const result = (await runAgent({
      agent: 'research',
      system: prompt('research', {
        topics: selection.reason,
        paper: paper.arxivId,
        version: paper.version,
        hasHN: candidate.signals.some((s) => s.source === 'hn'),
      }),
      initialUserMessage: `Research ${paper.arxivId} with your tools, verify quotes, and submit a card.`,
      runId,
      cardId,
      budget,
      maxToolCalls: config.MAX_TOOL_CALLS_PER_PAPER,
      maxTokens: config.MAX_TOKENS_PER_PAPER,
      timeoutMs: config.RESEARCH_TIMEOUT_MS,
      tools: [
        {
          name: 'get_paper_metadata',
          description: 'Read authoritative arXiv metadata for assigned paper',
          schema: z.object({ arxivId: z.string() }),
          handler: (raw) => {
            enforceId(raw);
            return { ...paper, html_available: htmlLoaded ? evidence.sections.length > 0 : null };
          },
        },
        {
          name: 'get_full_text',
          description: 'Without section: section index. With section: read up to 8,000 characters.',
          schema: z.object({ arxivId: z.string(), section: z.string().optional() }),
          handler: async (raw, signal) => {
            enforceId(raw);
            if (!htmlLoaded) {
              evidence.sections = await getFullText(`${paper.arxivId}${paper.version}`, signal);
              htmlLoaded = true;
              execute(
                'UPDATE papers SET html_available=? WHERE arxiv_id=?',
                evidence.sections.length ? 1 : 0,
                paper.arxivId,
              );
            }
            if (!evidence.sections.length) return { error: 'Full text not available in HTML' };
            const { section } = raw as { section?: string };
            if (!section)
              return evidence.sections.map(({ id, title, text }) => ({
                id,
                title,
                chars: text.length,
              }));
            const found =
              evidence.sections.find((s) => s.id === section) ||
              evidence.sections.find((s) => s.title.toLowerCase().includes(section.toLowerCase()));
            if (!found) throw new Error('Section not found');
            return {
              ...found,
              text: found.text.slice(0, 8000),
              truncated: found.text.length > 8000,
            };
          },
        },
        {
          name: 'get_hn_discussion',
          description: 'Read up to ten top-level community comments, not evidence of results',
          schema: z.object({ arxivId: z.string() }),
          handler: async (raw, abortSignal) => {
            enforceId(raw);
            const signal = candidate.signals.find((s) => s.source === 'hn');
            if (!signal?.objectID) return { none: true };
            if (!commentsLoaded) {
              evidence.comments = await getComments(signal.objectID, abortSignal);
              commentsLoaded = true;
            }
            return { storyUrl: signal.url, points: signal.score, comments: evidence.comments };
          },
        },
        {
          name: 'verify_quote',
          description: 'Check 6–60 contiguous words against primary source or HN comment',
          schema: quoteSchema,
          handler: (raw) => {
            const q = raw as QuoteInput,
              result = verifyQuote(q, evidence);
            if (result.verified) receipts.add(key(q));
            return result;
          },
        },
        {
          name: 'submit_card',
          description:
            'Submit the researched decoder card; every claim must have passed verify_quote',
          schema: cardSchema,
          terminal: true,
          handler: (raw) => {
            const card = cardSchema.parse(raw);
            for (const claim of card.claims) {
              const q: QuoteInput = {
                quote: claim.quote,
                source: claim.quote_source,
                ...(claim.quote_section_id ? { sectionId: claim.quote_section_id } : {}),
              };
              if (!receipts.has(key(q)))
                throw new Error('Call verify_quote successfully for each claim before submitting');
            }
            return card;
          },
        },
      ],
    })) as CardSubmission;
    return persistCard(
      result,
      paper,
      selection,
      runId,
      cardId,
      evidence,
      htmlLoaded ? !!evidence.sections.length : null,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Research failed';
    insert('cards', {
      id: cardId,
      arxiv_id: paper.arxivId,
      paper_version: paper.version,
      run_id: runId,
      status: 'failed',
      failure_reason: message,
      created_at: now(),
    });
    trace(runId, cardId, 'research', 'error', undefined, {}, message, false);
    return null;
  }
}
export function persistCard(
  card: CardSubmission,
  paper: Paper,
  selection: Selection,
  runId: string,
  cardId: string,
  evidence: Evidence,
  htmlAvailable: boolean | null,
  model = config.CODEX_MODEL_AGENT,
) {
  return db().transaction(() => {
    const claims = card.claims.flatMap((c) => {
      const check = verifyQuote(
        { quote: c.quote, source: c.quote_source, sectionId: c.quote_section_id },
        evidence,
      );
      if (!check.verified) {
        trace(
          runId,
          cardId,
          'research',
          'post_verify_drop',
          'claim',
          {},
          check.reason || 'Rejected',
          false,
        );
        return [];
      }
      return [{ ...c, location: check.location }];
    });
    const discussion = card.discussion.filter((d) => {
      const check = verifyQuote(
        { quote: d.quote, source: 'hn_comment', commentId: d.comment_id },
        evidence,
      );
      if (!check.verified)
        trace(
          runId,
          cardId,
          'research',
          'post_verify_drop',
          'discussion',
          {},
          check.reason || 'Rejected',
          false,
        );
      return check.verified;
    });
    const unknown = [...card.could_not_verify];
    if (!unknown.some((s) => /independent/i.test(s)))
      unknown.push(
        'Not yet independently confirmed (this MVP does not search for independent evaluations)',
      );
    if (htmlAvailable === false) unknown.push('Full text not available in HTML');
    const {
      claims: _claims,
      discussion: _discussion,
      topics,
      could_not_verify: _unknown,
      ...fields
    } = card;
    if (!claims.length) {
      fields.tldr = 'No proposed claims passed quote verification. See what could not be verified.';
      for (const field of [
        'hypothesis',
        'method',
        'findings',
        'possible_applications',
        'whats_new',
        'watch_next',
      ] as const)
        fields[field] = '';
      fields.limitations = 'There is insufficient verified evidence for a decoder summary.';
    }
    insert('cards', {
      id: cardId,
      arxiv_id: paper.arxivId,
      paper_version: paper.version,
      run_id: runId,
      status: 'draft',
      low_evidence: claims.length ? 0 : 1,
      ...fields,
      topics_json: JSON.stringify(topics),
      discussion_json: JSON.stringify(discussion),
      could_not_verify_json: JSON.stringify(unknown),
      selection_reason: selection.reason,
      model,
      created_at: now(),
    });
    for (const c of claims)
      insert('claims', {
        id: randomUUID(),
        card_id: cardId,
        text: c.text,
        claim_type: c.claim_type,
        is_bold: isBold(c.claim_type) ? 1 : 0,
        metric: c.metric,
        value: c.value,
        benchmark: c.benchmark,
        baseline: c.baseline,
        quote: c.quote,
        quote_source: c.quote_source,
        quote_location: c.location,
        verified: 1,
      });
    return String(one('SELECT id FROM cards WHERE id=?', cardId)?.id);
  })();
}
