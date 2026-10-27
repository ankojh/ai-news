import { describe, it, expect } from 'vitest';
import { explanationSchema } from '../lib/schemas';
import { explanationText } from '../lib/agents/explain';
import { assertNoNewNumbers } from '../lib/agents/prompt';
const valid = {
  one_liner: 'The authors report a model that reaches 71% on a maths test.',
  problem: 'Maths tutors are expensive.',
  core_idea: 'Let the model check its own steps.',
  how_it_works: [
    { title: 'Write steps', detail: 'The model writes its working.' },
    { title: 'Check steps', detail: 'It checks each step.' },
    { title: 'Fix mistakes', detail: 'It rewrites wrong steps.' },
  ],
  results: 'The authors report better scores.',
  learn_first: [
    { concept: 'Language models', why: 'The method builds on them.' },
    { concept: 'Benchmarks', why: 'Results are measured on one.' },
  ],
  analogy: 'Like a student checking their work.',
  why_it_matters: 'This could make maths tutors cheaper.',
  key_takeaways: ['It is a preprint.', 'No one has confirmed it yet.'],
  glossary: [
    { term: 'Benchmark', definition: 'A shared test.' },
    { term: 'Preprint', definition: 'A paper shared before review.' },
  ],
  quiz: [
    {
      question: 'What is still uncertain?',
      options: ['Nothing', 'Whether others get the same result', 'The title'],
      answer_index: 1,
      explanation: 'No one outside the team has tested it.',
    },
    {
      question: 'What is the core idea?',
      options: ['Bigger models', 'Self-checking steps', 'More data'],
      answer_index: 1,
      explanation: 'The model checks its own steps.',
    },
  ],
  difficulty: 'beginner',
};
describe('student explanation', () => {
  it('accepts a complete explanation', () =>
    expect(explanationSchema.safeParse(valid).success).toBe(true));
  it('requires exactly three quiz options', () =>
    expect(
      explanationSchema.safeParse({
        ...valid,
        quiz: [{ ...valid.quiz[0], options: ['A', 'B'] }],
      }).success,
    ).toBe(false));
  it('ignores quiz answer positions when checking for new numbers', () => {
    const e = explanationSchema.parse(valid);
    expect(() => assertNoNewNumbers(explanationText(e), { text: 'reaches 71%' })).not.toThrow();
    expect(() =>
      assertNoNewNumbers(explanationText({ ...e, results: 'It scored 99%.' }), { text: '71%' }),
    ).toThrow();
  });
});
