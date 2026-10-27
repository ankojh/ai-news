import { load } from 'cheerio';
import { allowedFetch } from '../http/fetcher';
import { arxivIdSchema, type Section } from '../schemas';
export function parseArxivHtml(html: string): Section[] {
  const $ = load(html);
  $('math').each((_, e) => {
    const alt = $(e).attr('alttext') || '';
    $(e).replaceWith(alt);
  });
  $('script,style,nav,.ltx_bibliography').remove();
  const sections: Section[] = [];
  $('.ltx_abstract,section.ltx_section,figure.ltx_table').each((i, e) => {
    const node = $(e).clone();
    node.find('section.ltx_section,figure.ltx_table').remove();
    node.find('table').each((_, table) => {
      const rows = $(table)
        .find('tr')
        .map((_, row) =>
          $(row)
            .find('td,th')
            .map((_, cell) => $(cell).text().trim())
            .get()
            .join(' | '),
        )
        .get()
        .join('\n');
      $(table).replaceWith(rows);
    });
    const title = node.find('.ltx_title,figcaption').first().text().trim() || 'Abstract';
    const text = node.text().replace(/\s+/g, ' ').trim();
    if (text) sections.push({ id: $(e).attr('id') || `section-${i}`, title, text });
  });
  return sections;
}
export async function getFullText(id: string, signal?: AbortSignal): Promise<Section[]> {
  arxivIdSchema.parse(id);
  for (const version of [...new Set([id, /v\d+$/.test(id) ? id : `${id}v1`])]) {
    const response = await allowedFetch(`https://arxiv.org/html/${version}`, { signal }, 604800000);
    if (response.status === 404) continue;
    if (!response.ok) throw new Error(`arXiv HTML returned ${response.status}`);
    return parseArxivHtml(await response.text());
  }
  return [];
}
