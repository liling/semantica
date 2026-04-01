import Graph from "graphology";


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
  highlighted?: boolean;

  nodeType: string;
  content: string;
  valid_from?: string | null;
  valid_until?: string | null;
  properties: Record<string, any>;
}

export interface EdgeAttributes {
 
  size?: number;
  color?: string;
  
 
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