import 'dotenv/config';
import { z } from 'zod';
const integer = (fallback: number, max = 1e7) =>
  z.coerce.number().int().min(1).max(max).default(fallback);
const optionalPrice = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z.coerce.number().nonnegative().optional(),
);
const schema = z.object({
  CODEX_BIN: z.string().min(1).default('codex'),
  CODEX_MODEL_AGENT: z.string().default('gpt-6-sol'),
  CODEX_MODEL_FAST: z.string().default('gpt-6-luna'),
  CODEX_REASONING_EFFORT: z.enum(['low', 'medium', 'high']).default('low'),
  HF_TOKEN: z.string().default(''),
  ELEVENLABS_API_KEY: z.string().default(''),
  ELEVENLABS_VOICE_ID: z.string().default('JBFqnCBsd6RMkjVDRZzb'),
  ELEVENLABS_MODEL_ID: z.string().default('eleven_multilingual_v2'),
  DATABASE_PATH: z.string().default('./data/newsren.db'),
  CACHE_DIR: z.string().default('./data/cache'),
  AUDIO_DIR: z.string().default('./data/audio'),
  ADMIN_TOKEN: z.string().default(''),
  MAX_CANDIDATES: integer(60, 100),
  MAX_PAPERS_PER_RUN: integer(10, 30),
  MAX_TOOL_CALLS_PER_PAPER: integer(8, 30),
  MAX_TOOL_CALLS_EDITOR: integer(20, 60),
  MAX_TOKENS_PER_PAPER: integer(60000, 500000),
  MAX_TOKENS_PER_RUN: integer(200000, 2000000),
  MAX_COST_USD_PER_RUN: z.coerce.number().positive().default(1),
  RUN_TIMEOUT_MS: integer(900000),
  RESEARCH_TIMEOUT_MS: integer(120000),
  RESEARCH_CONCURRENCY: integer(3, 5),
  MAX_TTS_CHARS: integer(2500),
  HN_LOOKBACK_HOURS: integer(48),
  HF_MIN_CANDIDATES: integer(20),
  CONTACT_EMAIL: z.string().default(''),
  REVIEW_MODE: z.enum(['personal', 'required']).default('personal'),
  BRIEFING_AUDIENCE: z.enum(['student', 'educator', 'professional']).default('professional'),
  BRIEFING_SIZE: integer(5, 10),
  PRICE_TTS_PER_1K_CHARS: optionalPrice,
});
export const config = schema.parse(process.env);
