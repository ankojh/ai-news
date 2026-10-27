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
async function fetchHtml(id: string, signal?: AbortSignal) {
  arxivIdSchema.parse(id);
  for (const version of [...new Set([id, /v\d+$/.test(id) ? id : `${id}v1`])]) {
    const response = await allowedFetch(`https://arxiv.org/html/${version}`, { signal }, 604800000);
    if (response.status === 404) continue;
    if (!response.ok) throw new Error(`arXiv HTML returned ${response.status}`);
    return response.text();
  }
  return null;
}
export async function getFullText(id: string, signal?: AbortSignal): Promise<Section[]> {
  const html = await fetchHtml(id, signal);
  return html ? parseArxivHtml(html) : [];
}
export type Figure = { src: string; caption: string; label: string };
// The paper's first figure is usually its overview diagram. Image paths are relative to /html/.
export function parseFirstFigure(html: string): Figure | null {
  const $ = load(html);
  // Figures are <img> or, for SVG, <object type="image/svg+xml" data="…">.
  const graphic = 'img, object[type^="image/"]';
  const figure = $('figure.ltx_figure')
    .filter((_, e) => $(e).find(graphic).length > 0)
    .first();
  const node = figure.find(graphic).first();
  const src = node.attr('src') || node.attr('data');
  if (!src) return null;
  const url = new URL(src, 'https://arxiv.org/html/');
  if (url.hostname !== 'arxiv.org') return null;
  const tag = figure.find('figcaption .ltx_tag').first().text().trim();
  const caption = figure.find('figcaption').first().text().replace(/\s+/g, ' ').trim();
  return {
    src: url.href,
    label: tag.replace(/:$/, '') || 'Figure',
    caption: (tag ? caption.slice(tag.length) : caption).trim().slice(0, 400),
  };
}
export async function getFirstFigure(id: string, signal?: AbortSignal) {
  const html = await fetchHtml(id, signal);
  return html ? parseFirstFigure(html) : null;
}
