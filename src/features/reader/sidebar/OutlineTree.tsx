import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { ChevronRight } from '@/components/icons';
import type { ReadingLocation } from '../../../types';
import {
  activeOutlineIndex,
  ancestorsOf,
  buildOutline,
  visibleOutline,
  type OutlineItem,
  type OutlineNode,
} from '../../../lib/outline';
import { useLocation, type LocationStore } from '../hooks/locationStore';
import { revealIn } from '../../../lib/reveal';

export const OutlineTree = memo(function OutlineTree({
  items,
  location,
  onNavigate,
}: {
  items: OutlineItem[];
  location: LocationStore;
  onNavigate: (page: number, location?: ReadingLocation) => void;
}) {
  const [preferred, setPreferred] = useState<number | null>(null);
  const active = useLocation(
    location,
    useCallback((current) => activeOutlineIndex(items, current, preferred), [items, preferred]),
  );
  return (
    <OutlineTreeView
      items={items}
      active={active}
      onChoose={(node) => {
        setPreferred(node.index);
        onNavigate(node.page, node.location);
      }}
    />
  );
});

// Both document formats share expansion, keyboard navigation and row presentation.
export const OutlineTreeView = memo(function OutlineTreeView({
  items,
  active,
  onChoose,
}: {
  items: OutlineItem[];
  active: number;
  onChoose: (node: OutlineNode) => void;
}) {
  const nodes = useMemo(() => buildOutline(items), [items]);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set());
  useEffect(() => {
    if (active < 0) return;
    setExpanded((previous) => {
      const missing = ancestorsOf(nodes, active).filter((i) => !previous.has(i));
      return missing.length ? new Set([...previous, ...missing]) : previous;
    });
  }, [active, nodes]);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const selected = list.current?.querySelector('[aria-selected="true"]');
    if (selected) revealIn(list.current!, selected);
  }, [active, expanded]);
  const toggle = (index: number, open?: boolean) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (open ?? !next.has(index)) next.add(index);
      else next.delete(index);
      return next;
    });
  const keyboard = (event: KeyboardEvent<HTMLButtonElement>, node: OutlineNode) => {
    const rows = [...(list.current?.querySelectorAll<HTMLElement>('.outline-item') ?? [])];
    const at = rows.indexOf(event.currentTarget);
    const focusRow = (i: number) => rows[Math.max(0, Math.min(rows.length - 1, i))]?.focus();
    if (event.key === 'ArrowDown') focusRow(at + 1);
    else if (event.key === 'ArrowUp') focusRow(at - 1);
    else if (event.key === 'ArrowRight' && node.hasChildren) {
      if (expanded.has(node.index)) focusRow(at + 1);
      else toggle(node.index, true);
    } else if (event.key === 'ArrowLeft') {
      if (node.hasChildren && expanded.has(node.index)) toggle(node.index, false);
      else if (node.parent !== null)
        list.current
          ?.querySelector<HTMLElement>(`.outline-item[data-index="${node.parent}"]`)
          ?.focus();
    } else return;
    event.preventDefault();
    event.stopPropagation();
  };
  return (
    <div className="sidebar-scroll outline-tree" role="tree" ref={list}>
      {visibleOutline(nodes, expanded).map((node) => (
        <button
          type="button"
          key={node.index}
          role="treeitem"
          data-index={node.index}
          aria-level={node.depth + 1}
          aria-expanded={node.hasChildren ? expanded.has(node.index) : undefined}
          aria-selected={node.index === active}
          className={`outline-item depth-${Math.min(node.depth, 3)} ${node.index === active ? 'selected' : ''}`}
          style={{ paddingLeft: 6 + node.depth * 14 }}
          title={node.title}
          onClick={() => onChoose(node)}
          onKeyDown={(event) => keyboard(event, node)}
        >
          <span
            className={`outline-toggle ${node.hasChildren ? '' : 'leaf'}`}
            onClick={(event) => {
              if (!node.hasChildren) return;
              event.stopPropagation();
              toggle(node.index);
            }}
          >
            {node.hasChildren && <ChevronRight size={13} />}
          </span>
          <span className="outline-title">{node.title}</span>
          <span className="outline-page">{node.page}</span>
        </button>
      ))}
    </div>
  );
});
