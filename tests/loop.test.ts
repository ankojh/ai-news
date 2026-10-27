import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
const mocks = vi.hoisted(() => ({ step: vi.fn() }));
vi.mock('../lib/agents/codex', () => ({ codexStep: mocks.step }));
import { runAgent, type LoopOptions } from '../lib/agents/loop';
import { RunBudget } from '../lib/budget';
import { all } from '../lib/db/client';
const response = (name: string, input: unknown = {}) => ({
  calls: [{ name, input }],
  message: 'Plan the next tool',
  inputTokens: 10,
  outputTokens: 10,
});
const options = (): LoopOptions => ({
  agent: 'editor',
  system: 'Test only',
  initialUserMessage: 'Test',
  runId: crypto.randomUUID(),
  budget: new RunBudget(1),
  maxToolCalls: 2,
  maxTokens: 1000,
  timeoutMs: 1000,
  tools: [
    { name: 'read', description: 'Read', schema: z.object({}), handler: () => ({ ok: true }) },
    {
      name: 'submit',
      description: 'Submit',
      schema: z.object({ value: z.string() }),
      handler: (raw) => raw,
      terminal: true,
    },
  ],
});
beforeEach(() => mocks.step.mockReset());
describe('loop using a mocked Codex transport', () => {
  it('warns at the final tool call, records usage, and stops at submission', async () => {
    mocks.step
      .mockResolvedValueOnce(response('read'))
      .mockResolvedValueOnce(response('submit', { value: 'done' }));
    const o = options();
    await expect(runAgent(o)).resolves.toEqual({ value: 'done' });
    expect(
      mocks.step.mock.calls[1][0].messages.some(
        (m: { content: unknown }) =>
          typeof m.content === 'string' && m.content.includes('Budget nearly exhausted'),
      ),
    ).toBe(true);
    expect(o.budget.tokensIn).toBe(20);
    expect(o.budget.cost).toBe(0);
    expect(
      all("SELECT * FROM agent_steps WHERE run_id=? AND kind='budget_warning'", o.runId),
    ).toHaveLength(1);
  });
  it('aborts when the model keeps calling non-terminal tools', async () => {
    mocks.step.mockResolvedValue(response('read'));
    await expect(runAgent(options())).rejects.toThrow(/limit/);
    expect(mocks.step).toHaveBeenCalledTimes(2);
  });
  it('returns validation errors to the planner for repair', async () => {
    mocks.step
      .mockResolvedValueOnce(response('submit', { value: 123 }))
      .mockResolvedValueOnce(response('submit', { value: 'fixed' }));
    await expect(runAgent(options())).resolves.toEqual({ value: 'fixed' });
    expect(
      mocks.step.mock.calls[1][0].messages.some(
        (m: { content: unknown }) =>
          Array.isArray(m.content) && m.content.some((c: { is_error?: boolean }) => c.is_error),
      ),
    ).toBe(true);
  });
  it('stops between Codex calls when the run token allowance is exhausted', async () => {
    const o = options();
    o.budget = new RunBudget(1, 900000, 5);
    mocks.step.mockResolvedValue(response('read'));
    await expect(runAgent(o)).rejects.toThrow(/token limit/);
    expect(mocks.step).toHaveBeenCalledTimes(1);
  });
  it('does not execute a tool after an oversized model response', async () => {
    const o = options(),
      handler = vi.fn();
    o.tools[0].handler = handler;
    mocks.step.mockResolvedValue({ ...response('read'), inputTokens: 1001 });
    await expect(runAgent(o)).rejects.toThrow(/token limit/);
    expect(handler).not.toHaveBeenCalled();
  });
  it('does not execute tools beyond a hard cap within one plan', async () => {
    const o = options();
    o.maxToolCalls = 1;
    const handler = vi.fn();
    o.tools[0].handler = handler;
    mocks.step.mockResolvedValue({
      ...response('read'),
      calls: [...response('read').calls, ...response('read').calls],
    });
    await expect(runAgent(o)).rejects.toThrow(/limit/);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
