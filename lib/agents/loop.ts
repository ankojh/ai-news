import { z } from 'zod';
import { config } from '../config';
import { RunBudget, BudgetError, agentBudgetState } from '../budget';
import { insert, now } from '../db/client';
import { codexStep, type AgentMessage } from './codex';
export type ToolDef = {
  name: string;
  description: string;
  schema: z.ZodType;
  handler: (input: unknown, signal: AbortSignal) => Promise<unknown> | unknown;
  terminal?: boolean;
};
export type LoopOptions = {
  agent: string;
  model?: string;
  fast?: boolean;
  system: string;
  tools: ToolDef[];
  initialUserMessage: string;
  maxToolCalls: number;
  maxTokens: number;
  timeoutMs: number;
  runId: string;
  cardId?: string;
  budget: RunBudget;
  signal?: AbortSignal;
};
export function trace(
  runId: string,
  cardId: string | undefined,
  agent: string,
  kind: string,
  tool: string | undefined,
  input: unknown,
  output: unknown,
  ok = true,
  duration = 0,
  tokensIn = 0,
  tokensOut = 0,
) {
  insert('agent_steps', {
    run_id: runId,
    card_id: cardId,
    agent,
    step_no: Date.now(),
    kind,
    tool_name: tool,
    input_json: JSON.stringify(input),
    output_summary: (typeof output === 'string' ? output : JSON.stringify(output)).slice(0, 500),
    ok: ok ? 1 : 0,
    duration_ms: duration,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_usd: null,
    created_at: now(),
  });
}
export async function runAgent(o: LoopOptions): Promise<unknown> {
  const signal = AbortSignal.any([
    AbortSignal.timeout(Math.min(o.timeoutMs, o.budget.remainingMs())),
    ...(o.signal ? [o.signal] : []),
  ]);
  const messages: AgentMessage[] = [{ role: 'user', content: o.initialUserMessage }];
  const tools = o.tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: z.toJSONSchema(t.schema),
  }));
  const model = o.model || (o.fast ? config.CODEX_MODEL_FAST : config.CODEX_MODEL_AGENT);
  let calls = 0,
    tokens = 0,
    warned = false;
  while (true) {
    signal.throwIfAborted();
    o.budget.check();
    const state = agentBudgetState(calls, tokens, o.maxToolCalls, o.maxTokens);
    if (state === 'exhausted') throw new BudgetError('Agent tool/token limit reached');
    if (state === 'warning' && !warned) {
      const warning =
        'Budget nearly exhausted. Call the terminal tool now with what you have and list anything unverified in could_not_verify.';
      messages.push({ role: 'user', content: warning });
      trace(o.runId, o.cardId, o.agent, 'budget_warning', undefined, {}, warning);
      warned = true;
    }
    const start = Date.now();
    const response = await codexStep({
      model,
      system: o.system,
      messages,
      tools,
      remainingCalls: o.maxToolCalls - calls,
      remainingTokens: o.maxTokens - tokens,
      signal,
    });
    o.budget.usage(response.inputTokens, response.outputTokens);
    tokens += response.inputTokens + response.outputTokens;
    trace(
      o.runId,
      o.cardId,
      o.agent,
      'model_call',
      undefined,
      { provider: 'codex', billing: 'subscription', model },
      response.message || 'Planned the next application tool',
      true,
      Date.now() - start,
      response.inputTokens,
      response.outputTokens,
    );
    if (tokens > o.maxTokens)
      throw new BudgetError('Agent token limit reached after Codex response');
    o.budget.check();
    messages.push({ role: 'assistant', content: response.calls });
    if (!response.calls.length) throw new Error('Agent stopped before calling its submission tool');
    const results: unknown[] = [];
    for (const call of response.calls) {
      signal.throwIfAborted();
      if (calls >= o.maxToolCalls) throw new BudgetError('Tool call limit reached');
      calls++;
      const tool = o.tools.find((t) => t.name === call.name),
        began = Date.now();
      try {
        if (!tool) throw new Error('Unknown tool');
        const input = tool.schema.parse(call.input),
          output = await tool.handler(input, signal);
        signal.throwIfAborted();
        const summary =
          call.name === 'get_full_text'
            ? 'Read section index or up to 8,000 source characters'
            : call.name === 'get_paper_metadata'
              ? 'Read primary-source metadata'
              : call.name === 'get_hn_discussion'
                ? 'Read community discussion'
                : output;
        trace(
          o.runId,
          o.cardId,
          o.agent,
          'tool_call',
          call.name,
          input,
          summary,
          true,
          Date.now() - began,
        );
        if (tool.terminal) return output;
        results.push({ tool: call.name, result: output });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Tool failed';
        trace(
          o.runId,
          o.cardId,
          o.agent,
          'tool_call',
          call.name,
          call.input,
          message,
          false,
          Date.now() - began,
        );
        results.push({ tool: call.name, error: message, is_error: true });
      }
    }
    messages.push({ role: 'tool', content: results });
  }
}
