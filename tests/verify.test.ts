import { describe, it, expect } from 'vitest';
import { normalize } from '../lib/verify/normalize';
import { verifyQuote, type Evidence } from '../lib/verify/quote';
const evidence: Evidence = {
  abstract:
    'The authors report that our model achieves 71.3% accuracy on the MATH benchmark. A $7$B model with \\textbf{strong} results improves by 5\\%.',
  sections: [
    { id: 's1', title: 'Methods', text: 'We evaluate the model using a controlled experiment.' },
    {
      id: 's2',
      title: 'Results',
      text: 'The baseline method performs consistently across all three tasks.',
    },
  ],
  comments: [
    {
      commentId: '123',
      author: 'reader',
      text: 'I would like to see independent replication of these results.',
    },
  ],
};
describe('normalization', () => {
  it.each([
    ['“Curly” ‘quotes’', '"curly" \'quotes\''],
    ['A\u00a0B  C\nD', 'a b c d'],
    ['ﬂow — chart', 'flow - chart'],
    ['inter-\nnational soft\u00adhyphen', 'international softhyphen'],
    ['$7$B \\textbf{model} \\times 2 \\sim 5\\%', '7b model x 2 ~ 5%'],
  ])('normalizes %s', (source, expected) => expect(normalize(source)).toBe(expected));
});
describe('quote verification', () => {
  it('matches case and Unicode-normalized quotes', () =>
    expect(
      verifyQuote(
        { quote: 'OUR MODEL achieves 71.3% accuracy on the MATH benchmark.', source: 'abstract' },
        evidence,
      ).verified,
    ).toBe(true));
  it('matches LaTeX normalization', () =>
    expect(
      verifyQuote(
        { quote: 'A 7B model with strong results improves by 5%.', source: 'abstract' },
        evidence,
      ).verified,
    ).toBe(true));
  it.each([
    ['short quote', 'too short'],
    [Array(61).fill('word').join(' '), 'too long'],
    ['our model ... achieves accuracy on the MATH benchmark', 'contains ellipsis'],
    ['our model … achieves accuracy on the MATH benchmark', 'contains ellipsis'],
    ['our model [now] achieves accuracy on the MATH benchmark', 'contains bracket edits'],
    ['The model achieved one hundred percent accuracy everywhere', 'not found in abstract'],
  ])('rejects %s', (quote, reason) =>
    expect(verifyQuote({ quote, source: 'abstract' }, evidence)).toEqual({
      verified: false,
      reason,
    }),
  );
  it('rejects six-word paraphrases even if plausible', () =>
    expect(
      verifyQuote(
        { quote: 'Their model is the best available today', source: 'abstract' },
        evidence,
      ).verified,
    ).toBe(false));
  it('finds and reports the section ID', () =>
    expect(
      verifyQuote(
        {
          quote: 'The baseline method performs consistently across all three tasks.',
          source: 'full_text',
        },
        evidence,
      ),
    ).toEqual({ verified: true, location: 's2' }));
  it('rejects a quote from the wrong section', () =>
    expect(
      verifyQuote(
        {
          quote: 'The baseline method performs consistently across all three tasks.',
          source: 'full_text',
          sectionId: 's1',
        },
        evidence,
      ).verified,
    ).toBe(false));
  it('allows a cross-section contiguous quote only without a section ID', () => {
    const quote = 'a controlled experiment. The baseline method performs consistently';
    expect(verifyQuote({ quote, source: 'full_text' }, evidence).verified).toBe(true);
    expect(verifyQuote({ quote, source: 'full_text', sectionId: 's1' }, evidence).verified).toBe(
      false,
    );
  });
  it('rejects unavailable HTML', () =>
    expect(
      verifyQuote(
        { quote: 'a controlled experiment with several additional tasks', source: 'full_text' },
        { ...evidence, sections: [] },
      ).reason,
    ).toMatch(/unavailable/));
  it('checks a discussion quote against its specific comment', () => {
    expect(
      verifyQuote(
        {
          quote: 'I would like to see independent replication',
          source: 'hn_comment',
          commentId: '123',
        },
        evidence,
      ).verified,
    ).toBe(true);
    expect(
      verifyQuote(
        {
          quote: 'I would like to see independent replication',
          source: 'hn_comment',
          commentId: '999',
        },
        evidence,
      ).verified,
    ).toBe(false);
  });
});
