import { describe, it, expect } from 'vitest';
import { codexEnvironment, codexArgs } from '../lib/agents/codex';
describe('subscription adapter boundaries', () => {
  it('excludes API keys, app secrets, and inherited agent-server settings', () => {
    const env = codexEnvironment({
      HOME: '/home/test',
      PATH: '/bin',
      OPENAI_API_KEY: 'secret',
      CODEX_API_KEY: 'secret',
      ELEVENLABS_API_KEY: 'secret',
      HF_TOKEN: 'secret',
      ADMIN_TOKEN: 'secret',
      CODEX_SERVER_URL: 'private',
    });
    expect(env).toEqual({ HOME: '/home/test', PATH: '/bin', NODE_ENV: 'production' });
  });
  it('forces ChatGPT auth, disables native execution, and uses a read-only isolated session', () => {
    const args = codexArgs('/tmp/isolated', '/tmp/schema.json', 'gpt-6-sol');
    expect(args).toContain('forced_login_method="chatgpt"');
    expect(args).toContain('--ignore-user-config');
    expect(args).toContain('--ephemeral');
    expect(args).toContain('read-only');
    expect(args).toContain('shell_tool');
    expect(args).toContain('web_search="disabled"');
    expect(args).not.toContain('--dangerously-bypass-approvals-and-sandbox');
  });
});
