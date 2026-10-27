export function publicationStatus(journal?: string | null, comment?: string | null) {
  return journal
    ? 'published'
    : /accepted (at|to|by)|to appear in/i.test(comment || '')
      ? 'accepted_author_stated'
      : 'preprint';
}
export function isBold(type: string) {
  return ['beats_sota', 'first_to', 'scaling', 'capability'].includes(type);
}
