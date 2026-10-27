import { describe, it, expect } from 'vitest';
import { RunBudget, agentBudgetState, BudgetError } from '../lib/budget';
import { validateSelection } from '../lib/agents/editor';
import { assertNoNewNumbers } from '../lib/agents/prompt';
describe('hard budgets', () => {
  it('warns at the final tool call and 85% of tokens', () => {
    expect(agentBudgetState(7, 0, 8, 60000)).toBe('warning');
    expect(agentBudgetState(0, 51000, 8, 60000)).toBe('warning');
  });
  it('aborts at either cap', () => {
    expect(agentBudgetState(8, 0, 8, 60000)).toBe('exhausted');
    expect(agentBudgetState(0, 60000, 8, 60000)).toBe('exhausted');
  });
  it('reserves external API spend before allowing a request', () => {
    const b = new RunBudget(0.001);
    expect(() => b.reserveUsd(0.002)).toThrow(BudgetError);
  });
  it('reserves capacity across concurrent agents and releases exactly once', () => {
    const b = new RunBudget(0.01);
    const release = b.reserveUsd(0.007);
    expect(() => b.reserveUsd(0.007)).toThrow(BudgetError);
    release();
    release();
    expect(b.reserved).toBe(0);
    expect(() => b.reserveUsd(0.007)).not.toThrow();
  });
  it('accounts subscription tokens without inventing API prices', () => {
    const b = new RunBudget(0.01, 900000, 1000);
    b.usage(0, 1000);
    expect(b.cost).toBe(0);
    expect(() => b.check()).toThrow(/token/);
    expect(b.tokensOut).toBe(1000);
  });
  it('checks the overall wall-clock limit', () => {
    const b = new RunBudget(1, -1);
    expect(() => b.check()).toThrow(/time/);
  });
});
describe('output validation', () => {
  it('rejects unknown editor IDs', () =>
    expect(() =>
      validateSelection(
        {
          selections: [
            {
              arxivId: '2610.12345',
              reason: 'Relevant attention',
              priority: 1,
              expectedClaimBoldness: 'low',
            },
          ],
        },
        [],
        3,
      ),
    ).toThrow(/Unknown/));
  it('rejects too many editor picks', () =>
    expect(() =>
      validateSelection(
        {
          selections: [
            {
              arxivId: '2610.12345',
              reason: 'Relevant attention',
              priority: 1,
              expectedClaimBoldness: 'low',
            },
          ],
        },
        [],
        0,
      ),
    ).toThrow(/Too many/));
  it('blocks new numerical facts in explanations', () => {
    expect(() => assertNoNewNumbers('The score is 99%', { text: 'The score is 71%' })).toThrow();
    expect(() =>
      assertNoNewNumbers('The authors report 71%', { text: 'The score is 71%' }),
    ).not.toThrow();
  });
});
