import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { extractArxivId, mergeCandidates } from '../lib/sources/merge';
import { parseHF } from '../lib/sources/hf';
import { parseHN, parseHNComments } from '../lib/sources/hn';
import { parseArxiv } from '../lib/sources/arxiv';
import { parseArxivHtml, parseFirstFigure } from '../lib/sources/arxivHtml';
import { assertAllowed, DisallowedHostError } from '../lib/http/fetcher';
import { publicationStatus, isBold } from '../lib/labels';
const fixture = (name: string) => readFileSync(`fixtures/${name}`, 'utf8');
describe('real captured source fixtures', () => {
  it('parses HF and skips malformed entries', () => {
    const data = JSON.parse(fixture('hf_daily.json'));
    expect(parseHF(data).length).toBeGreaterThan(5);
    expect(parseHF([{ paper: { id: 'garbage' } }, ...data]).length).toBe(parseHF(data).length);
  });
  it('parses HN arXiv links only', () =>
    expect(parseHN(JSON.parse(fixture('hn_search.json'))).length).toBeGreaterThan(0));
  it('strips comment HTML, truncates and limits top-level comments', () => {
    const comments = parseHNComments(JSON.parse(fixture('hn_item.json')));
    expect(comments.length).toBeLessThanOrEqual(10);
    expect(comments.every((c) => c.text.length <= 1000 && !/<p>/.test(c.text))).toBe(true);
  });
  it('parses arXiv Atom metadata', () => {
    const papers = parseArxiv(fixture('arxiv_atom.xml'));
    expect(papers.length).toBeGreaterThan(0);
    expect(papers[0].authors.length).toBeGreaterThan(0);
    expect(papers[0].abstract.length).toBeGreaterThan(30);
  });
  it('parses full-text section excerpts', () =>
    expect(parseArxivHtml(fixture('arxiv_html.html')).length).toBeGreaterThan(0));
  it('preserves tables and strips MathML noise', () => {
    const sections = parseArxivHtml(
      '<section class="ltx_section" id="s1"><h2 class="ltx_title">Results</h2><p>A <math alttext="x=3"><mi>noise</mi></math> result.</p><figure class="ltx_table" id="t1"><figcaption>Table 1</figcaption><table><tr><td>Score</td><td>71.3</td></tr></table></figure></section>',
    );
    expect(sections.find((s) => s.id === 't1')?.text).toContain('71.3');
    expect(sections.find((s) => s.id === 's1')?.text).toContain('x=3');
    expect(sections.find((s) => s.id === 's1')?.text).not.toContain('noise');
  });
});
describe('canonical IDs and merge', () => {
  it.each([
    'https://arxiv.org/abs/2610.12345v2',
    'https://arxiv.org/pdf/2610.12345v2.pdf',
    'https://arxiv.org/html/2610.12345v2',
  ])('extracts %s', (url) =>
    expect(extractArxivId(url)).toEqual({ arxivId: '2610.12345', version: 'v2' }),
  );
  it.each([
    'https://evil.test/arxiv.org/abs/2610.12345',
    'https://arxiv.org.evil.test/abs/2610.12345',
    'https://arxiv.org/abs/cs/0101001',
    'garbage',
    'https://arxiv.org/abs/2610.12345-bogus',
  ])('rejects %s', (url) => expect(extractArxivId(url)).toBeNull());
  it('merges both attention sources, takes latest version and checks covered status', () => {
    const hf = parseHF(JSON.parse(fixture('hf_daily.json')))[0];
    const hn = {
      ...hf,
      version: 'v3',
      signals: [
        {
          source: 'hn' as const,
          score: 20,
          comments: 5,
          url: 'https://news.ycombinator.com/item?id=1',
        },
      ],
    };
    const merged = mergeCandidates([hf, hn], (id, v) => id === hf.arxivId && v === 'v3');
    expect(merged).toHaveLength(1);
    expect(merged[0].signals).toHaveLength(2);
    expect(merged[0].version).toBe('v3');
    expect(merged[0].alreadyCovered).toBe(true);
  });
  it('does not reuse a different version', () => {
    const hf = parseHF(JSON.parse(fixture('hf_daily.json')))[0];
    expect(
      mergeCandidates([{ ...hf, version: 'v3' }], (_id, v) => v === 'v2')[0].alreadyCovered,
    ).toBe(false);
  });
});
describe('source and label guardrails', () => {
  it.each([
    'https://example.com',
    'http://arxiv.org/abs/2610.12345',
    'https://arxiv.org:9999/',
    'https://user:pass@arxiv.org/',
    'https://arxiv.org.evil.test/',
  ])('blocks %s', (url) => expect(() => assertAllowed(url)).toThrow(DisallowedHostError));
  it('allows approved HTTPS source', () =>
    expect(assertAllowed('https://arxiv.org/html/2610.12345').hostname).toBe('arxiv.org'));
  it('derives publication status', () => {
    expect(publicationStatus('Nature 2026')).toBe('published');
    expect(publicationStatus(null, 'Accepted at NeurIPS')).toBe('accepted_author_stated');
    expect(publicationStatus()).toBe('preprint');
  });
  it('keeps the bold rule deterministic', () => {
    expect(isBold('capability')).toBe(true);
    expect(isBold('efficiency')).toBe(false);
  });
});
describe('first figure', () => {
  it('resolves the image against arXiv HTML and splits the label from the caption', () => {
    const figure = parseFirstFigure(
      '<figure class="ltx_figure"><img src="2610.33568v1/teaser.png"><figcaption><span class="ltx_tag">Figure 1: </span>Overview of the method.</figcaption></figure>',
    );
    expect(figure).toEqual({
      src: 'https://arxiv.org/html/2610.33568v1/teaser.png',
      label: 'Figure 1',
      caption: 'Overview of the method.',
    });
  });
  it('reads SVG figures embedded as objects', () =>
    expect(
      parseFirstFigure(
        '<figure class="ltx_figure"><object type="image/svg+xml" data="2610.34467v1/fig.svg"></object></figure>',
      )?.src,
    ).toBe('https://arxiv.org/html/2610.34467v1/fig.svg'));
  it('ignores tables and images on other hosts', () => {
    expect(parseFirstFigure('<figure class="ltx_table"><img src="t.png"></figure>')).toBeNull();
    expect(
      parseFirstFigure(
        '<figure class="ltx_figure"><img src="https://evil.example/x.png"></figure>',
      ),
    ).toBeNull();
  });
});
