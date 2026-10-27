import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
const dir = mkdtempSync(path.join(tmpdir(), 'newsren-test-'));
process.env.DATABASE_PATH = path.join(dir, 'test.db');
process.env.CACHE_DIR = path.join(dir, 'cache');
process.env.ADMIN_TOKEN = 'test-only-admin';
afterAll(() => rmSync(dir, { recursive: true, force: true }));
