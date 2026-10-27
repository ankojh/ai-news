import { config } from './config';
export class BudgetError extends Error {}
export class RunBudget {
  tokensIn = 0;
  tokensOut = 0;
  cost = 0;
  reserved = 0;
  ttsChars = 0;
  readonly started = Date.now();
  constructor(
    public maxCost = config.MAX_COST_USD_PER_RUN,
    public timeout = config.RUN_TIMEOUT_MS,
    public maxTokens = config.MAX_TOKENS_PER_RUN,
  ) {}
  check() {
    if (Date.now() - this.started >= this.timeout) throw new BudgetError('Run time limit reached');
    if (this.tokensIn + this.tokensOut >= this.maxTokens)
      throw new BudgetError('Run token limit reached');
    if (this.cost + this.reserved >= this.maxCost)
      throw new BudgetError('External API cost limit reached');
  }
  reserveUsd(amount: number) {
    this.check();
    if (!Number.isFinite(amount) || amount < 0) throw new BudgetError('Invalid external API cost');
    if (this.cost + this.reserved + amount > this.maxCost)
      throw new BudgetError('Next external request would exceed the run cost cap');
    this.reserved += amount;
    let released = false;
    return () => {
      if (!released) {
        this.reserved = Math.max(0, this.reserved - amount);
        released = true;
      }
    };
  }
  // Subscription usage is reported in tokens, never assigned invented API dollar prices.
  usage(input: number, output: number) {
    this.tokensIn += input;
    this.tokensOut += output;
  }
  remainingMs() {
    return Math.max(1, this.timeout - (Date.now() - this.started));
  }
}
export function agentBudgetState(
  calls: number,
  tokens: number,
  maxCalls: number,
  maxTokens: number,
) {
  if (calls >= maxCalls || tokens >= maxTokens) return 'exhausted';
  return calls >= maxCalls - 1 || tokens >= maxTokens * 0.85 ? 'warning' : 'ok';
}
