import Database from 'better-sqlite3';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config';
let instance: Database.Database | undefined;
export function db() {
  if (!instance) {
    const filename = path.resolve(config.DATABASE_PATH);
    mkdirSync(path.dirname(filename), { recursive: true });
    instance = new Database(filename);
    instance.pragma('journal_mode = WAL');
    instance.pragma('foreign_keys = ON');
    instance.pragma('busy_timeout = 5000');
    instance.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY)');
    const migrations = path.join(process.cwd(), 'lib/db/migrations');
    for (const file of readdirSync(migrations)
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      if (!instance.prepare('SELECT 1 FROM schema_migrations WHERE name=?').get(file)) {
        const connection = instance;
        connection.transaction(() => {
          connection.exec(readFileSync(path.join(migrations, file), 'utf8'));
          connection.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file);
        })();
      }
    }
    const seed = instance.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)');
    for (const [k, v] of Object.entries({
      topics: ['LLM reasoning', 'AI agents'],
      review_mode: config.REVIEW_MODE,
      max_papers_per_run: config.MAX_PAPERS_PER_RUN,
    }))
      seed.run(k, JSON.stringify(v));
  }
  return instance;
}
export type Row = Record<string, unknown>;
export function all(sql: string, ...args: unknown[]): Row[] {
  return db()
    .prepare(sql)
    .all(...args) as Row[];
}
export function one(sql: string, ...args: unknown[]): Row | undefined {
  return db()
    .prepare(sql)
    .get(...args) as Row | undefined;
}
export function execute(sql: string, ...args: unknown[]) {
  return db()
    .prepare(sql)
    .run(...args);
}
export function insert(table: string, values: Record<string, unknown>) {
  if (!/^[a-z_]+$/.test(table) || Object.keys(values).some((k) => !/^[a-z_]+$/.test(k)))
    throw new Error('Invalid SQL identifier');
  const keys = Object.keys(values);
  return execute(
    `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
    ...Object.values(values).map((v) => (v === undefined ? null : v)),
  );
}
export const now = () => new Date().toISOString();
export function settings() {
  return Object.fromEntries(
    all('SELECT key,value FROM settings').map((r) => [String(r.key), JSON.parse(String(r.value))]),
  ) as {
    topics: string[];
    review_mode: 'personal' | 'required';
    max_papers_per_run: number;
  };
}
export function setSettings(input: Record<string, unknown>) {
  db().transaction(() => {
    for (const [key, value] of Object.entries(input))
      execute(
        'INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
        key,
        JSON.stringify(value),
      );
  })();
  return settings();
}
