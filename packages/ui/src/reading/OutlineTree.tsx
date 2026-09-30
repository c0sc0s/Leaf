import { useEffect, useMemo, useRef, useState } from 'react';
import type { OutlineEntry } from '@leaf/contracts/documents';
import { ChevronRight } from '../icons';
import { ancestorsOf, buildOutline, visibleOutline } from './outline';

export function OutlineTree({
  entries,
  activeId,
  label,
  onActivate,
}: {
  entries: OutlineEntry[];
  activeId: string | null;
  label(entry: OutlineEntry): string;
  onActivate(entry: OutlineEntry): void;
}) {
  const nodes = useMemo(() => buildOutline(entries), [entries]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set()),
    [focused, setFocused] = useState(0);
  const rows = useRef(new Map<number, HTMLElement>());
  const visible = visibleOutline(nodes, expanded);
  useEffect(() => {
    const index = nodes.findIndex((node) => node.id === activeId);
    if (index < 0) return;
    setExpanded((previous) => new Set([...previous, ...ancestorsOf(nodes, index)]));
  }, [nodes, activeId]);
  const toggle = (index: number, value: boolean) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (value) next.add(index);
      else next.delete(index);
      return next;
    });
  const focus = (index: number | undefined) => {
    if (index === undefined) return;
    setFocused(index);
    requestAnimationFrame(() => rows.current.get(index)?.focus());
  };
  const tabbable = visible.some((node) => node.index === focused) ? focused : visible[0]?.index;
  return (
    <div role="tree" aria-label="文档目录" className="outline-tree">
      {visible.map((node, order) => (
        <div
          key={node.id}
          ref={(element) => {
            if (element) rows.current.set(node.index, element);
            else rows.current.delete(node.index);
          }}
          role="treeitem"
          tabIndex={tabbable === node.index ? 0 : -1}
          aria-label={`${node.title} ${label(node)}`}
          aria-level={ancestorsOf(nodes, node.index).length + 1}
          aria-expanded={node.hasChildren ? expanded.has(node.index) : undefined}
          aria-selected={node.id === activeId}
          className={`outline-item depth-${node.depth}${node.id === activeId ? ' selected' : ''}`}
          style={{ paddingLeft: 8 + node.depth * 14 }}
          onFocus={() => setFocused(node.index)}
          onClick={() => onActivate(node)}
          onKeyDown={(event) => {
            if (
              ![
                'ArrowDown',
                'ArrowUp',
                'ArrowRight',
                'ArrowLeft',
                'Home',
                'End',
                'Enter',
                ' ',
              ].includes(event.key)
            )
              return;
            event.preventDefault();
            if (event.key === 'ArrowDown')
              focus(visible[Math.min(order + 1, visible.length - 1)]?.index);
            else if (event.key === 'ArrowUp') focus(visible[Math.max(0, order - 1)]?.index);
            else if (event.key === 'Home') focus(visible[0]?.index);
            else if (event.key === 'End') focus(visible.at(-1)?.index);
            else if (event.key === 'ArrowRight' && node.hasChildren) {
              if (!expanded.has(node.index)) toggle(node.index, true);
              else focus(visible[order + 1]?.index);
            } else if (event.key === 'ArrowLeft') {
              if (node.hasChildren && expanded.has(node.index)) toggle(node.index, false);
              else if (node.parent !== null) focus(node.parent);
            } else if (event.key === 'Enter' || event.key === ' ') onActivate(node);
          }}
        >
          {node.hasChildren ? (
            <button
              type="button"
              tabIndex={-1}
              className="outline-toggle"
              aria-label={`${expanded.has(node.index) ? '收起' : '展开'} ${node.title}`}
              onClick={(event) => {
                event.stopPropagation();
                toggle(node.index, !expanded.has(node.index));
              }}
            >
              <ChevronRight size={12} />
            </button>
          ) : (
            <span className="outline-toggle leaf" />
          )}
          <span className="outline-title">{node.title}</span>
          <span className="outline-page">{label(node)}</span>
        </div>
      ))}
    </div>
  );
}
