import Graph from "graphology";
import type {
  GraphArrowVisibilityPolicy,
  GraphBadgeKind,
  GraphEdgeVariant,
  GraphLabelVisibilityPolicy,
  GraphNodeShapeVariant,
} from "../workspaces/GraphWorkspace/graphTheme";


export const graph = new Graph({ 
  type: "directed", 
  multi: false, 
  allowSelfLoops: false 
});



export interface NodeAttributes {

  label: string;
  x: number;
  y: number;
  size: number;
  color: string;
  baseColor?: string;
  mutedColor?: string;
  glowColor?: string;
  baseSize?: number;
  visualPriority?: number;
  labelPriority?: number;
  semanticGroup?: string;
  strokeColor?: string;
  borderColor?: string;
  borderSize?: number;
  nodeVariant?: GraphNodeShapeVariant;
  nodeShapeVariant?: GraphNodeShapeVariant;
  badgeKind?: GraphBadgeKind;
  badgeCount?: number;
  ringColor?: string;
  haloColor?: string;
  labelVisibilityPolicy?: GraphLabelVisibilityPolicy;
  highlighted?: boolean;

  nodeType: string;
  content: string;
  valid_from?: string | null;
  valid_until?: string | null;
  properties: Record<string, any>;
}

export interface EdgeAttributes {
 
  size?: number;
  baseSize?: number;
  color?: string;
  baseColor?: string;
  mutedColor?: string;
  type?: string;
  visualPriority?: number;
  edgeFamily?: "line" | "parallel" | "bidirectional" | "path";
  isBidirectional?: boolean;
  curveGroup?: string | null;
  edgeVariant?: GraphEdgeVariant;
  arrowVisibilityPolicy?: GraphArrowVisibilityPolicy;
  relationshipStrength?: number;
  isParallelPair?: boolean;
  parallelIndex?: number;
  parallelCount?: number;
  
 
  edgeType: string;
  weight: number;
  properties: Record<string, any>;
}


export function batchMergeNodes(
  nodes: { id: string; attributes: NodeAttributes }[]
): void {
  for (const { id, attributes } of nodes) {
    graph.mergeNode(id, attributes);
  }
}


export function batchMergeEdges(
  edges: { source: string; target: string; attributes: EdgeAttributes }[]
): void {
  for (const { source, target, attributes } of edges) {
   
    if (graph.hasNode(source) && graph.hasNode(target)) {
      graph.mergeDirectedEdge(source, target, attributes);
    }
  }
}

export function clearGraph(): void {
  graph.clear();
}
