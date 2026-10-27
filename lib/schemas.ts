import { z } from 'zod';
// The Newsren explains papers for students only.
export const audienceSchema = z.enum(['student']);
export type Audience = z.infer<typeof audienceSchema>;
export const arxivIdSchema = z.string().regex(/^\d{4}\.\d{4,5}(v\d+)?$/);
export const claimSchema = z.object({
  text: z.string().min(1).max(200),
  claim_type: z.enum([
    'beats_sota',
    'first_to',
    'efficiency',
    'scaling',
    'new_benchmark_or_dataset',
    'negative_result',
    'capability',
    'other',
  ]),
  metric: z.string().optional(),
  value: z.string().optional(),
  benchmark: z.string().optional(),
  baseline: z.string().optional(),
  quote: z.string().min(1).max(1500),
  quote_source: z.enum(['abstract', 'full_text']),
  quote_section_id: z.string().optional(),
});
export const cardSchema = z.object({
  tldr: z.string().max(280),
  hypothesis: z.string().max(1800),
  method: z.string().max(1800),
  findings: z.string().max(1800),
  limitations: z.string().max(1800),
  possible_applications: z.string().max(1800),
  whats_new: z.string().max(1800),
  watch_next: z.string().max(1800),
  topics: z.array(z.string().max(60)).min(1).max(5),
  claims: z.array(claimSchema).min(1).max(4),
  discussion: z
    .array(
      z.object({
        stance: z.enum(['concern', 'praise', 'question', 'context']),
        summary: z.string().max(200),
        quote: z.string().max(1500),
        comment_id: z.string(),
      }),
    )
    .max(3),
  could_not_verify: z.array(z.string().max(500)).min(1).max(20),
});
export type CardSubmission = z.infer<typeof cardSchema>;
export const selectionSchema = z.object({
  selections: z
    .array(
      z.object({
        arxivId: arxivIdSchema,
        reason: z.string().min(1).max(200),
        priority: z.number().int().positive(),
        expectedClaimBoldness: z.enum(['low', 'medium', 'high']),
      }),
    )
    .max(30),
});
export type Selection = z.infer<typeof selectionSchema>['selections'][number];
export const explanationSchema = z.object({
  one_liner: z.string().min(1).max(200),
  problem: z.string().min(1).max(700),
  core_idea: z.string().min(1).max(700),
  how_it_works: z
    .array(z.object({ title: z.string().min(1).max(60), detail: z.string().min(1).max(300) }))
    .min(3)
    .max(5),
  results: z.string().min(1).max(700),
  learn_first: z
    .array(z.object({ concept: z.string().min(1).max(60), why: z.string().min(1).max(240) }))
    .min(2)
    .max(4),
  analogy: z.string().min(1).max(500),
  why_it_matters: z.string().min(1).max(500),
  key_takeaways: z.array(z.string().min(1).max(200)).min(2).max(3),
  glossary: z
    .array(z.object({ term: z.string().max(60), definition: z.string().max(240) }))
    .min(2)
    .max(5),
  quiz: z
    .array(
      z.object({
        question: z.string().min(1).max(240),
        options: z.array(z.string().min(1).max(160)).length(3),
        answer_index: z.number().int().min(0).max(2),
        explanation: z.string().min(1).max(300),
      }),
    )
    .min(2)
    .max(3),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
});
export type Explanation = z.infer<typeof explanationSchema>;
export type Section = { id: string; title: string; text: string };
export type Comment = { commentId: string; author: string; text: string };
export type Signal = {
  source: 'hf' | 'hn';
  score: number;
  comments: number;
  url: string;
  objectID?: string;
};
export type Candidate = {
  arxivId: string;
  version: string;
  title: string;
  abstract: string;
  authors: string[];
  published?: string;
  signals: Signal[];
  buzzScore: number;
  alreadyCovered: boolean;
};
export type Paper = {
  arxivId: string;
  version: string;
  title: string;
  abstract: string;
  authors: string[];
  published: string;
  updated: string;
  categories: string[];
  arxiv_comment?: string;
  journal_ref?: string;
  doi?: string;
};
