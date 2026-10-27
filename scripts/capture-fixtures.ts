import { mkdir, writeFile } from 'node:fs/promises';
import { sourceText } from '../lib/http/fetcher';
import { parseHF } from '../lib/sources/hf';
import { parseArxivHtml } from '../lib/sources/arxivHtml';
import { load } from 'cheerio';
async function main() {
  await mkdir('fixtures', { recursive: true });
  const captured: Record<string, unknown> = { capturedAt: new Date().toISOString(), sources: {} };
  const sources = captured.sources as Record<string, unknown>;
  async function save(name: string, url: string) {
    try {
      const text = await sourceText(url, 0);
      let stored = text;
      if (name === 'arxiv_html.html') {
        const $ = load('<!doctype html><html><body></body></html>');
        for (const s of parseArxivHtml(text).slice(0, 3)) {
          const node = $('<section class="ltx_section"></section>').attr('id', s.id);
          node.append($('<h2 class="ltx_title"></h2>').text(s.title));
          node.append($('<p></p>').text(s.text.split(/\s+/).slice(0, 20).join(' ')));
          $('body').append(node);
        }
        stored = $.html();
      }
      if (name === 'hn_item.json') {
        const item = JSON.parse(text);
        stored = JSON.stringify(
          {
            id: item.id,
            children: (item.children || [])
              .filter((c: { text?: string }) => c.text)
              .slice(0, 3)
              .map((c: { id: number; author: string; text: string; created_at: string }) => ({
                id: c.id,
                author: c.author,
                created_at: c.created_at,
                text: load(c.text).text().split(/\s+/).slice(0, 20).join(' '),
                children: [],
              })),
          },
          null,
          2,
        );
      }
      await writeFile(`fixtures/${name}`, stored);
      sources[name] = {
        url,
        ok: true,
        ...(stored !== text
          ? { note: 'Reduced to short real excerpts; full text is not distributed.' }
          : {}),
      };
      return text;
    } catch (e) {
      sources[name] = { url, ok: false, error: String(e) };
      return null;
    }
  }
  const hf = await save('hf_daily.json', 'https://huggingface.co/api/daily_papers');
  const ids = hf
    ? parseHF(JSON.parse(hf))
        .slice(0, 6)
        .map((c) => c.arxivId)
    : ['1706.03762'];
  const hn = await save(
    'hn_search.json',
    'https://hn.algolia.com/api/v1/search?query=arxiv.org&restrictSearchableAttributes=url&tags=story&hitsPerPage=10',
  );
  const story = hn ? JSON.parse(hn).hits?.[0]?.objectID : null;
  if (story) await save('hn_item.json', `https://hn.algolia.com/api/v1/items/${story}`);
  await save(
    'arxiv_atom.xml',
    `https://export.arxiv.org/api/query?id_list=${ids.join(',')}&max_results=6`,
  );
  await save('arxiv_html.html', `https://arxiv.org/html/${ids[0]}`);
  await writeFile('fixtures/provenance.json', JSON.stringify(captured, null, 2));
  console.log(JSON.stringify(captured, null, 2));
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
