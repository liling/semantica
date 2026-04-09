import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import { batchMergeEdges, batchMergeNodes, clearGraph, graph, type EdgeAttributes, type NodeAttributes } from "../../store/graphStore";
import { GraphCanvas } from "./GraphCanvas";
import type { GraphCanvasHandle } from "./GraphCanvas";
import {
  chooseColorAccessor,
  colorForNodeKey,
  computeDegreeMap,
  computeEdgeSize,
  computeNodeSize,
  computePageRank,
  deterministicPosition,
} from "./graphAnalytics";
import { GRAPH_THEME } from "./graphConfig";
import type {
  GraphDataSnapshot,
  GraphEffectsState,
  GraphLayoutSource,
  GraphLayoutStatus,
  GraphLoadProgress,
  GraphPath,
  GraphSelectedNodeState,
  GraphStageHandle,
  GraphViewMode,
} from "./types";

const STAGE_EFFECTS_STATE: GraphEffectsState = {
  pathPulseEnabled: false,
  pathFlowEnabled: false,
  lensEnabled: false,
  legendEnabled: false,
  diagnosticsEnabled: false,
  lensMode: "neighborhood",
  effectQuality: "bounded",
};

const socketProtocol = () => (window.location.protocol === "https:" ? "wss:" : "ws:");

function yieldToMain(): Promise<void> {
  if ("scheduler" in window && typeof (window as Window & { scheduler?: { yield?: () => Promise<void> } }).scheduler?.yield === "function") {
    return (window as Window & { scheduler: { yield: () => Promise<void> } }).scheduler.yield();
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function buildSelectedNodeState(nodeId: string): GraphSelectedNodeState | null {
  if (!nodeId || !graph.hasNode(nodeId)) {
    return null;
  }

  const attributes = graph.getNodeAttributes(nodeId) as NodeAttributes;
  return {
    id: nodeId,
    label: String(attributes.label || nodeId),
    content: String(attributes.content || attributes.label || nodeId),
    nodeType: attributes.nodeType || "entity",
    color: attributes.color,
    valid_from: attributes.valid_from ?? null,
    valid_until: attributes.valid_until ?? null,
    properties: attributes.properties ?? {},
    neighborCount: graph.neighbors(nodeId).length,
  };
}

function hasUsableCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

interface GraphRuntimeStageProps {
  snapshot: GraphDataSnapshot | null | undefined;
  selectedNodeId: string;
  activePath: GraphPath;
  onNodeSelect: (nodeId: string) => void;
  onSelectedNodeStateChange: (state: GraphSelectedNodeState | null) => void;
  isLayoutRunning: boolean;
  onLayoutRunningChange: (running: boolean) => void;
  viewMode: GraphViewMode;
  temporalTime: Date | null;
  onActiveNodeCountChange: (count: number | null) => void;
  onProgressChange: (progress: GraphLoadProgress | null) => void;
  onLayoutStatusChange: (status: GraphLayoutStatus) => void;
  onRuntimeReady: () => void;
}

export const GraphRuntimeStage = forwardRef<GraphStageHandle, GraphRuntimeStageProps>(
  function GraphRuntimeStage(
    {
      snapshot,
      selectedNodeId,
      activePath,
      onNodeSelect,
      onSelectedNodeStateChange,
      isLayoutRunning,
      onLayoutRunningChange,
      viewMode,
      temporalTime,
      onActiveNodeCountChange,
      onProgressChange,
      onLayoutStatusChange,
      onRuntimeReady,
    },
    ref,
  ) {
    const canvasRef = useRef<GraphCanvasHandle>(null);
    const prevActiveIdsRef = useRef<Set<string>>(new Set());
    const [graphVersion, setGraphVersion] = useState(0);
    const [runtimeLayoutSource, setRuntimeLayoutSource] = useState<GraphLayoutSource>(snapshot?.summary.layoutSource ?? "runtime");

    const stageSignature = useMemo(() => (snapshot ? `${snapshot.fetchedAt}:${snapshot.summary.nodeCount}:${snapshot.summary.edgeCount}` : null), [snapshot]);

    useImperativeHandle(ref, () => ({
      fitView: () => canvasRef.current?.fitView(),
      focusNode: (nodeId: string) => canvasRef.current?.focusNode(nodeId),
    }), []);

    useEffect(() => {
      let cancelled = false;

      async function hydrateSnapshot() {
        if (!snapshot) {
          return;
        }

        onProgressChange({
          phase: "styling",
          nodesLoaded: snapshot.summary.nodeCount,
          nodesTotal: snapshot.summary.nodeCount,
          edgesLoaded: snapshot.summary.edgeCount,
          edgesTotal: snapshot.summary.edgeCount,
          message: "Computing graph styling",
          progress: 0.88,
        });

        const degreeByNode = computeDegreeMap(snapshot.nodes, snapshot.edges);
        const pageRankByNode = computePageRank(snapshot.nodes, snapshot.edges);
        const nodeIndexById = new Map(snapshot.nodes.map((node, index) => [node.id, index]));
        const previousPositions = new Map<string, { x: number; y: number }>();

        graph.forEachNode((nodeId, attributes) => {
          const raw = attributes as Partial<NodeAttributes>;
          const x = Number(raw.x);
          const y = Number(raw.y);
          if (Number.isFinite(x) && Number.isFinite(y)) {
            previousPositions.set(nodeId, { x, y });
          }
        });

        let explicitCoordinateCount = 0;
        let carriedCoordinateCount = 0;
        const draftAttributes = snapshot.nodes.map((node) => {
          const previousPosition = previousPositions.get(node.id);
          const position = hasUsableCoordinate(node.x) && hasUsableCoordinate(node.y)
            ? { x: node.x, y: node.y }
            : previousPosition
              ? previousPosition
              : deterministicPosition(node.id, nodeIndexById.get(node.id) ?? 0, snapshot.nodes.length);

          if (hasUsableCoordinate(node.x) && hasUsableCoordinate(node.y)) {
            explicitCoordinateCount += 1;
          } else if (previousPosition) {
            carriedCoordinateCount += 1;
          }

          return {
            id: node.id,
            attributes: {
              label: node.content || node.id,
              x: position.x,
              y: position.y,
              nodeType: node.type,
              content: node.content,
              valid_from: node.valid_from,
              valid_until: node.valid_until,
              properties: node.properties,
            } as NodeAttributes,
          };
        });

        const layoutSource: GraphLayoutSource = explicitCoordinateCount > 0
          ? "provided"
          : carriedCoordinateCount > 0
            ? "carried"
            : "runtime";
        const hasCoordinates = explicitCoordinateCount > 0 || carriedCoordinateCount > 0;
        setRuntimeLayoutSource(layoutSource);

        const colorAccessor = chooseColorAccessor(draftAttributes);
        await yieldToMain();
        if (cancelled) {
          return;
        }

        onProgressChange({
          phase: "rendering",
          nodesLoaded: snapshot.summary.nodeCount,
          nodesTotal: snapshot.summary.nodeCount,
          edgesLoaded: snapshot.summary.edgeCount,
          edgesTotal: snapshot.summary.edgeCount,
          message: "Rendering graph",
          progress: 0.96,
        });

        const nodesToMerge = draftAttributes.map(({ id, attributes }) => {
          const colorKey = colorAccessor(id, attributes);
          const baseColor = colorForNodeKey(colorKey);
          const dynamicSize = computeNodeSize(id, degreeByNode, pageRankByNode);
          return {
            id,
            attributes: {
              ...attributes,
              color: baseColor,
              baseColor,
              size: dynamicSize,
              baseSize: dynamicSize,
              degree: degreeByNode.get(id) ?? 0,
              pageRank: pageRankByNode.get(id) ?? 0,
              glowColor: baseColor,
              borderColor: GRAPH_THEME.nodes.border,
              borderSize: 1,
            } as NodeAttributes,
          };
        });

        const edgesToMerge = snapshot.edges.map((edge) => ({
          source: edge.source,
          target: edge.target,
          attributes: {
            weight: edge.weight,
            edgeType: edge.type,
            properties: edge.properties,
            size: computeEdgeSize(edge.weight),
            baseSize: computeEdgeSize(edge.weight),
            color: GRAPH_THEME.edges.baseColor,
            baseColor: GRAPH_THEME.edges.baseColor,
          } as EdgeAttributes,
        }));

        clearGraph();
        batchMergeNodes(nodesToMerge);
        batchMergeEdges(edgesToMerge);
        prevActiveIdsRef.current = new Set(snapshot.nodes.map((node) => node.id));

        await yieldToMain();
        if (cancelled) {
          return;
        }

        onLayoutStatusChange({
          state: layoutSource === "runtime" ? "bootstrapping" : "interactive",
          source: layoutSource,
          hasCoordinates,
          layoutReady: layoutSource !== "runtime",
          displacement: null,
          elapsedMs: 0,
          stableSamples: 0,
        });

        onLayoutRunningChange(layoutSource === "runtime");
        if (selectedNodeId) {
          canvasRef.current?.focusNode(selectedNodeId);
        } else {
          canvasRef.current?.getSigma()?.refresh();
        }
        setGraphVersion((current) => current + 1);
        if (layoutSource !== "runtime") {
          onProgressChange(null);
        } else {
          onProgressChange({
            phase: "rendering",
            nodesLoaded: snapshot.summary.nodeCount,
            nodesTotal: snapshot.summary.nodeCount,
            edgesLoaded: snapshot.summary.edgeCount,
            edgesTotal: snapshot.summary.edgeCount,
            message: "Stabilizing full-graph layout",
            progress: 0.98,
          });
        }
        onRuntimeReady();
      }

      void hydrateSnapshot();
      return () => {
        cancelled = true;
      };
    }, [onLayoutRunningChange, onLayoutStatusChange, onProgressChange, onRuntimeReady, selectedNodeId, snapshot, stageSignature]);

    useEffect(() => {
      if (!selectedNodeId) {
        onSelectedNodeStateChange(null);
        return;
      }

      onSelectedNodeStateChange(buildSelectedNodeState(selectedNodeId));
    }, [graphVersion, onSelectedNodeStateChange, selectedNodeId, viewMode]);

    useEffect(() => {
      if (!snapshot || !temporalTime) {
        return;
      }

      let cancelled = false;

      const applySnapshot = async () => {
        try {
          const response = await fetch(`/api/temporal/snapshot?at=${encodeURIComponent(temporalTime.toISOString())}`);
          if (!response.ok || cancelled) {
            return;
          }

          const data: { active_node_ids: string[]; active_node_count: number } = await response.json();
          if (cancelled) {
            return;
          }

          const nextActiveIds = new Set(data.active_node_ids);
          requestAnimationFrame(() => {
            if (cancelled) {
              return;
            }

            const previous = prevActiveIdsRef.current;
            previous.forEach((id) => {
              if (!nextActiveIds.has(id) && graph.hasNode(id)) {
                graph.setNodeAttribute(id, "hidden", true);
              }
            });
            nextActiveIds.forEach((id) => {
              if (graph.hasNode(id)) {
                graph.setNodeAttribute(id, "hidden", false);
              }
            });

            prevActiveIdsRef.current = nextActiveIds;
            onActiveNodeCountChange(data.active_node_count);
            canvasRef.current?.getSigma()?.refresh();
          });
        } catch (error) {
          if (!cancelled) {
            console.error("[GraphRuntimeStage] temporal snapshot failed", error);
          }
        }
      };

      void applySnapshot();
      return () => {
        cancelled = true;
      };
    }, [onActiveNodeCountChange, snapshot, temporalTime]);

    useEffect(() => {
      const socket = new WebSocket(`${socketProtocol()}//${window.location.host}/ws/graph-updates`);

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.event === "connection_ack" || message.event !== "graph_mutation") {
            return;
          }

          const eventType = message.data?.event_type;
          const payload = message.data?.payload;
          if (eventType === "ADD_NODE" && payload?.id) {
            batchMergeNodes([
              {
                id: payload.id,
                attributes: {
                  label: payload.properties?.content || payload.id,
                  x: Number.isFinite(Number(payload.x ?? payload.properties?.x))
                    ? Number(payload.x ?? payload.properties?.x)
                    : deterministicPosition(payload.id, graph.order + 1, Math.max(graph.order + 1, 1)).x,
                  y: Number.isFinite(Number(payload.y ?? payload.properties?.y))
                    ? Number(payload.y ?? payload.properties?.y)
                    : deterministicPosition(payload.id, graph.order + 1, Math.max(graph.order + 1, 1)).y,
                  nodeType: payload.type,
                  content: payload.properties?.content || payload.id,
                  valid_from: payload.properties?.valid_from ?? null,
                  valid_until: payload.properties?.valid_until ?? null,
                  properties: payload.properties || {},
                  size: 8,
                  color: colorForNodeKey(`${payload.type || "entity"}:${payload.id}`),
                  baseColor: colorForNodeKey(`${payload.type || "entity"}:${payload.id}`),
                  baseSize: 8,
                  glowColor: colorForNodeKey(`${payload.type || "entity"}:${payload.id}`),
                  borderColor: GRAPH_THEME.nodes.border,
                  borderSize: 1,
                },
              },
            ]);
          }

          if (eventType === "ADD_EDGE" && payload?.source_id && payload?.target_id) {
            batchMergeEdges([
              {
                source: payload.source_id,
                target: payload.target_id,
                attributes: {
                  weight: Number(payload.weight ?? 1),
                  edgeType: payload.type,
                  properties: payload.properties || {},
                  size: computeEdgeSize(Number(payload.weight ?? 1)),
                  baseSize: computeEdgeSize(Number(payload.weight ?? 1)),
                  color: payload.properties?.inferred ? GRAPH_THEME.edges.pathColor : GRAPH_THEME.edges.baseColor,
                  baseColor: GRAPH_THEME.edges.baseColor,
                },
              },
            ]);
          }

          canvasRef.current?.getSigma()?.refresh();
          setGraphVersion((current) => current + 1);
        } catch (error) {
          console.error("[GraphRuntimeStage] websocket update failed", error);
        }
      };

      return () => {
        socket.close();
      };
    }, []);

    return (
      <GraphCanvas
        ref={canvasRef}
        onNodeClick={onNodeSelect}
        selectedNodeId={selectedNodeId}
        activePath={activePath}
        effectsState={STAGE_EFFECTS_STATE}
        isLayoutRunning={isLayoutRunning}
        onLayoutRunningChange={onLayoutRunningChange}
        layoutSource={runtimeLayoutSource}
        onLayoutStatusChange={onLayoutStatusChange}
        viewMode={viewMode}
      />
    );
  },
);
