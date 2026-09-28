import { EmptyState } from '@/components/Mascot';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search } from '@/components/icons';
import type { RefObject } from 'react';
import type { SearchResult } from '../hooks/useDocumentSearch';

export function SearchPanel({
  input,
  query,
  results,
  progress,
  activeMatch,
  completedQuery,
  onQuery,
  onSelect,
}: {
  input: RefObject<HTMLInputElement | null>;
  query: string;
  completedQuery: string | null;
  results: SearchResult[];
  progress: number | null;
  activeMatch: { page: number; offset: number } | null;
  onQuery: (query: string) => void;
  onSelect: (result: SearchResult) => void;
}) {
  return (
    <>
      <div className="sidebar-search">
        <Search size={15} />
        <Input
          ref={input}
          placeholder="搜索文档中的文字"
          aria-label="搜索文档内容"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
      </div>
      <div className="search-status">
        {progress !== null
          ? `正在检索 ${Math.round(progress * 100)}%`
          : query
            ? `${results.length} 处结果 · ${new Set(results.map((r) => r.page)).size} 页`
            : '输入关键词，搜索所有页面'}
      </div>
      {progress !== null && <progress max="1" value={progress} />}
      <div className="sidebar-scroll">
        {query.trim() && completedQuery === query && !results.length && (
          <EmptyState
            scene="search"
            compact
            title="没有找到相关内容"
            description="试试其他关键词。扫描页面可能没有可搜索的文字。"
            action={{
              label: '清空搜索',
              onClick: () => {
                onQuery('');
                input.current?.focus();
              },
            }}
          />
        )}
        {results.map((r) => (
          <Button
            variant="ghost"
            className={`search-result ${activeMatch?.page === r.page && activeMatch.offset === r.offset ? 'selected' : ''}`}
            key={`${r.page}:${r.offset}`}
            onClick={() => onSelect(r)}
          >
            <strong>
              第 {r.page} 页 <span>{r.count} 处</span>
            </strong>
            <p>{r.excerpt}</p>
          </Button>
        ))}
      </div>
    </>
  );
}
