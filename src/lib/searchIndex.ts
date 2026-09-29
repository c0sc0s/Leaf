export interface SearchResult {
  page: number;
  excerpt: string;
  count: number;
  offset: number;
}

// Keep text independently of the small, geometry-heavy viewport cache.
// Originals + lowercase copies use roughly 32 MiB at the default limit.
export class SearchIndex {
  private pages = new Map<number, { text: string; lower: string }>();
  private characters = 0;
  constructor(
    private limit = 8 * 1024 * 1024,
    private maxPages = 5000,
  ) {}

  set(page: number, text: string) {
    const previous = this.pages.get(page);
    if (previous) this.characters -= previous.text.length;
    this.pages.delete(page);
    if (text.length > this.limit) return;
    this.pages.set(page, { text, lower: text.toLowerCase() });
    this.characters += text.length;
    while (this.characters > this.limit || this.pages.size > this.maxPages) {
      const oldest = this.pages.keys().next().value!;
      this.characters -= this.pages.get(oldest)!.text.length;
      this.pages.delete(oldest);
    }
  }

  search(page: number, query: string, text?: string): SearchResult[] | null {
    if (text !== undefined) this.set(page, text);
    const entry =
      this.pages.get(page) ?? (text !== undefined ? { text, lower: text.toLowerCase() } : null);
    if (!entry) return null;
    const needle = query.toLowerCase();
    if (!needle.trim()) return [];
    const results: SearchResult[] = [];
    let offset = entry.lower.indexOf(needle);
    while (offset >= 0) {
      results.push({
        page,
        offset,
        count: 1,
        excerpt:
          (offset > 35 ? '…' : '') +
          entry.text.slice(Math.max(0, offset - 35), offset + query.length + 80) +
          '…',
      });
      offset = entry.lower.indexOf(needle, offset + needle.length);
    }
    return results;
  }
}

export interface SearchRequest {
  page: number;
  query: string;
  text?: string;
}
