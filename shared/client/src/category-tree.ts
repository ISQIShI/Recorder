import type { CategoryData } from '@recorder/contracts';
export function categoryPath(nodes: readonly CategoryData[], id: string): string {
  const byId = new Map(nodes.map(node => [node.id, node])), names: string[] = [];
  let node = byId.get(id);
  while (node) { names.unshift(node.name); node = node.parentId === null ? undefined : byId.get(node.parentId); }
  return names.join(' / ');
}
export function categoryRows(nodes: readonly CategoryData[]): { node: CategoryData; depth: number }[] {
  const children = new Map<string | null, CategoryData[]>();
  for (const node of nodes) { const group = children.get(node.parentId) ?? []; group.push(node); children.set(node.parentId, group); }
  const rows: { node: CategoryData; depth: number }[] = [];
  const append = (parentId: string | null, depth: number) => { for (const node of children.get(parentId) ?? []) { rows.push({ node, depth }); append(node.id, depth + 1); } };
  append(null, 0); return rows;
}
