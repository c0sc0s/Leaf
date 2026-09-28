import type { ReadingLocation } from '../types';

export interface OutlineItem {
  title: string;
  page: number;
  depth: number;
  location?: ReadingLocation;
}
export interface OutlineNode extends OutlineItem {
  index: number;
  parent: number | null;
  hasChildren: boolean;
}

// A heading counts as current once it is within this share of a page below the viewport top.
const ACTIVE_LEAD = 0.08;

export function buildOutline(items: OutlineItem[]): OutlineNode[] {
  const nodes: OutlineNode[] = [];
  const stack: OutlineNode[] = [];
  items.forEach((item, index) => {
    while (stack.length && stack.at(-1)!.depth >= item.depth) stack.pop();
    const parent = stack.at(-1) ?? null;
    if (parent) parent.hasChildren = true;
    const node = { ...item, index, parent: parent?.index ?? null, hasChildren: false };
    nodes.push(node);
    stack.push(node);
  });
  return nodes;
}

export function ancestorsOf(nodes: OutlineNode[], index: number): number[] {
  const result: number[] = [];
  for (let parent = nodes[index]?.parent; parent !== null && parent !== undefined;) {
    result.push(parent);
    parent = nodes[parent].parent;
  }
  return result;
}

export function visibleOutline(nodes: OutlineNode[], expanded: ReadonlySet<number>) {
  return nodes.filter((node) => ancestorsOf(nodes, node.index).every((i) => expanded.has(i)));
}

function position(item: OutlineItem) {
  return item.page + (item.location?.ratio ?? 0);
}

export function activeOutlineIndex(
  nodes: OutlineItem[],
  location: Pick<ReadingLocation, 'page' | 'ratio'>,
  preferred: number | null,
) {
  const current = location.page + location.ratio + ACTIVE_LEAD;
  let active = -1;
  nodes.forEach((node, index) => {
    if (position(node) <= current && (active < 0 || position(node) >= position(nodes[active])))
      active = index;
  });
  // Entries without a precise destination share a page; honour the one the reader chose.
  if (preferred !== null && active >= 0 && position(nodes[preferred]) === position(nodes[active]))
    return preferred;
  return active;
}
