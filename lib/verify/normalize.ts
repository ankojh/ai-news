export function normalize(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/\u00ad/g, '')
    .replace(/-\r?\n\s*/g, '')
    .replace(/\\times\b/g, 'x')
    .replace(/\\sim\b/g, '~')
    .replace(/\\%/g, '%')
    .replace(/\\[a-zA-Z]+\*?/g, '')
    .replace(/[$\{\}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
