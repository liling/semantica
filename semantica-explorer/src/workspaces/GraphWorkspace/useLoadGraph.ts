import { useQuery, useQueryClient } from "@tanstack/react-query";
import { batchMergeEdges, batchMergeNodes, clearGraph, graph } from "../../store/graphStore";
import type { EdgeAttributes, NodeAttributes } from "../../store/graphStore";

// colors and hasher
const CYBER_PALETTE = [
  "#58a6ff",
  "#3fb950",
  "#d2a8ff",
  "#f0883e",
  "#ff7b72",
  "#79c0ff",
  "#d29922",
  "#bc8cff",
  "#56d364",
  "#f778ba"
];


const hashCategory = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

interface ApiNode {
  id: string;
  type: string;
  content: string;
  properties: Record<string, any>;
  valid_from?: string | null;
  valid_until?: string | null;
}

interface ApiEdge {
  source: string;
  target: string;
  type: string;
  weight: number;
  properties: Record<string, any>;
}

interface NodeListResponse {
  nodes: ApiNode[];
  total: number;
  skip: number;
  limit: number;
}

interface EdgeListResponse {
  edges: ApiEdge[];
  total: number;
  skip: number;
  limit: number;
}

export interface GraphLoadSummary {
  nodeCount: number;
  edgeCount: number;
  loadTimeMs: number;
}

const PAGE_LIMIT = 1000;

async function fetchAllNodes(signal: AbortSignal): Promise<number> {
  let skip = 0;
  let totalMerged = 0;
  let hasMore = true;

  while (hasMore) {
    const url = new URL("/api/graph/nodes", window.location.origin);
    url.searchParams.set("limit", String(PAGE_LIMIT));
    url.searchParams.set("skip", String(skip));

    const res = await fetch(url.toString(), { signal });
    if (!res.ok) {
      const errorBody = await res.text();
      if (res.status === 422) {
        console.error(`🚨 FastAPI 422 Crash Report at skip=${skip}:`, errorBody);
        break;
      }
      throw new Error(`Fetch failed: ${res.status}`);
    }

    const data: NodeListResponse = await res.json();

    if (!data.nodes || data.nodes.length === 0) {
      break;
    }

    const nodesToMerge = data.nodes.map((n) => {
      const x = n.properties?.x ?? (Math.random() * 1000 - 500);
      const y = n.properties?.y ?? (Math.random() * 1000 - 500);

      return {
        id: n.id,
        attributes: {
          label: n.content || n.id,
          x,
          y,
          nodeType: n.type,
          content: n.content,
          valid_from: n.valid_from,
          valid_until: n.valid_until,
          properties: n.properties,
        } as NodeAttributes,
      };
    });

    batchMergeNodes(nodesToMerge);
    totalMerged += nodesToMerge.length;
    skip += PAGE_LIMIT;

    if (data.nodes.length < PAGE_LIMIT) {
      hasMore = false;
    }

    await yieldToMain();
  }

  return totalMerged;
}

async function fetchAllEdges(signal: AbortSignal): Promise<number> {
  let skip = 0;
  let totalMerged = 0;
  let hasMore = true;

  while (hasMore) {
    const url = new URL("/api/graph/edges", window.location.origin);
    url.searchParams.set("limit", String(PAGE_LIMIT));
    url.searchParams.set("skip", String(skip));

    const res = await fetch(url.toString(), { signal });
    if (!res.ok) {
      const errorBody = await res.text();
      if (res.status === 422) {
        console.error(`🚨 FastAPI 422 Crash Report at skip=${skip}:`, errorBody);
        break;
      }
      throw new Error(`Fetch failed: ${res.status}`);
    }

    const data: EdgeListResponse = await res.json();

    if (!data.edges || data.edges.length === 0) {
      break;
    }

    // Filter out edges pointing to missing nodes
    const validEdges = data.edges.filter((e) => {
      return graph.hasNode(e.source) && graph.hasNode(e.target);
    });

    const edgesToMerge = validEdges.map((e) => ({
      source: e.source,
      target: e.target,
      attributes: {
        weight: e.weight,
        edgeType: e.type,
        properties: e.properties,
        size: e.properties?.size ?? 1,
        color: e.properties?.color ?? "#444C56",
      } as EdgeAttributes,
    }));

    batchMergeEdges(edgesToMerge);
    totalMerged += edgesToMerge.length;
    skip += PAGE_LIMIT;

    if (data.edges.length < PAGE_LIMIT) {
      hasMore = false;
    }

    await yieldToMain();
  }

  return totalMerged;
}

function yieldToMain(): Promise<void> {
  if ("scheduler" in window && typeof (window as any).scheduler.yield === "function") {
    return (window as any).scheduler.yield();
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

interface UseLoadGraphOptions {
  enabled?: boolean;
  onGraphReady?: (summary: GraphLoadSummary) => void;
}

export function useLoadGraph(options: UseLoadGraphOptions = {}) {
  const { enabled = true, onGraphReady } = options;

  return useQuery<GraphLoadSummary>({
    queryKey: ["graph", "full-load"],
    enabled,
    staleTime: Infinity,

    queryFn: async ({ signal }): Promise<GraphLoadSummary> => {
      const t0 = performance.now();

      clearGraph();

      const nodeCount = await fetchAllNodes(signal);
      const edgeCount = await fetchAllEdges(signal);

      // Sizing and color mapper
      const maxDegree = graph.nodes().reduce((max, node) => Math.max(max, graph.degree(node)), 1);

      graph.updateEachNodeAttributes((node, attr) => {
        const categoryStr = String(attr.nodeType || attr.properties?.community || attr.properties?.category || "default");
        const colorIndex = hashCategory(categoryStr) % CYBER_PALETTE.length;


        const degree = graph.degree(node);
        const minSize = 2;
        const maxSize = 25;


        const sizeRatio = Math.log(degree + 1) / Math.log(maxDegree + 1);
        const dynamicSize = minSize + (maxSize - minSize) * sizeRatio;

        return {
          ...attr,
          color: CYBER_PALETTE[colorIndex],
          size: dynamicSize,
          borderColor: "#0d1117",
          borderSize: 0.5,
        };
      });

      const summary: GraphLoadSummary = {
        nodeCount,
        edgeCount,
        loadTimeMs: Math.round(performance.now() - t0),
      };

      onGraphReady?.(summary);

      return summary;
    },
  });
}

export function useReloadGraph() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["graph", "full-load"] });
}
