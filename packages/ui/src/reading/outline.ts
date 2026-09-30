import type { OutlineEntry } from '@leaf/contracts/documents';

export interface OutlineNode extends OutlineEntry {
  index: number;
  parent: number | null;
  hasChildren: boolean;
}
export function buildOutline(items: OutlineEntry[]): OutlineNode[] {
  const nodes: OutlineNode[] = [],
    stack: OutlineNode[] = [];
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
  return nodes.filter((node) =>
    ancestorsOf(nodes, node.index).every((index) => expanded.has(index)),
  );
}
