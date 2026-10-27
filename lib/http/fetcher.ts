import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config';
import { arxivQueue } from './rateLimit';
export class DisallowedHostError extends Error {}
const hosts = new Set([
  'huggingface.co',
  'hn.algolia.com',
  'export.arxiv.org',
  'arxiv.org',
  'api.elevenlabs.io',
]);
export function assertAllowed(url: string) {
  const u = new URL(url);
  if (
    !hosts.has(u.hostname) ||
    u.protocol !== 'https:' ||
    u.username ||
    u.password ||
    (u.port && u.port !== '443')
  )
    throw new DisallowedHostError('Source URL is not allowlisted');
  return u;
}
export async function allowedFetch(
  url: string,
  init: RequestInit = {},
  ttl = 0,
): Promise<Response> {
  init.signal?.throwIfAborted();
  const u = assertAllowed(url);
  const key = path.join(config.CACHE_DIR, createHash('sha256').update(url).digest('hex') + '.json');
  if (ttl && (!init.method || init.method === 'GET'))
    try {
      const c = JSON.parse(await readFile(key, 'utf8'));
      if (Date.now() - c.time < ttl)
        return new Response(c.body, { headers: { 'content-type': c.type } });
    } catch {}
  const request = async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const headers = new Headers(init.headers);
      if (u.hostname === 'huggingface.co' && config.HF_TOKEN)
        headers.set('Authorization', `Bearer ${config.HF_TOKEN}`);
      headers.set(
        'User-Agent',
        `Newsren-MVP/0.1${config.CONTACT_EMAIL ? ` (mailto:${config.CONTACT_EMAIL})` : ''}`,
      );
      const response = await fetch(url, {
        ...init,
        headers,
        redirect: 'error',
        signal: AbortSignal.any([
          AbortSignal.timeout(20000),
          ...(init.signal ? [init.signal] : []),
        ]),
      });
      if (
        (!init.method || init.method === 'GET') &&
        (response.status === 429 || response.status >= 500) &&
        attempt < 2
      ) {
        await response.body?.cancel();
        await new Promise((r) => setTimeout(r, 750 * 2 ** attempt));
        continue;
      }
      if (response.ok && ttl) {
        const body = await response.text();
        await mkdir(config.CACHE_DIR, { recursive: true });
        await writeFile(
          key,
          JSON.stringify({ time: Date.now(), type: response.headers.get('content-type'), body }),
        );
        return new Response(body, { headers: response.headers });
      }
      return response;
    }
    throw new Error('Source retries exhausted');
  };
  return ['export.arxiv.org', 'arxiv.org'].includes(u.hostname)
    ? arxivQueue(request, init.signal || undefined)
    : request();
}
export async function sourceText(url: string, ttl: number, signal?: AbortSignal) {
  const r = await allowedFetch(url, { signal }, ttl);
  if (!r.ok) throw new Error(`Source returned ${r.status}: ${new URL(url).hostname}`);
  return r.text();
}
