import type { Candidate } from '../schemas';
export function extractArxivId(value: string): { arxivId: string; version: string } | null {
  const plain = value.match(/^(\d{4}\.\d{4,5})(v\d+)?$/i);
  if (plain) return { arxivId: plain[1], version: plain[2] || 'v1' };
  try {
    const u = new URL(value);
    if (!['arxiv.org', 'www.arxiv.org', 'export.arxiv.org'].includes(u.hostname)) return null;
    const m = u.pathname.match(/^\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5})(v\d+)?(?:\.pdf)?\/?$/i);
    return m ? { arxivId: m[1], version: m[2] || 'v1' } : null;
  } catch {
    return null;
  }
}
export function mergeCandidates(
  items: Candidate[],
  covered: (id: string, version: string) => boolean = () => false,
): Candidate[] {
  const merged = new Map<string, Candidate>();
  for (const item of items) {
    const old = merged.get(item.arxivId);
    if (!old) {
      merged.set(item.arxivId, { ...item, signals: [...item.signals] });
      continue;
    }
    if (+item.version.slice(1) > +old.version.slice(1)) {
      Object.assign(old, { ...item, signals: old.signals });
    }
    for (const s of item.signals) {
      const found = old.signals.find((x) => x.source === s.source);
      if (!found) old.signals.push(s);
      else if (s.score > found.score) Object.assign(found, s);
    }
  }
  const all = [...merged.values()];
  for (const item of all) {
    item.buzzScore = 0;
    for (const source of ['hf', 'hn'] as const) {
      const values = all.flatMap((c) =>
        c.signals.filter((s) => s.source === source).map((s) => s.score),
      );
      const s = item.signals.find((s) => s.source === source);
      if (s)
        item.buzzScore +=
          (source === 'hf' ? 0.6 : 0.4) *
          (values.length <= 1 ? 1 : values.filter((v) => v < s.score).length / (values.length - 1));
    }
    item.alreadyCovered = covered(item.arxivId, item.version);
  }
  return all.sort((a, b) => b.buzzScore - a.buzzScore);
}
